import uuid
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Request, Depends
from database import db
from models import BrokerProfileIn, SolicitudIn, RatingIn, CedenteProfileIn, ReaseguradorProfileIn
from security import get_current_user, require_role
from utils import now_iso, clean_doc, audit

router = APIRouter()


@router.put("/broker/profile")
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


@router.get("/broker/profile/me")
async def my_broker_profile(user: dict = Depends(require_role("broker"))):
    p = await db.broker_profiles.find_one({"user_id": user["id"]}, {"_id": 0})
    return {"profile": p}


@router.get("/marketplace/brokers")
async def marketplace_brokers(user: dict = Depends(get_current_user)):
    profiles = await db.broker_profiles.find({"visible_in_marketplace": True}, {"_id": 0}).to_list(200)
    result = []
    for p in profiles:
        u = await db.users.find_one({"id": p["user_id"]}, {"_id": 0})
        c = await db.companies.find_one({"id": p.get("company_id")}, {"_id": 0})
        if not u or not c or not c.get("verified"):
            continue
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


@router.get("/broker/{broker_id}")
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


# ─── Cedente Profile ─────────────────────────────────────────────────────────

@router.put("/cedente/profile")
async def upsert_cedente_profile(payload: CedenteProfileIn, request: Request, user: dict = Depends(require_role("cedente"))):
    doc = {
        "user_id": user["id"],
        "company_id": user.get("company_id"),
        **payload.model_dump(),
        "updated_at": now_iso(),
    }
    await db.cedente_profiles.replace_one({"user_id": user["id"]}, doc, upsert=True)
    await audit("cedente_profile.update", user, "cedente_profile", user["id"], request=request)
    return {"ok": True}


@router.get("/cedente/profile/me")
async def my_cedente_profile(user: dict = Depends(require_role("cedente"))):
    p = await db.cedente_profiles.find_one({"user_id": user["id"]}, {"_id": 0})
    company = await db.companies.find_one({"id": user.get("company_id")}, {"_id": 0})
    return {"profile": p, "company": clean_doc(dict(company)) if company else None}


# ─── Reasegurador Profile ─────────────────────────────────────────────────────

@router.put("/reasegurador/profile")
async def upsert_reasegurador_profile(payload: ReaseguradorProfileIn, request: Request, user: dict = Depends(require_role("reasegurador"))):
    doc = {
        "user_id": user["id"],
        "company_id": user.get("company_id"),
        **payload.model_dump(),
        "updated_at": now_iso(),
    }
    await db.reasegurador_profiles.replace_one({"user_id": user["id"]}, doc, upsert=True)
    await audit("reasegurador_profile.update", user, "reasegurador_profile", user["id"], request=request)
    return {"ok": True}


@router.get("/reasegurador/profile/me")
async def my_reasegurador_profile(user: dict = Depends(require_role("reasegurador"))):
    p = await db.reasegurador_profiles.find_one({"user_id": user["id"]}, {"_id": 0})
    company = await db.companies.find_one({"id": user.get("company_id")}, {"_id": 0})
    return {"profile": p, "company": clean_doc(dict(company)) if company else None}


# ─── Solicitudes ─────────────────────────────────────────────────────────────

@router.post("/solicitudes")
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


@router.get("/solicitudes/broker")
async def solicitudes_for_broker(user: dict = Depends(require_role("broker"))):
    items = await db.solicitudes.find({"broker_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"items": items}


@router.get("/solicitudes/mine")
async def my_solicitudes(user: dict = Depends(get_current_user)):
    items = await db.solicitudes.find({"requester_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"items": items}


@router.post("/solicitudes/{sol_id}/action")
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
            requester = await db.users.find_one({"id": sol["requester_id"]}, {"_id": 0, "company_id": 1})
            mandate = {
                "id": str(uuid.uuid4()),
                "broker_id": user["id"],
                "cedente_user_id": sol["requester_id"],
                "cedente_company_id": (requester or {}).get("company_id"),
                "nca_signed_broker": False,
                "nca_signed_cedente": False,
                "status": "pending",
                "created_at": now_iso(),
            }
            await db.mandates.insert_one(mandate)
            update["mandate_id"] = mandate["id"]
            # Auto-assign broker to pack if solicitud references a specific pack
            if sol.get("pack_id"):
                broker_company_id = user.get("company_id")
                await db.submission_packs.update_one(
                    {"id": sol["pack_id"]},
                    {"$set": {"broker_id": user["id"], "broker_company_id": broker_company_id}}
                )
        await db.solicitudes.update_one({"id": sol_id}, {"$set": update})
        await audit("solicitud.accept", user, "solicitud", sol_id, request=request)
        return {"ok": True, "mandate_id": update.get("mandate_id")}
    raise HTTPException(status_code=400)


# ─── Mandates ────────────────────────────────────────────────────────────────

@router.get("/broker/assigned-packs")
async def broker_assigned_packs(user: dict = Depends(require_role("broker"))):
    packs = await db.submission_packs.find({"broker_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    for p in packs:
        p["interests_count"] = await db.interests.count_documents({"pack_id": p["id"]})
        cedente_co = await db.companies.find_one({"id": p.get("cedente_company_id")}, {"_id": 0, "name": 1})
        p["cedente_name"] = cedente_co.get("name") if cedente_co else None
    return {"packs": packs}


@router.get("/mandates")
async def list_mandates(user: dict = Depends(get_current_user)):
    if user["role"] == "broker":
        q = {"broker_id": user["id"]}
    elif user["role"] == "cedente":
        q = {"cedente_user_id": user["id"]}
    else:
        raise HTTPException(status_code=403)
    items = await db.mandates.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    for m in items:
        m["nca_both_signed"] = bool(m.get("nca_signed_broker") and m.get("nca_signed_cedente"))
        if m["nca_both_signed"]:
            c = await db.companies.find_one({"id": m.get("cedente_company_id")}, {"_id": 0, "name": 1})
            b = await db.users.find_one({"id": m["broker_id"]}, {"_id": 0, "name": 1})
            m["cedente_name"] = c.get("name") if c else None
            m["broker_name"] = b.get("name") if b else None
    return {"mandates": items}


@router.post("/mandates/{mandate_id}/sign")
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


# ─── Ratings ─────────────────────────────────────────────────────────────────

@router.post("/ratings")
async def create_rating(payload: RatingIn, request: Request, user: dict = Depends(require_role("cedente"))):
    op = await db.operations.find_one({"id": payload.operation_id})
    if not op or op["cedente_user_id"] != user["id"] or op["state"] != "closed":
        raise HTTPException(status_code=400, detail="Can only rate closed operations you owned")
    if not op.get("broker_user_id") or op["broker_user_id"] != payload.broker_id:
        raise HTTPException(status_code=400, detail="Broker not part of this operation")
    existing = await db.ratings.find_one({"operation_id": payload.operation_id, "rater_id": user["id"]})
    if existing:
        raise HTTPException(status_code=400, detail="Ya valorado")
    r = {
        "id": str(uuid.uuid4()),
        "operation_id": payload.operation_id,
        "broker_id": payload.broker_id,
        "rater_id": user["id"],
        "technical": max(1, min(5, payload.technical)),
        "communication": max(1, min(5, payload.communication)),
        "deadlines": max(1, min(5, payload.deadlines)),
        "approved": True,
        "created_at": now_iso(),
    }
    await db.ratings.insert_one(r)
    await audit("rating.create", user, "broker", payload.broker_id, request=request)
    return {"ok": True}
