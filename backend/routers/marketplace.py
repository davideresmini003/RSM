import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Request, Depends
from database import db
from models import SubmissionPackIn, BrokerPackOfferIn
from security import get_current_user, require_role
from utils import now_iso, clean_doc, anon_code, audit

router = APIRouter()


@router.post("/submission-packs")
async def create_pack(payload: SubmissionPackIn, request: Request, user: dict = Depends(require_role("cedente"))):
    if not user.get("company_id"):
        raise HTTPException(status_code=400, detail="Complete onboarding first")
    if payload.status == "published":
        company = await db.companies.find_one({"id": user["company_id"]})
        if not company or not company.get("verified"):
            raise HTTPException(status_code=403, detail="Company not verified — cannot publish")
        count = await db.submission_packs.count_documents({"cedente_user_id": user["id"], "status": "published"})
        if count >= 5:
            raise HTTPException(status_code=400, detail="PACK_LIMIT: Tienes 5 packs publicados (límite máximo). Retira uno desde el dashboard para poder publicar uno nuevo.")
    payload_data = payload.model_dump()
    if payload_data.get("country_region"):
        payload_data["country_region"] = payload_data["country_region"].strip().title()
    pack = {
        "id": str(uuid.uuid4()),
        "code": anon_code(),
        "cedente_user_id": user["id"],
        "cedente_company_id": user["company_id"],
        "created_at": now_iso(),
        "published_at": now_iso() if payload.status == "published" else None,
        **payload_data,
    }
    await db.submission_packs.insert_one(pack)
    await audit("pack.create", user, "pack", pack["id"], meta={"status": pack["status"]}, request=request)

    # Auto-create solicitud when pack is published with a specific broker
    if pack.get("broker_id") and pack["status"] == "published":
        broker_user = await db.users.find_one({"id": pack["broker_id"], "role": "broker"})
        if broker_user:
            requester_country = None
            if user.get("company_id"):
                co = await db.companies.find_one({"id": user["company_id"]}, {"_id": 0, "country": 1})
                requester_country = co.get("country") if co else None
            sol = {
                "id": str(uuid.uuid4()),
                "broker_id": pack["broker_id"],
                "requester_id": user["id"],
                "requester_role": "cedente",
                "requester_country": requester_country,
                "service": "Gestión de Submission Pack",
                "program_type": f"{pack['branch']} · {pack['reinsurance_type']}",
                "volume_eur": pack.get("premiums_y1") or 0,
                "geographic_zone": pack.get("country_region") or "",
                "message": f"Solicitud de colaboración para gestionar el pack {pack['code']}: {pack['title']}.",
                "pack_id": pack["id"],
                "pack_code": pack["code"],
                "status": "pending",
                "created_at": now_iso(),
                "expires_at": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
            }
            await db.solicitudes.insert_one(sol)

    return {"pack": clean_doc(dict(pack))}


@router.get("/submission-packs/broker-offers/received")
async def broker_offers_received(user: dict = Depends(require_role("cedente"))):
    offers = await db.broker_pack_offers.find(
        {"cedente_user_id": user["id"], "status": "pending"}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    for o in offers:
        broker_u = await db.users.find_one({"id": o["broker_user_id"]}, {"_id": 0})
        broker_c = await db.companies.find_one({"id": o.get("broker_company_id")}, {"_id": 0})
        o["broker_name"] = broker_u.get("name") if broker_u else "—"
        o["broker_company"] = broker_c.get("name") if broker_c else "—"
    return {"offers": offers}


@router.post("/submission-packs/broker-offers/{offer_id}/respond")
async def respond_broker_offer(offer_id: str, body: dict, request: Request, user: dict = Depends(require_role("cedente"))):
    offer = await db.broker_pack_offers.find_one({"id": offer_id})
    if not offer or offer["cedente_user_id"] != user["id"]:
        raise HTTPException(status_code=404)
    if offer["status"] != "pending":
        raise HTTPException(status_code=400, detail="Oferta ya respondida")
    action = body.get("action")
    if action == "reject":
        await db.broker_pack_offers.update_one({"id": offer_id}, {"$set": {"status": "rejected"}})
        await audit("broker_offer.reject", user, "pack", offer["pack_id"], request=request)
        return {"ok": True}
    if action == "accept":
        broker_user = await db.users.find_one({"id": offer["broker_user_id"]}, {"_id": 0})
        broker_company_id = broker_user.get("company_id") if broker_user else None
        await db.submission_packs.update_one(
            {"id": offer["pack_id"]},
            {"$set": {"broker_id": offer["broker_user_id"], "broker_company_id": broker_company_id}}
        )
        await db.broker_pack_offers.update_one({"id": offer_id}, {"$set": {"status": "accepted"}})
        requester_country = None
        if user.get("company_id"):
            co = await db.companies.find_one({"id": user["company_id"]}, {"_id": 0, "country": 1})
            requester_country = co.get("country") if co else None
        sol = {
            "id": str(uuid.uuid4()),
            "broker_id": offer["broker_user_id"],
            "requester_id": user["id"],
            "requester_role": "cedente",
            "requester_country": requester_country,
            "service": "Gestión de Submission Pack",
            "program_type": "",
            "volume_eur": 0,
            "geographic_zone": "",
            "message": f"Colaboración aceptada para el pack {offer['pack_code']}.",
            "pack_id": offer["pack_id"],
            "pack_code": offer["pack_code"],
            "status": "accepted",
            "created_at": now_iso(),
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
        }
        await db.solicitudes.insert_one(sol)
        await audit("broker_offer.accept", user, "pack", offer["pack_id"], request=request)
        return {"ok": True}
    raise HTTPException(status_code=400, detail="Acción inválida")


@router.post("/submission-packs/{pack_id}/broker-offer")
async def offer_broker_for_pack(pack_id: str, body: BrokerPackOfferIn, request: Request, user: dict = Depends(require_role("broker"))):
    pack = await db.submission_packs.find_one({"id": pack_id, "status": "published"})
    if not pack:
        raise HTTPException(status_code=404)
    if pack.get("broker_id"):
        raise HTTPException(status_code=400, detail="Este pack ya tiene un broker asignado")
    existing = await db.broker_pack_offers.find_one({"pack_id": pack_id, "broker_user_id": user["id"], "status": "pending"})
    if existing:
        raise HTTPException(status_code=400, detail="Ya has enviado una propuesta para este pack")
    offer = {
        "id": str(uuid.uuid4()),
        "pack_id": pack_id,
        "pack_code": pack["code"],
        "broker_user_id": user["id"],
        "broker_company_id": user.get("company_id"),
        "cedente_user_id": pack["cedente_user_id"],
        "cedente_company_id": pack["cedente_company_id"],
        "message": body.message,
        "status": "pending",
        "created_at": now_iso(),
    }
    await db.broker_pack_offers.insert_one(offer)
    await audit("broker_offer.create", user, "pack", pack_id, request=request)
    return {"ok": True}


@router.get("/submission-packs/mine")
async def list_my_packs(user: dict = Depends(require_role("cedente"))):
    packs = await db.submission_packs.find({"cedente_user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    for p in packs:
        p["interests_count"] = await db.interests.count_documents({"pack_id": p["id"]})
        p["interests_pending"] = await db.interests.count_documents({"pack_id": p["id"], "status": "pending"})
    return {"packs": packs}


@router.get("/submission-packs/{pack_id}")
async def get_pack(pack_id: str, user: dict = Depends(get_current_user)):
    pack = await db.submission_packs.find_one({"id": pack_id}, {"_id": 0})
    if not pack:
        raise HTTPException(status_code=404)
    return {"pack": pack}


@router.put("/submission-packs/{pack_id}/broker")
async def assign_broker_to_pack(pack_id: str, body: dict, request: Request, user: dict = Depends(require_role("cedente"))):
    pack = await db.submission_packs.find_one({"id": pack_id})
    user_company = user.get("company_id")
    is_owner = pack and (
        pack["cedente_user_id"] == user["id"]
        or (user_company and user_company == pack.get("cedente_company_id"))
    )
    if not pack or not is_owner:
        raise HTTPException(status_code=404)
    broker_id = body.get("broker_id")
    if broker_id:
        # Verify the broker has an active signed mandate with this cedente (company-level)
        mandate_q: dict = {"broker_id": broker_id, "nca_signed_broker": True, "nca_signed_cedente": True}
        if user_company:
            mandate_q["$or"] = [{"cedente_user_id": user["id"]}, {"cedente_company_id": user_company}]
        else:
            mandate_q["cedente_user_id"] = user["id"]
        mandate = await db.mandates.find_one(mandate_q)
        if not mandate:
            raise HTTPException(status_code=400, detail="No active mandate with this broker")
        broker_user = await db.users.find_one({"id": broker_id, "role": "broker"}, {"_id": 0})
        if not broker_user:
            raise HTTPException(status_code=404, detail="Broker not found")
        broker_company_id = broker_user.get("company_id")
        await db.submission_packs.update_one(
            {"id": pack_id},
            {"$set": {"broker_id": broker_id, "broker_company_id": broker_company_id}}
        )
        await audit("pack.assign_broker", user, "pack", pack_id, meta={"broker_id": broker_id}, request=request)
    else:
        await db.submission_packs.update_one({"id": pack_id}, {"$set": {"broker_id": None, "broker_company_id": None}})
        await audit("pack.remove_broker", user, "pack", pack_id, request=request)
    return {"ok": True}


@router.put("/submission-packs/{pack_id}/status")
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


@router.get("/marketplace/packs")
async def marketplace_packs(
    branch: Optional[str] = None,
    reinsurance_type: Optional[str] = None,
    country: Optional[str] = None,
    verified_only: Optional[bool] = False,
    has_broker: Optional[str] = None,
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
        user_company = user.get("company_id")
        is_pack_owner = user["role"] == "cedente" and (
            user["id"] == p.get("cedente_user_id")
            or (user_company and user_company == p.get("cedente_company_id"))
        )
        interests_count = await db.interests.count_documents({"pack_id": p["id"]}) if is_pack_owner else None
        own_interest = None
        if user["role"] == "reasegurador":
            mi = await db.interests.find_one({"pack_id": p["id"], "reasegurador_user_id": user["id"]}, {"_id": 0})
            if mi:
                own_interest = mi.get("status")
        own_broker_offer = None
        if user["role"] == "broker" and not p.get("broker_id"):
            bo = await db.broker_pack_offers.find_one({"pack_id": p["id"], "broker_user_id": user["id"]}, {"_id": 0})
            if bo:
                own_broker_offer = bo.get("status")
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
            "broker_id": p.get("broker_id"),
            "interests_count": interests_count,
            "own_interest": own_interest,
            "own_broker_offer": own_broker_offer,
            "published_at": p.get("published_at"),
        })
    return {"packs": enriched}


@router.get("/marketplace/packs/{pack_id}")
async def marketplace_pack_detail(pack_id: str, user: dict = Depends(get_current_user)):
    pack = await db.submission_packs.find_one({"id": pack_id, "status": "published"}, {"_id": 0})
    if not pack:
        raise HTTPException(status_code=404, detail="Pack no disponible")
    company = await db.companies.find_one({"id": pack["cedente_company_id"]}, {"_id": 0, "verified": 1, "country": 1})
    is_verified = bool(company and company.get("verified"))
    broker_name = None
    if pack.get("broker_id"):
        bu = await db.users.find_one({"id": pack["broker_id"]}, {"_id": 0})
        if bu and bu.get("company_id"):
            bc = await db.companies.find_one({"id": bu["company_id"]}, {"_id": 0, "name": 1})
            if bc:
                broker_name = bc.get("name")
    is_pack_owner = pack.get("cedente_company_id") == user.get("company_id")
    interests_count = await db.interests.count_documents({"pack_id": pack["id"]}) if (is_pack_owner or user["role"] not in ("reasegurador",)) else None
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
