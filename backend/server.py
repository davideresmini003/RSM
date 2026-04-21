from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import logging
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr
import io

# ─── Config ──────────────────────────────────────────────────────────────
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days
ADMIN_EMAIL = os.environ.get('ADMIN_EMAIL', 'admin@rsm.eu')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'Admin123!')
DEMO_PASSWORD = os.environ.get('DEMO_PASSWORD', 'Demo123!')

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="RSM - Reinsurance Software Marketplace")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("rsm")

# ─── Helpers ─────────────────────────────────────────────────────────────
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), h.encode())
    except Exception:
        return False


def create_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])


def clean_doc(doc: dict) -> dict:
    if not doc:
        return doc
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    return doc


def anon_code() -> str:
    year = datetime.now(timezone.utc).year
    return f"RSM-{year}-{str(uuid.uuid4())[:4].upper()}"


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = decode_token(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    user.pop("password_hash", None)
    return user


def require_role(*roles: str):
    async def _dep(user: dict = Depends(get_current_user)):
        if user.get("role") not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return _dep


async def audit(action: str, user: dict, target_type: str = "", target_id: str = "", meta: dict = None, request: Request = None):
    entry = {
        "id": str(uuid.uuid4()),
        "action": action,
        "user_id": user.get("id"),
        "user_email": user.get("email"),
        "user_role": user.get("role"),
        "target_type": target_type,
        "target_id": target_id,
        "meta": meta or {},
        "ip": request.client.host if request else None,
        "timestamp": now_iso(),
    }
    await db.audit_log.insert_one(entry)


# ─── Models ──────────────────────────────────────────────────────────────
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str
    role: str  # cedente | reasegurador | broker


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class CompanyIn(BaseModel):
    name: str
    tax_id: str
    country: str
    address: str
    corporate_email: EmailStr
    phone: str
    legal_rep_name: str
    legal_rep_id: str
    legal_rep_role: str
    # reasegurador
    rating_agency: Optional[str] = None
    rating_value: Optional[str] = None
    # broker
    licenses: Optional[List[dict]] = None


class SubmissionPackIn(BaseModel):
    title: str
    branch: str
    reinsurance_type: str
    country_region: Optional[str] = ""
    coverage_period: Optional[str] = ""
    cession_pct: Optional[float] = 0
    broker_id: Optional[str] = None
    premiums_y1: Optional[float] = 0
    premiums_y2: Optional[float] = 0
    premiums_y3: Optional[float] = 0
    loss_ratio_y1: Optional[float] = 0
    loss_ratio_y2: Optional[float] = 0
    loss_ratio_y3: Optional[float] = 0
    description: Optional[str] = ""
    status: Optional[str] = "draft"  # draft | published | withdrawn


class InterestIn(BaseModel):
    pack_id: str
    message: Optional[str] = ""


class NcaSignIn(BaseModel):
    operation_id: str
    signer_name: str
    accepted: bool


class QuoteIn(BaseModel):
    operation_id: str
    reinsurance_type: str
    offered_share_pct: float
    ceding_commission_pct: Optional[float] = 0
    rate_on_line_pct: Optional[float] = 0
    attachment_point: Optional[float] = 0
    limit_eur: Optional[float] = 0
    estimated_premium_eur: Optional[float] = 0
    profit_commission_pct: Optional[float] = 0
    sliding_scale: Optional[bool] = False
    sliding_min: Optional[float] = 0
    sliding_max: Optional[float] = 0
    exclusions: Optional[str] = ""
    special_conditions: Optional[str] = ""
    expiry_date: Optional[str] = ""


class MessageIn(BaseModel):
    operation_id: str
    channel: str  # broker-cedente | broker-reasegurador | cedente-reasegurador
    text: str


class BrokerProfileIn(BaseModel):
    visible_in_marketplace: Optional[bool] = False
    availability: Optional[str] = "available"  # available | busy | unavailable
    bio: Optional[str] = ""
    founded_year: Optional[int] = None
    team_size: Optional[str] = ""
    branches: Optional[List[str]] = []
    services_cedentes: Optional[List[str]] = []
    services_reaseguradores: Optional[List[str]] = []
    geographic_zones: Optional[List[str]] = []
    program_range_min: Optional[float] = 0
    program_range_max: Optional[float] = 0
    languages: Optional[List[str]] = []
    linkedin_url: Optional[str] = ""
    website_url: Optional[str] = ""


class SolicitudIn(BaseModel):
    broker_id: str
    service: str
    program_type: Optional[str] = ""
    volume_eur: Optional[float] = 0
    geographic_zone: Optional[str] = ""
    message: Optional[str] = ""


class SolicitudActionIn(BaseModel):
    solicitud_id: str
    action: str  # accept | decline


class RatingIn(BaseModel):
    operation_id: str
    broker_id: str
    technical: int  # 1-5
    communication: int
    deadlines: int


class AdminVerifyIn(BaseModel):
    company_id: str
    verified: bool


# ─── Auth endpoints ──────────────────────────────────────────────────────
def _set_token_cookie(response: Response, token: str):
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )


@api.post("/auth/register")
async def register(payload: RegisterIn, request: Request, response: Response):
    email = payload.email.lower()
    if payload.role not in ("cedente", "reasegurador", "broker"):
        raise HTTPException(status_code=400, detail="Invalid role")
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
    _set_token_cookie(response, token)
    await audit("user.register", user_doc, "user", user_id, request=request)
    return {"token": token, "user": clean_doc(user_doc)}


@api.post("/auth/login")
async def login(payload: LoginIn, request: Request, response: Response):
    email = payload.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_token(user["id"], user["email"], user["role"])
    _set_token_cookie(response, token)
    await audit("user.login", user, "user", user["id"], request=request)
    return {"token": token, "user": clean_doc(dict(user))}


@api.post("/auth/logout")
async def logout(response: Response, user: dict = Depends(get_current_user), request: Request = None):
    response.delete_cookie("access_token", path="/")
    await audit("user.logout", user, "user", user["id"], request=request)
    return {"ok": True}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    # enrich with company
    company = None
    if user.get("company_id"):
        company = await db.companies.find_one({"id": user["company_id"]}, {"_id": 0})
    return {"user": user, "company": company}


# ─── Onboarding (create company) ─────────────────────────────────────────
@api.post("/onboarding/company")
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
        "verified": existing.get("verified", False) if existing else False,
        "created_at": existing.get("created_at") if existing else now_iso(),
        **payload.model_dump(),
    }
    await db.companies.replace_one({"id": company["id"]}, company, upsert=True)
    await db.users.update_one({"id": user["id"]}, {"$set": {"company_id": company["id"], "onboarding_complete": True}})
    await audit("company.upsert", user, "company", company["id"], request=request)
    return {"company": clean_doc(dict(company))}


# ─── Submission Packs ────────────────────────────────────────────────────
@api.post("/submission-packs")
async def create_pack(payload: SubmissionPackIn, request: Request, user: dict = Depends(require_role("cedente"))):
    if not user.get("company_id"):
        raise HTTPException(status_code=400, detail="Complete onboarding first")
    if payload.status == "published":
        company = await db.companies.find_one({"id": user["company_id"]})
        if not company or not company.get("verified"):
            raise HTTPException(status_code=403, detail="Company not verified — cannot publish")
        count = await db.submission_packs.count_documents({"cedente_user_id": user["id"], "status": "published"})
        if count >= 5:
            raise HTTPException(status_code=400, detail="Maximum 5 published packs")
    pack = {
        "id": str(uuid.uuid4()),
        "code": anon_code(),
        "cedente_user_id": user["id"],
        "cedente_company_id": user["company_id"],
        "created_at": now_iso(),
        "published_at": now_iso() if payload.status == "published" else None,
        **payload.model_dump(),
    }
    await db.submission_packs.insert_one(pack)
    await audit("pack.create", user, "pack", pack["id"], meta={"status": pack["status"]}, request=request)
    return {"pack": clean_doc(dict(pack))}


@api.get("/submission-packs/mine")
async def list_my_packs(user: dict = Depends(require_role("cedente"))):
    packs = await db.submission_packs.find({"cedente_user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    # enrich with interests count
    for p in packs:
        p["interests_count"] = await db.interests.count_documents({"pack_id": p["id"]})
        p["interests_pending"] = await db.interests.count_documents({"pack_id": p["id"], "status": "pending"})
    return {"packs": packs}


@api.get("/submission-packs/{pack_id}")
async def get_pack(pack_id: str, user: dict = Depends(get_current_user)):
    pack = await db.submission_packs.find_one({"id": pack_id}, {"_id": 0})
    if not pack:
        raise HTTPException(status_code=404)
    return {"pack": pack}


@api.put("/submission-packs/{pack_id}/status")
async def update_pack_status(pack_id: str, body: dict, request: Request, user: dict = Depends(require_role("cedente"))):
    new_status = body.get("status")
    pack = await db.submission_packs.find_one({"id": pack_id})
    if not pack or pack["cedente_user_id"] != user["id"]:
        raise HTTPException(status_code=404)
    if new_status == "published":
        company = await db.companies.find_one({"id": user["company_id"]})
        if not company or not company.get("verified"):
            raise HTTPException(status_code=403, detail="Company not verified")
    update = {"status": new_status}
    if new_status == "published":
        update["published_at"] = now_iso()
    await db.submission_packs.update_one({"id": pack_id}, {"$set": update})
    await audit(f"pack.{new_status}", user, "pack", pack_id, request=request)
    return {"ok": True}


@api.get("/marketplace/packs")
async def marketplace_packs(
    branch: Optional[str] = None,
    reinsurance_type: Optional[str] = None,
    country: Optional[str] = None,
    verified_only: Optional[bool] = False,
    has_broker: Optional[str] = None,  # all|with|without
    search: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    q: Dict[str, Any] = {"status": "published"}
    if branch:
        q["branch"] = branch
    if reinsurance_type:
        q["reinsurance_type"] = reinsurance_type
    if country:
        q["country_region"] = {"$regex": country, "$options": "i"}
    if has_broker == "with":
        q["broker_id"] = {"$ne": None}
    elif has_broker == "without":
        q["broker_id"] = None
    if search:
        q["$or"] = [
            {"code": {"$regex": search, "$options": "i"}},
            {"title": {"$regex": search, "$options": "i"}},
            {"country_region": {"$regex": search, "$options": "i"}},
        ]
    packs = await db.submission_packs.find(q, {"_id": 0}).sort("published_at", -1).to_list(200)
    # enrich anonymously + filter verified
    enriched = []
    for p in packs:
        company = await db.companies.find_one({"id": p["cedente_company_id"]}, {"_id": 0, "verified": 1})
        is_verified = bool(company and company.get("verified"))
        if verified_only and not is_verified:
            continue
        broker_name = None
        if p.get("broker_id"):
            bu = await db.users.find_one({"id": p["broker_id"]}, {"_id": 0})
            if bu and bu.get("company_id"):
                bc = await db.companies.find_one({"id": bu["company_id"]}, {"_id": 0, "name": 1})
                if bc:
                    broker_name = bc.get("name")
        interests_count = await db.interests.count_documents({"pack_id": p["id"]})
        # own interest state (if reasegurador)
        own_interest = None
        if user["role"] == "reasegurador":
            mi = await db.interests.find_one({"pack_id": p["id"], "reasegurador_user_id": user["id"]}, {"_id": 0})
            if mi:
                own_interest = mi.get("status")
        avg_lr = round(((p.get("loss_ratio_y1") or 0) + (p.get("loss_ratio_y2") or 0) + (p.get("loss_ratio_y3") or 0)) / 3, 1)
        enriched.append({
            "id": p["id"],
            "code": p["code"],
            "title": p["title"],
            "branch": p["branch"],
            "reinsurance_type": p["reinsurance_type"],
            "country_region": p.get("country_region"),
            "coverage_period": p.get("coverage_period"),
            "cession_pct": p.get("cession_pct"),
            "premiums_y1": p.get("premiums_y1"),
            "avg_loss_ratio": avg_lr,
            "verified": is_verified,
            "broker_name": broker_name,
            "interests_count": interests_count,
            "own_interest": own_interest,
            "published_at": p.get("published_at"),
        })
    return {"packs": enriched}


@api.get("/marketplace/packs/{pack_id}")
async def marketplace_pack_detail(pack_id: str, user: dict = Depends(get_current_user)):
    pack = await db.submission_packs.find_one({"id": pack_id, "status": "published"}, {"_id": 0})
    if not pack:
        raise HTTPException(status_code=404, detail="Pack not available")
    company = await db.companies.find_one({"id": pack["cedente_company_id"]}, {"_id": 0, "verified": 1, "country": 1})
    is_verified = bool(company and company.get("verified"))
    broker_name = None
    if pack.get("broker_id"):
        bu = await db.users.find_one({"id": pack["broker_id"]}, {"_id": 0})
        if bu and bu.get("company_id"):
            bc = await db.companies.find_one({"id": bu["company_id"]}, {"_id": 0, "name": 1})
            if bc:
                broker_name = bc.get("name")
    interests_count = await db.interests.count_documents({"pack_id": pack["id"]})
    own_interest = None
    if user["role"] == "reasegurador":
        mi = await db.interests.find_one({"pack_id": pack["id"], "reasegurador_user_id": user["id"]}, {"_id": 0})
        if mi:
            own_interest = mi.get("status")
    avg_lr = round(((pack.get("loss_ratio_y1") or 0) + (pack.get("loss_ratio_y2") or 0) + (pack.get("loss_ratio_y3") or 0)) / 3, 1)
    return {
        "pack": {
            "id": pack["id"],
            "code": pack["code"],
            "title": pack["title"],
            "branch": pack["branch"],
            "reinsurance_type": pack["reinsurance_type"],
            "country_region": pack.get("country_region"),
            "coverage_period": pack.get("coverage_period"),
            "cession_pct": pack.get("cession_pct"),
            "premiums_y1": pack.get("premiums_y1"),
            "premiums_y2": pack.get("premiums_y2"),
            "premiums_y3": pack.get("premiums_y3"),
            "loss_ratio_y1": pack.get("loss_ratio_y1"),
            "loss_ratio_y2": pack.get("loss_ratio_y2"),
            "loss_ratio_y3": pack.get("loss_ratio_y3"),
            "avg_loss_ratio": avg_lr,
            "description": pack.get("description"),
            "verified": is_verified,
            "cedente_country": company.get("country") if company else None,
            "broker_name": broker_name,
            "interests_count": interests_count,
            "own_interest": own_interest,
            "published_at": pack.get("published_at"),
        }
    }


# ─── Interests ───────────────────────────────────────────────────────────
@api.post("/interests")
async def express_interest(payload: InterestIn, request: Request, user: dict = Depends(require_role("reasegurador"))):
    pack = await db.submission_packs.find_one({"id": payload.pack_id, "status": "published"})
    if not pack:
        raise HTTPException(status_code=404, detail="Pack not available")
    exists = await db.interests.find_one({"pack_id": payload.pack_id, "reasegurador_user_id": user["id"]})
    if exists:
        raise HTTPException(status_code=400, detail="Already expressed interest")
    pending_count = await db.interests.count_documents({"reasegurador_user_id": user["id"], "status": "pending"})
    if pending_count >= 10:
        raise HTTPException(status_code=400, detail="Max 10 pending interests")
    interest = {
        "id": str(uuid.uuid4()),
        "pack_id": payload.pack_id,
        "cedente_user_id": pack["cedente_user_id"],
        "reasegurador_user_id": user["id"],
        "reasegurador_company_id": user["company_id"],
        "message": payload.message,
        "status": "pending",
        "created_at": now_iso(),
    }
    await db.interests.insert_one(interest)
    await audit("interest.express", user, "interest", interest["id"], request=request)
    return {"interest": clean_doc(dict(interest))}


@api.get("/interests/received")
async def interests_received(status: Optional[str] = None, user: dict = Depends(require_role("cedente"))):
    q = {"cedente_user_id": user["id"]}
    if status:
        q["status"] = status
    items = await db.interests.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    # enrich with pack info (anon reasegurador pre-NCA)
    for it in items:
        pack = await db.submission_packs.find_one({"id": it["pack_id"]}, {"_id": 0, "code": 1, "title": 1})
        it["pack"] = pack
    return {"items": items}


@api.get("/interests/mine")
async def interests_mine(user: dict = Depends(require_role("reasegurador"))):
    items = await db.interests.find({"reasegurador_user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    for it in items:
        pack = await db.submission_packs.find_one({"id": it["pack_id"]}, {"_id": 0, "code": 1, "title": 1})
        it["pack"] = pack
    return {"items": items}


@api.post("/interests/{interest_id}/respond")
async def respond_interest(interest_id: str, body: dict, request: Request, user: dict = Depends(require_role("cedente"))):
    action = body.get("action")  # accept | reject
    interest = await db.interests.find_one({"id": interest_id})
    if not interest or interest["cedente_user_id"] != user["id"]:
        raise HTTPException(status_code=404)
    if interest["status"] != "pending":
        raise HTTPException(status_code=400, detail="Already responded")
    if action == "reject":
        await db.interests.update_one({"id": interest_id}, {"$set": {"status": "rejected"}})
        await audit("interest.reject", user, "interest", interest_id, request=request)
        return {"ok": True}
    if action != "accept":
        raise HTTPException(status_code=400, detail="Invalid action")
    # Accept → create Operation + NCA
    pack = await db.submission_packs.find_one({"id": interest["pack_id"]})
    operation = {
        "id": str(uuid.uuid4()),
        "code": "OP-" + str(uuid.uuid4())[:6].upper(),
        "pack_id": pack["id"],
        "pack_code": pack["code"],
        "cedente_user_id": interest["cedente_user_id"],
        "cedente_company_id": pack["cedente_company_id"],
        "reasegurador_user_id": interest["reasegurador_user_id"],
        "reasegurador_company_id": interest["reasegurador_company_id"],
        "broker_user_id": None,
        "broker_company_id": None,
        "state": "nca_pending",
        "nca_signed_cedente": False,
        "nca_signed_reasegurador": False,
        "nca_signed_at_cedente": None,
        "nca_signed_at_reasegurador": None,
        "quote_id": None,
        "contract_id": None,
        "suspended": False,
        "created_at": now_iso(),
        "closed_at": None,
    }
    # broker if pack has one
    if pack.get("broker_id"):
        broker_user = await db.users.find_one({"id": pack["broker_id"]})
        if broker_user:
            operation["broker_user_id"] = broker_user["id"]
            operation["broker_company_id"] = broker_user.get("company_id")
    await db.operations.insert_one(operation)
    await db.interests.update_one({"id": interest_id}, {"$set": {"status": "accepted", "operation_id": operation["id"]}})
    await audit("interest.accept", user, "interest", interest_id, meta={"operation_id": operation["id"]}, request=request)
    await audit("operation.create", user, "operation", operation["id"], request=request)
    return {"ok": True, "operation_id": operation["id"]}


# ─── Operations ──────────────────────────────────────────────────────────
def _operation_visibility(op: dict, user: dict) -> dict:
    """Apply anonymity rules to an operation for a given user."""
    both_signed = op.get("nca_signed_cedente") and op.get("nca_signed_reasegurador")
    op = dict(op)
    op["revealed"] = bool(both_signed)
    if user["role"] == "admin":
        op["revealed"] = True
    return op


@api.get("/operations")
async def list_operations(user: dict = Depends(get_current_user)):
    q = {}
    if user["role"] == "cedente":
        q["cedente_user_id"] = user["id"]
    elif user["role"] == "reasegurador":
        q["reasegurador_user_id"] = user["id"]
    elif user["role"] == "broker":
        q["broker_user_id"] = user["id"]
    elif user["role"] == "admin":
        pass
    else:
        raise HTTPException(status_code=403)
    ops = await db.operations.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    out = []
    for op in ops:
        op = _operation_visibility(op, user)
        # counterparty name depending on role + reveal
        cedente_co = await db.companies.find_one({"id": op["cedente_company_id"]}, {"_id": 0, "name": 1})
        rea_co = await db.companies.find_one({"id": op["reasegurador_company_id"]}, {"_id": 0, "name": 1})
        op["cedente_name"] = cedente_co.get("name") if cedente_co else None
        op["reasegurador_name"] = rea_co.get("name") if rea_co else None
        out.append(op)
    return {"operations": out}


@api.get("/operations/{op_id}")
async def get_operation(op_id: str, user: dict = Depends(get_current_user)):
    op = await db.operations.find_one({"id": op_id}, {"_id": 0})
    if not op:
        raise HTTPException(status_code=404)
    # authorization
    allowed = (
        user["role"] == "admin"
        or op["cedente_user_id"] == user["id"]
        or op["reasegurador_user_id"] == user["id"]
        or op.get("broker_user_id") == user["id"]
    )
    if not allowed:
        raise HTTPException(status_code=403)
    op = _operation_visibility(op, user)
    cedente_co = await db.companies.find_one({"id": op["cedente_company_id"]}, {"_id": 0})
    rea_co = await db.companies.find_one({"id": op["reasegurador_company_id"]}, {"_id": 0})
    op["cedente_company"] = clean_doc(dict(cedente_co)) if cedente_co else None
    op["reasegurador_company"] = clean_doc(dict(rea_co)) if rea_co else None
    # pack
    pack = await db.submission_packs.find_one({"id": op["pack_id"]}, {"_id": 0})
    op["pack"] = pack
    # quote
    quote = None
    if op.get("quote_id"):
        quote = await db.quotes.find_one({"id": op["quote_id"]}, {"_id": 0})
    op["quote"] = quote
    # contract
    contract = None
    if op.get("contract_id"):
        contract = await db.contracts.find_one({"id": op["contract_id"]}, {"_id": 0})
    op["contract"] = contract
    return {"operation": op}


@api.post("/operations/{op_id}/sign-nca")
async def sign_nca(op_id: str, payload: NcaSignIn, request: Request, user: dict = Depends(get_current_user)):
    if not payload.accepted:
        raise HTTPException(status_code=400, detail="Must accept NCA")
    op = await db.operations.find_one({"id": op_id})
    if not op:
        raise HTTPException(status_code=404)
    update = {}
    if op["cedente_user_id"] == user["id"] and not op.get("nca_signed_cedente"):
        update["nca_signed_cedente"] = True
        update["nca_signed_at_cedente"] = now_iso()
        update["nca_signer_cedente"] = payload.signer_name
    elif op["reasegurador_user_id"] == user["id"] and not op.get("nca_signed_reasegurador"):
        update["nca_signed_reasegurador"] = True
        update["nca_signed_at_reasegurador"] = now_iso()
        update["nca_signer_reasegurador"] = payload.signer_name
    else:
        raise HTTPException(status_code=400, detail="Not allowed or already signed")
    # state transition
    new_cedente_signed = update.get("nca_signed_cedente", op.get("nca_signed_cedente"))
    new_rea_signed = update.get("nca_signed_reasegurador", op.get("nca_signed_reasegurador"))
    if new_cedente_signed and new_rea_signed:
        update["state"] = "quote_pending"
    await db.operations.update_one({"id": op_id}, {"$set": update})
    await audit("nca.sign", user, "operation", op_id, meta={"signer": payload.signer_name}, request=request)
    return {"ok": True}


@api.post("/operations/{op_id}/quote")
async def submit_quote(op_id: str, payload: QuoteIn, request: Request, user: dict = Depends(require_role("reasegurador"))):
    op = await db.operations.find_one({"id": op_id})
    if not op or op["reasegurador_user_id"] != user["id"]:
        raise HTTPException(status_code=404)
    if not (op.get("nca_signed_cedente") and op.get("nca_signed_reasegurador")):
        raise HTTPException(status_code=400, detail="NCA not fully signed")
    if op.get("quote_id"):
        raise HTTPException(status_code=400, detail="Quote already submitted")
    quote = {
        "id": str(uuid.uuid4()),
        "operation_id": op_id,
        "reasegurador_user_id": user["id"],
        "created_at": now_iso(),
        "accepted": False,
        "accepted_at": None,
        **payload.model_dump(),
    }
    await db.quotes.insert_one(quote)
    await db.operations.update_one({"id": op_id}, {"$set": {"quote_id": quote["id"], "state": "quote_received"}})
    await audit("quote.submit", user, "operation", op_id, request=request)
    return {"quote": clean_doc(dict(quote))}


@api.post("/operations/{op_id}/accept-quote")
async def accept_quote(op_id: str, request: Request, user: dict = Depends(require_role("cedente"))):
    op = await db.operations.find_one({"id": op_id})
    if not op or op["cedente_user_id"] != user["id"]:
        raise HTTPException(status_code=404)
    if not op.get("quote_id"):
        raise HTTPException(status_code=400, detail="No quote")
    await db.quotes.update_one({"id": op["quote_id"]}, {"$set": {"accepted": True, "accepted_at": now_iso()}})
    # auto-create contract
    contract = {
        "id": str(uuid.uuid4()),
        "operation_id": op_id,
        "quote_id": op["quote_id"],
        "created_at": now_iso(),
        "signed_cedente": False,
        "signed_reasegurador": False,
    }
    await db.contracts.insert_one(contract)
    await db.operations.update_one({"id": op_id}, {"$set": {"state": "contract_pending", "contract_id": contract["id"]}})
    await audit("quote.accept", user, "operation", op_id, request=request)
    return {"ok": True, "contract_id": contract["id"]}


@api.post("/operations/{op_id}/sign-contract")
async def sign_contract(op_id: str, payload: NcaSignIn, request: Request, user: dict = Depends(get_current_user)):
    op = await db.operations.find_one({"id": op_id})
    if not op or not op.get("contract_id"):
        raise HTTPException(status_code=404)
    update = {}
    if op["cedente_user_id"] == user["id"]:
        update["signed_cedente"] = True
        update["signed_at_cedente"] = now_iso()
        update["signer_cedente"] = payload.signer_name
    elif op["reasegurador_user_id"] == user["id"]:
        update["signed_reasegurador"] = True
        update["signed_at_reasegurador"] = now_iso()
        update["signer_reasegurador"] = payload.signer_name
    else:
        raise HTTPException(status_code=403)
    await db.contracts.update_one({"id": op["contract_id"]}, {"$set": update})
    contract = await db.contracts.find_one({"id": op["contract_id"]})
    if contract.get("signed_cedente") and contract.get("signed_reasegurador"):
        await db.operations.update_one({"id": op_id}, {"$set": {"state": "closed", "closed_at": now_iso()}})
    await audit("contract.sign", user, "operation", op_id, request=request)
    return {"ok": True}


# ─── Messages ────────────────────────────────────────────────────────────
@api.get("/messages/{op_id}")
async def get_messages(op_id: str, channel: str, user: dict = Depends(get_current_user)):
    op = await db.operations.find_one({"id": op_id})
    if not op:
        raise HTTPException(status_code=404)
    allowed = (
        user["role"] == "admin"
        or op["cedente_user_id"] == user["id"]
        or op["reasegurador_user_id"] == user["id"]
        or op.get("broker_user_id") == user["id"]
    )
    if not allowed:
        raise HTTPException(status_code=403)
    # channel visibility
    role = user["role"]
    allowed_channels = set()
    if op.get("broker_user_id"):
        if role == "cedente":
            allowed_channels = {"broker-cedente"}
        elif role == "reasegurador":
            allowed_channels = {"broker-reasegurador"}
        elif role == "broker":
            allowed_channels = {"broker-cedente", "broker-reasegurador"}
        else:
            allowed_channels = {"broker-cedente", "broker-reasegurador"}
    else:
        allowed_channels = {"cedente-reasegurador"}
    if channel not in allowed_channels:
        raise HTTPException(status_code=403, detail="Channel not available")
    if not (op.get("nca_signed_cedente") and op.get("nca_signed_reasegurador")):
        return {"messages": [], "locked": True}
    msgs = await db.messages.find({"operation_id": op_id, "channel": channel}, {"_id": 0}).sort("created_at", 1).to_list(500)
    return {"messages": msgs, "locked": False}


@api.post("/messages")
async def send_message(payload: MessageIn, request: Request, user: dict = Depends(get_current_user)):
    op = await db.operations.find_one({"id": payload.operation_id})
    if not op:
        raise HTTPException(status_code=404)
    if not (op.get("nca_signed_cedente") and op.get("nca_signed_reasegurador")):
        raise HTTPException(status_code=400, detail="NCA not signed")
    role = user["role"]
    channel = payload.channel
    # allowed sender per channel
    if channel == "broker-cedente":
        if user["id"] not in (op.get("broker_user_id"), op["cedente_user_id"]):
            raise HTTPException(status_code=403)
    elif channel == "broker-reasegurador":
        if user["id"] not in (op.get("broker_user_id"), op["reasegurador_user_id"]):
            raise HTTPException(status_code=403)
    elif channel == "cedente-reasegurador":
        if user["id"] not in (op["cedente_user_id"], op["reasegurador_user_id"]):
            raise HTTPException(status_code=403)
    else:
        raise HTTPException(status_code=400)
    msg = {
        "id": str(uuid.uuid4()),
        "operation_id": payload.operation_id,
        "channel": channel,
        "sender_id": user["id"],
        "sender_role": role,
        "sender_name": user.get("name"),
        "text": payload.text,
        "created_at": now_iso(),
    }
    await db.messages.insert_one(msg)
    await audit("message.send", user, "operation", payload.operation_id, meta={"channel": channel}, request=request)
    return {"message": clean_doc(dict(msg))}


# ─── Broker profile & marketplace ────────────────────────────────────────
@api.put("/broker/profile")
async def upsert_broker_profile(payload: BrokerProfileIn, request: Request, user: dict = Depends(require_role("broker"))):
    doc = {
        "user_id": user["id"],
        "company_id": user.get("company_id"),
        **payload.model_dump(),
        "updated_at": now_iso(),
    }
    await db.broker_profiles.replace_one({"user_id": user["id"]}, doc, upsert=True)
    await audit("broker_profile.update", user, "broker_profile", user["id"], request=request)
    return {"ok": True}


@api.get("/broker/profile/me")
async def my_broker_profile(user: dict = Depends(require_role("broker"))):
    p = await db.broker_profiles.find_one({"user_id": user["id"]}, {"_id": 0})
    return {"profile": p}


@api.get("/marketplace/brokers")
async def marketplace_brokers(user: dict = Depends(get_current_user)):
    profiles = await db.broker_profiles.find({"visible_in_marketplace": True}, {"_id": 0}).to_list(200)
    result = []
    for p in profiles:
        u = await db.users.find_one({"id": p["user_id"]}, {"_id": 0})
        c = await db.companies.find_one({"id": p.get("company_id")}, {"_id": 0})
        if not u or not c or not c.get("verified"):
            continue
        # avg rating
        ratings = await db.ratings.find({"broker_id": p["user_id"], "approved": True}, {"_id": 0}).to_list(500)
        avg = None
        if ratings:
            total = sum((r["technical"] + r["communication"] + r["deadlines"]) / 3 for r in ratings)
            avg = round(total / len(ratings), 1)
        result.append({
            **p,
            "broker_user_id": p["user_id"],
            "broker_name": u.get("name"),
            "company_name": c.get("name"),
            "country": c.get("country"),
            "rating_avg": avg,
            "ratings_count": len(ratings),
        })
    return {"brokers": result}


@api.get("/broker/{broker_id}")
async def broker_public_profile(broker_id: str, user: dict = Depends(get_current_user)):
    p = await db.broker_profiles.find_one({"user_id": broker_id}, {"_id": 0})
    u = await db.users.find_one({"id": broker_id}, {"_id": 0})
    c = await db.companies.find_one({"id": p.get("company_id") if p else None}, {"_id": 0}) if p else None
    if not p or not u or not c:
        raise HTTPException(status_code=404)
    ratings = await db.ratings.find({"broker_id": broker_id, "approved": True}, {"_id": 0}).to_list(500)
    return {
        "profile": p,
        "broker_name": u.get("name"),
        "company": clean_doc(dict(c)) if c else None,
        "ratings": ratings,
    }


# ─── Solicitudes / Mandates ──────────────────────────────────────────────
@api.post("/solicitudes")
async def create_solicitud(payload: SolicitudIn, request: Request, user: dict = Depends(get_current_user)):
    if user["role"] not in ("cedente", "reasegurador"):
        raise HTTPException(status_code=403)
    broker_user = await db.users.find_one({"id": payload.broker_id, "role": "broker"})
    if not broker_user:
        raise HTTPException(status_code=404, detail="Broker not found")
    sol = {
        "id": str(uuid.uuid4()),
        "broker_id": payload.broker_id,
        "requester_id": user["id"],
        "requester_role": user["role"],
        "requester_country": (await db.companies.find_one({"id": user.get("company_id")}, {"_id": 0, "country": 1}) or {}).get("country"),
        "service": payload.service,
        "program_type": payload.program_type,
        "volume_eur": payload.volume_eur,
        "geographic_zone": payload.geographic_zone,
        "message": payload.message,
        "status": "pending",
        "created_at": now_iso(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
    }
    await db.solicitudes.insert_one(sol)
    await audit("solicitud.create", user, "solicitud", sol["id"], request=request)
    return {"solicitud": clean_doc(dict(sol))}


@api.get("/solicitudes/broker")
async def solicitudes_for_broker(user: dict = Depends(require_role("broker"))):
    items = await db.solicitudes.find({"broker_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"items": items}


@api.get("/solicitudes/mine")
async def my_solicitudes(user: dict = Depends(get_current_user)):
    items = await db.solicitudes.find({"requester_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"items": items}


@api.post("/solicitudes/{sol_id}/action")
async def solicitud_action(sol_id: str, body: dict, request: Request, user: dict = Depends(require_role("broker"))):
    sol = await db.solicitudes.find_one({"id": sol_id})
    if not sol or sol["broker_id"] != user["id"]:
        raise HTTPException(status_code=404)
    action = body.get("action")
    if action == "decline":
        await db.solicitudes.update_one({"id": sol_id}, {"$set": {"status": "declined"}})
        await audit("solicitud.decline", user, "solicitud", sol_id, request=request)
        return {"ok": True}
    if action == "accept":
        update = {"status": "accepted"}
        if sol["requester_role"] == "cedente":
            # create mandate with NCA pending
            mandate = {
                "id": str(uuid.uuid4()),
                "broker_id": user["id"],
                "cedente_user_id": sol["requester_id"],
                "cedente_company_id": (await db.users.find_one({"id": sol["requester_id"]}, {"_id": 0, "company_id": 1}) or {}).get("company_id"),
                "nca_signed_broker": False,
                "nca_signed_cedente": False,
                "status": "pending",
                "created_at": now_iso(),
            }
            await db.mandates.insert_one(mandate)
            update["mandate_id"] = mandate["id"]
        await db.solicitudes.update_one({"id": sol_id}, {"$set": update})
        await audit("solicitud.accept", user, "solicitud", sol_id, request=request)
        return {"ok": True, "mandate_id": update.get("mandate_id")}
    raise HTTPException(status_code=400)


@api.get("/mandates")
async def list_mandates(user: dict = Depends(get_current_user)):
    if user["role"] == "broker":
        q = {"broker_id": user["id"]}
    elif user["role"] == "cedente":
        q = {"cedente_user_id": user["id"]}
    else:
        raise HTTPException(status_code=403)
    items = await db.mandates.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    # enrich
    for m in items:
        m["nca_both_signed"] = bool(m.get("nca_signed_broker") and m.get("nca_signed_cedente"))
        if m["nca_both_signed"]:
            c = await db.companies.find_one({"id": m.get("cedente_company_id")}, {"_id": 0, "name": 1})
            b = await db.users.find_one({"id": m["broker_id"]}, {"_id": 0, "name": 1})
            m["cedente_name"] = c.get("name") if c else None
            m["broker_name"] = b.get("name") if b else None
    return {"mandates": items}


@api.post("/mandates/{mandate_id}/sign")
async def sign_mandate(mandate_id: str, body: dict, request: Request, user: dict = Depends(get_current_user)):
    m = await db.mandates.find_one({"id": mandate_id})
    if not m:
        raise HTTPException(status_code=404)
    update = {}
    if user["id"] == m["broker_id"]:
        update["nca_signed_broker"] = True
        update["nca_signed_at_broker"] = now_iso()
    elif user["id"] == m["cedente_user_id"]:
        update["nca_signed_cedente"] = True
        update["nca_signed_at_cedente"] = now_iso()
    else:
        raise HTTPException(status_code=403)
    update["signer_name"] = body.get("signer_name")
    await db.mandates.update_one({"id": mandate_id}, {"$set": update})
    updated = await db.mandates.find_one({"id": mandate_id})
    if updated.get("nca_signed_broker") and updated.get("nca_signed_cedente"):
        await db.mandates.update_one({"id": mandate_id}, {"$set": {"status": "active"}})
    await audit("mandate.sign", user, "mandate", mandate_id, request=request)
    return {"ok": True}


# ─── Ratings ─────────────────────────────────────────────────────────────
@api.post("/ratings")
async def create_rating(payload: RatingIn, request: Request, user: dict = Depends(require_role("cedente"))):
    op = await db.operations.find_one({"id": payload.operation_id})
    if not op or op["cedente_user_id"] != user["id"] or op["state"] != "closed":
        raise HTTPException(status_code=400, detail="Can only rate closed operations you owned")
    if not op.get("broker_user_id") or op["broker_user_id"] != payload.broker_id:
        raise HTTPException(status_code=400, detail="Broker not part of this operation")
    existing = await db.ratings.find_one({"operation_id": payload.operation_id, "rater_id": user["id"]})
    if existing:
        raise HTTPException(status_code=400, detail="Already rated")
    r = {
        "id": str(uuid.uuid4()),
        "operation_id": payload.operation_id,
        "broker_id": payload.broker_id,
        "rater_id": user["id"],
        "technical": max(1, min(5, payload.technical)),
        "communication": max(1, min(5, payload.communication)),
        "deadlines": max(1, min(5, payload.deadlines)),
        "approved": True,  # auto-approved in MVP
        "created_at": now_iso(),
    }
    await db.ratings.insert_one(r)
    await audit("rating.create", user, "broker", payload.broker_id, request=request)
    return {"ok": True}


# ─── Stats / Dashboard ───────────────────────────────────────────────────
@api.get("/stats/dashboard")
async def dashboard_stats(user: dict = Depends(get_current_user)):
    role = user["role"]
    if role == "cedente":
        published = await db.submission_packs.count_documents({"cedente_user_id": user["id"], "status": "published"})
        interests_pending = await db.interests.count_documents({"cedente_user_id": user["id"], "status": "pending"})
        active_ops = await db.operations.count_documents({"cedente_user_id": user["id"], "state": {"$nin": ["closed", "cancelled"]}})
        # NCAs pending: operations where cedente hasn't signed yet
        nca_pending = await db.operations.count_documents({"cedente_user_id": user["id"], "nca_signed_cedente": False, "state": "nca_pending"})
        return {"published": published, "interests_pending": interests_pending, "active_ops": active_ops, "nca_pending": nca_pending}
    if role == "reasegurador":
        available = await db.submission_packs.count_documents({"status": "published"})
        interests = await db.interests.count_documents({"reasegurador_user_id": user["id"]})
        active_ops = await db.operations.count_documents({"reasegurador_user_id": user["id"], "state": {"$nin": ["closed", "cancelled"]}})
        quotes_sent = await db.quotes.count_documents({"reasegurador_user_id": user["id"]})
        return {"available": available, "interests": interests, "active_ops": active_ops, "quotes_sent": quotes_sent}
    if role == "broker":
        pending_sol = await db.solicitudes.count_documents({"broker_id": user["id"], "status": "pending"})
        active_mandates = await db.mandates.count_documents({"broker_id": user["id"], "status": "active"})
        ops_active = await db.operations.count_documents({"broker_user_id": user["id"], "state": {"$nin": ["closed", "cancelled"]}})
        ratings = await db.ratings.find({"broker_id": user["id"], "approved": True}, {"_id": 0}).to_list(500)
        avg = None
        if ratings:
            avg = round(sum((r["technical"] + r["communication"] + r["deadlines"]) / 3 for r in ratings) / len(ratings), 1)
        return {"pending_sol": pending_sol, "active_mandates": active_mandates, "ops_active": ops_active, "rating_avg": avg or 0}
    if role == "admin":
        users_count = await db.users.count_documents({})
        companies_count = await db.companies.count_documents({})
        pending_verif = await db.companies.count_documents({"verified": False})
        active_ops = await db.operations.count_documents({"state": {"$nin": ["closed", "cancelled"]}})
        return {"users": users_count, "companies": companies_count, "pending_verif": pending_verif, "active_ops": active_ops}
    return {}


# ─── Admin ───────────────────────────────────────────────────────────────
@api.get("/admin/companies")
async def admin_companies(user: dict = Depends(require_role("admin"))):
    items = await db.companies.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"companies": items}


@api.post("/admin/companies/verify")
async def admin_verify(payload: AdminVerifyIn, request: Request, user: dict = Depends(require_role("admin"))):
    await db.companies.update_one({"id": payload.company_id}, {"$set": {"verified": payload.verified, "verified_at": now_iso()}})
    # also mark user as verified
    company = await db.companies.find_one({"id": payload.company_id})
    if company:
        await db.users.update_one({"id": company["owner_user_id"]}, {"$set": {"verified": payload.verified}})
    await audit("admin.verify_company", user, "company", payload.company_id, meta={"verified": payload.verified}, request=request)
    return {"ok": True}


@api.get("/admin/audit")
async def admin_audit(limit: int = 200, user: dict = Depends(require_role("admin"))):
    items = await db.audit_log.find({}, {"_id": 0}).sort("timestamp", -1).to_list(limit)
    return {"items": items}


@api.post("/admin/operations/{op_id}/suspend")
async def admin_suspend(op_id: str, body: dict, request: Request, user: dict = Depends(require_role("admin"))):
    suspend = bool(body.get("suspend", True))
    await db.operations.update_one({"id": op_id}, {"$set": {"suspended": suspend, "suspend_reason": body.get("reason", "")}})
    await audit("admin.suspend_op", user, "operation", op_id, meta={"suspend": suspend}, request=request)
    return {"ok": True}


# ─── Startup seeding ─────────────────────────────────────────────────────
async def _ensure_demo_user(email: str, name: str, role: str, company: dict):
    u = await db.users.find_one({"email": email})
    if not u:
        user_id = str(uuid.uuid4())
        company_id = str(uuid.uuid4())
        await db.companies.insert_one({
            "id": company_id,
            "role": role,
            "owner_user_id": user_id,
            "verified": True,
            "created_at": now_iso(),
            **company,
        })
        await db.users.insert_one({
            "id": user_id,
            "email": email,
            "password_hash": hash_password(DEMO_PASSWORD),
            "name": name,
            "role": role,
            "company_id": company_id,
            "verified": True,
            "onboarding_complete": True,
            "created_at": now_iso(),
        })
        log.info(f"Seeded demo user: {email}")
    else:
        # keep password in sync with env
        if not verify_password(DEMO_PASSWORD, u["password_hash"]):
            await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_password(DEMO_PASSWORD)}})


@app.on_event("startup")
async def on_startup():
    # Indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.companies.create_index("id", unique=True)
    await db.submission_packs.create_index("id", unique=True)
    await db.operations.create_index("id", unique=True)
    await db.audit_log.create_index("timestamp")

    # Admin
    admin = await db.users.find_one({"email": ADMIN_EMAIL})
    if not admin:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": ADMIN_EMAIL,
            "password_hash": hash_password(ADMIN_PASSWORD),
            "name": "RSM Admin",
            "role": "admin",
            "company_id": None,
            "verified": True,
            "onboarding_complete": True,
            "created_at": now_iso(),
        })
        log.info(f"Seeded admin: {ADMIN_EMAIL}")
    else:
        if not verify_password(ADMIN_PASSWORD, admin["password_hash"]):
            await db.users.update_one({"email": ADMIN_EMAIL}, {"$set": {"password_hash": hash_password(ADMIN_PASSWORD)}})

    # Demo users + companies
    await _ensure_demo_user(
        "cedente@demo.eu", "Carla Demo",
        "cedente",
        {
            "name": "AseguradoraIbérica Demo S.A.",
            "tax_id": "A12345678",
            "country": "España",
            "address": "Paseo de la Castellana 100, Madrid",
            "corporate_email": "cedente@demo.eu",
            "phone": "+34 900 000 001",
            "legal_rep_name": "Carla Demo",
            "legal_rep_id": "00000001A",
            "legal_rep_role": "Directora de Reaseguro",
        },
    )
    await _ensure_demo_user(
        "reasegurador@demo.eu", "Roberto Demo",
        "reasegurador",
        {
            "name": "Helvetia Re Demo AG",
            "tax_id": "CHE123456789",
            "country": "Suiza",
            "address": "Bahnhofstrasse 1, Zürich",
            "corporate_email": "reasegurador@demo.eu",
            "phone": "+41 44 000 0002",
            "legal_rep_name": "Roberto Demo",
            "legal_rep_id": "R0000002",
            "legal_rep_role": "Head of Underwriting",
            "rating_agency": "AM Best",
            "rating_value": "A+",
        },
    )
    await _ensure_demo_user(
        "broker@demo.eu", "Beatriz Demo",
        "broker",
        {
            "name": "Aon Iberia Broker Demo",
            "tax_id": "B87654321",
            "country": "España",
            "address": "Calle Serrano 55, Madrid",
            "corporate_email": "broker@demo.eu",
            "phone": "+34 900 000 003",
            "legal_rep_name": "Beatriz Demo",
            "legal_rep_id": "00000003B",
            "legal_rep_role": "Managing Director",
            "licenses": [{"country": "España", "authority": "DGSFP", "number": "B-2025-0099", "type": "Broker Reaseguro"}],
        },
    )
    # Seed a broker profile for the demo broker
    broker_user = await db.users.find_one({"email": "broker@demo.eu"})
    if broker_user:
        existing_profile = await db.broker_profiles.find_one({"user_id": broker_user["id"]})
        if not existing_profile:
            await db.broker_profiles.insert_one({
                "user_id": broker_user["id"],
                "company_id": broker_user["company_id"],
                "visible_in_marketplace": True,
                "availability": "available",
                "bio": "Broker especializado en Property Cat y Casualty en Península Ibérica y Latinoamérica. 15 años de experiencia.",
                "founded_year": 2010,
                "team_size": "6-20",
                "branches": ["Property Cat", "Property No-Cat", "RC General", "Casualty"],
                "services_cedentes": ["Gestión programa", "Acceso mercados", "Due Diligence"],
                "services_reaseguradores": ["Asesoramiento técnico", "Due Diligence cedente"],
                "geographic_zones": ["Península Ibérica", "Latinoamérica"],
                "program_range_min": 1000000,
                "program_range_max": 100000000,
                "languages": ["ES", "EN", "PT"],
                "linkedin_url": "https://linkedin.com/in/demo-broker",
                "website_url": "https://aon-demo.com",
                "updated_at": now_iso(),
            })

    # Seed demo Submission Packs so the marketplace is never empty
    cedente_user = await db.users.find_one({"email": "cedente@demo.eu"})
    if cedente_user:
        existing_pack = await db.submission_packs.find_one({"cedente_user_id": cedente_user["id"]})
        if not existing_pack:
            demo_packs = [
                {
                    "title": "XL Property Cat España 2026",
                    "branch": "Property",
                    "reinsurance_type": "Excess of Loss",
                    "country_region": "España",
                    "coverage_period": "01/01/2026 – 31/12/2026",
                    "cession_pct": 30,
                    "premiums_y1": 15000000, "premiums_y2": 13500000, "premiums_y3": 12800000,
                    "loss_ratio_y1": 62, "loss_ratio_y2": 58, "loss_ratio_y3": 65,
                    "description": "Cartera Property Cat diversificada en Península Ibérica. Exposición principal Cataluña, Madrid y Valencia. Sin siniestros catastróficos en últimos 5 años. Retención de 2M€ por siniestro. Programa renovado anualmente, busca reasegurador estable con rating mínimo A.",
                    "broker_id": None,
                },
                {
                    "title": "Quota Share Motor Flota Iberia",
                    "branch": "Motor",
                    "reinsurance_type": "Quota Share",
                    "country_region": "España · Portugal",
                    "coverage_period": "01/04/2026 – 31/03/2027",
                    "cession_pct": 40,
                    "premiums_y1": 42000000, "premiums_y2": 39000000, "premiums_y3": 36500000,
                    "loss_ratio_y1": 71, "loss_ratio_y2": 68, "loss_ratio_y3": 74,
                    "description": "Quota share proporcional sobre cartera de flotas corporativas en Iberia. 350.000 vehículos. Comisión de cesión objetivo 27-30%.",
                    "broker_id": broker_user["id"] if broker_user else None,
                },
                {
                    "title": "Surplus Ingeniería Construcción 2026",
                    "branch": "Ingeniería",
                    "reinsurance_type": "Surplus",
                    "country_region": "Europa Occidental",
                    "coverage_period": "01/01/2026 – 31/12/2026",
                    "cession_pct": 50,
                    "premiums_y1": 8500000, "premiums_y2": 7200000, "premiums_y3": 6900000,
                    "loss_ratio_y1": 54, "loss_ratio_y2": 49, "loss_ratio_y3": 61,
                    "description": "Cartera de Construction All Risks (CAR) y Erection All Risks (EAR) en proyectos medianos. Capacidad media 40M€ por riesgo.",
                    "broker_id": None,
                },
            ]
            for dp in demo_packs:
                await db.submission_packs.insert_one({
                    "id": str(uuid.uuid4()),
                    "code": anon_code(),
                    "cedente_user_id": cedente_user["id"],
                    "cedente_company_id": cedente_user["company_id"],
                    "status": "published",
                    "created_at": now_iso(),
                    "published_at": now_iso(),
                    **dp,
                })


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_origin_regex=".*",
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def on_shutdown():
    client.close()
