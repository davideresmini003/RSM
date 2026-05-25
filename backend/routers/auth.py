import uuid
from fastapi import APIRouter, HTTPException, Request, Response, Depends
from database import db
from models import RegisterIn, LoginIn, CompanyIn
from security import get_current_user, create_token, hash_password, verify_password, set_token_cookie
from utils import now_iso, clean_doc, audit

router = APIRouter()


@router.post("/auth/register")
async def register(payload: RegisterIn, request: Request, response: Response):
    email = payload.email.lower()
    if payload.role not in ("cedente", "reasegurador", "broker"):
        raise HTTPException(status_code=400, detail="Rol inválido")
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "email": email,
        "password_hash": hash_password(payload.password),
        "name": payload.name,
        "role": payload.role,
        "company_id": None,
        "verified": False,
        "onboarding_complete": False,
        "created_at": now_iso(),
    }
    await db.users.insert_one(user_doc)
    token = create_token(user_id, email, payload.role)
    set_token_cookie(response, token)
    await audit("user.register", user_doc, "user", user_id, request=request)
    return {"token": token, "user": clean_doc(user_doc)}


@router.post("/auth/login")
async def login(payload: LoginIn, request: Request, response: Response):
    email = payload.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    token = create_token(user["id"], user["email"], user["role"])
    set_token_cookie(response, token)
    await audit("user.login", user, "user", user["id"], request=request)
    return {"token": token, "user": clean_doc(dict(user))}


@router.post("/auth/logout")
async def logout(response: Response, user: dict = Depends(get_current_user), request: Request = None):
    response.delete_cookie("access_token", path="/")
    await audit("user.logout", user, "user", user["id"], request=request)
    return {"ok": True}


@router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    company = None
    if user.get("company_id"):
        company = await db.companies.find_one({"id": user["company_id"]}, {"_id": 0})
    return {"user": user, "company": company}


@router.post("/onboarding/company")
async def create_company(payload: CompanyIn, request: Request, user: dict = Depends(get_current_user)):
    if user["role"] == "admin":
        raise HTTPException(status_code=400, detail="Admin has no company")
    existing = None
    if user.get("company_id"):
        existing = await db.companies.find_one({"id": user["company_id"]})
    company = {
        "id": existing["id"] if existing else str(uuid.uuid4()),
        "role": user["role"],
        "owner_user_id": user["id"],
        "verified": existing.get("verified", True) if existing else True,
        "created_at": existing.get("created_at") if existing else now_iso(),
        **payload.model_dump(),
    }
    await db.companies.replace_one({"id": company["id"]}, company, upsert=True)
    await db.users.update_one({"id": user["id"]}, {"$set": {"company_id": company["id"], "onboarding_complete": True}})
    await audit("company.upsert", user, "company", company["id"], request=request)
    return {"company": clean_doc(dict(company))}
