from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Request, Depends
from database import db
from models import AdminVerifyIn
from security import get_current_user, require_role
from utils import now_iso, audit

router = APIRouter()


@router.get("/stats/dashboard")
async def dashboard_stats(user: dict = Depends(get_current_user)):
    role = user["role"]
    if role == "cedente":
        company_id = user.get("company_id")
        published = await db.submission_packs.count_documents({"cedente_user_id": user["id"], "status": "published"})
        interests_pending = await db.interests.count_documents({"cedente_user_id": user["id"], "status": "pending"})
        active_ops_q = {"cedente_company_id": company_id} if company_id else {"cedente_user_id": user["id"]}
        active_ops_q["state"] = {"$nin": ["closed", "cancelled"]}
        active_ops = await db.operations.count_documents(active_ops_q)
        nca_ops_q = {"cedente_company_id": company_id} if company_id else {"cedente_user_id": user["id"]}
        nca_ops_q.update({"nca_signed_cedente": False, "state": "nca_pending"})
        nca_ops_pending = await db.operations.count_documents(nca_ops_q)
        # Include pending mandate NCAs (broker-cedente mandates where cedente hasn't signed)
        mandate_nca_pending = await db.mandates.count_documents({"cedente_user_id": user["id"], "nca_signed_cedente": False, "nca_signed_broker": True})
        nca_pending = nca_ops_pending + mandate_nca_pending
        return {"published": published, "interests_pending": interests_pending, "active_ops": active_ops, "nca_pending": nca_pending, "mandate_nca_pending": mandate_nca_pending}
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


@router.get("/notifications/unread")
async def unread_counts(user: dict = Depends(get_current_user)):
    uid = user["id"]
    role = user["role"]
    # Use 7-day window for chat to avoid stale-notification blindness
    cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()

    result = {"chat": 0, "operations": 0, "solicitudes": 0, "interests": 0}

    company_id = user.get("company_id")

    if role == "cedente":
        op_query = {"state": {"$nin": ["closed", "cancelled"]}, "$or": [{"cedente_user_id": uid}]}
        if company_id:
            op_query["$or"].append({"cedente_company_id": company_id})
        ops = await db.operations.find(op_query, {"id": 1, "code": 1, "state": 1, "nca_signed_cedente": 1, "contract_id": 1}).to_list(200)
        op_ids = [o["id"] for o in ops]
        op_code_map = {o["id"]: o.get("code", o["id"][:8]) for o in ops}
        chat_ops = []
        if op_ids:
            visible_channels = ["cedente-reasegurador", "broker-cedente"]
            pipeline = [
                {"$match": {"operation_id": {"$in": op_ids}, "sender_id": {"$ne": uid},
                            "channel": {"$in": visible_channels}, "created_at": {"$gt": cutoff}}},
                {"$group": {"_id": "$operation_id", "count": {"$sum": 1}, "last_at": {"$max": "$created_at"}}},
            ]
            async for doc in db.messages.aggregate(pipeline):
                chat_ops.append({"op_id": doc["_id"], "op_code": op_code_map.get(doc["_id"], ""), "count": doc["count"], "last_at": doc["last_at"]})
        result["chat_ops"] = chat_ops
        result["chat"] = sum(o["count"] for o in chat_ops)
        nca_pending = sum(1 for o in ops if o.get("state") == "nca_pending" and not o.get("nca_signed_cedente"))
        quote_action = sum(1 for o in ops if o.get("state") == "quote_received")
        contract_pending = sum(1 for o in ops if o.get("state") == "contract_pending")
        result["operations"] = nca_pending + quote_action + contract_pending
        result["interests"] = await db.interests.count_documents(
            {"cedente_user_id": uid, "status": "pending"} if not company_id
            else {"$or": [{"cedente_user_id": uid}, {"cedente_company_id": company_id}], "status": "pending"}
        )

    elif role == "reasegurador":
        op_query = {"state": {"$nin": ["closed", "cancelled"]}, "$or": [{"reasegurador_user_id": uid}]}
        if company_id:
            op_query["$or"].append({"reasegurador_company_id": company_id})
        ops = await db.operations.find(op_query, {"id": 1, "code": 1, "state": 1, "nca_signed_reasegurador": 1, "contract": 1}).to_list(200)
        op_ids = [o["id"] for o in ops]
        op_code_map = {o["id"]: o.get("code", o["id"][:8]) for o in ops}
        chat_ops = []
        if op_ids:
            visible_channels = ["cedente-reasegurador", "broker-reasegurador"]
            pipeline = [
                {"$match": {"operation_id": {"$in": op_ids}, "sender_id": {"$ne": uid},
                            "channel": {"$in": visible_channels}, "created_at": {"$gt": cutoff}}},
                {"$group": {"_id": "$operation_id", "count": {"$sum": 1}, "last_at": {"$max": "$created_at"}}},
            ]
            async for doc in db.messages.aggregate(pipeline):
                chat_ops.append({"op_id": doc["_id"], "op_code": op_code_map.get(doc["_id"], ""), "count": doc["count"], "last_at": doc["last_at"]})
        result["chat_ops"] = chat_ops
        result["chat"] = sum(o["count"] for o in chat_ops)
        nca_pending = sum(1 for o in ops if o.get("state") == "nca_pending" and not o.get("nca_signed_reasegurador"))
        quote_action = sum(1 for o in ops if o.get("state") == "quote_pending")
        contract_pending = sum(1 for o in ops if o.get("state") == "contract_pending" and o.get("contract") and not o["contract"].get("signed_reasegurador"))
        result["operations"] = nca_pending + quote_action + contract_pending

    elif role == "broker":
        ops = await db.operations.find(
            {"broker_user_id": uid, "state": {"$nin": ["closed", "cancelled"]}}, {"id": 1}
        ).to_list(200)
        op_ids = [o["id"] for o in ops]
        chat_ops = []
        if op_ids:
            pipeline = [
                {"$match": {"operation_id": {"$in": op_ids}, "sender_id": {"$ne": uid},
                            "channel": {"$in": ["broker-cedente", "broker-reasegurador"]}, "created_at": {"$gt": cutoff}}},
                {"$group": {"_id": "$operation_id", "count": {"$sum": 1}, "last_at": {"$max": "$created_at"}}},
            ]
            async for doc in db.messages.aggregate(pipeline):
                chat_ops.append({"op_id": doc["_id"], "op_code": "", "count": doc["count"], "last_at": doc["last_at"]})
        result["chat_ops"] = chat_ops
        result["chat"] = sum(o["count"] for o in chat_ops)
        result["solicitudes"] = await db.solicitudes.count_documents({"broker_id": uid, "status": "pending"})

    return result


@router.get("/admin/companies")
async def admin_companies(user: dict = Depends(require_role("admin"))):
    items = await db.companies.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"companies": items}


@router.delete("/admin/companies/{company_id}")
async def admin_delete_company(company_id: str, request: Request, user: dict = Depends(require_role("admin"))):
    company = await db.companies.find_one({"id": company_id})
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    await db.companies.delete_one({"id": company_id})
    await db.users.delete_many({"company_id": company_id})
    await db.submission_packs.delete_many({"cedente_company_id": company_id})
    await audit("admin.delete_company", user, "company", company_id, meta={"name": company.get("name")}, request=request)
    return {"ok": True}


@router.post("/admin/companies/verify")
async def admin_verify(payload: AdminVerifyIn, request: Request, user: dict = Depends(require_role("admin"))):
    await db.companies.update_one({"id": payload.company_id}, {"$set": {"verified": payload.verified, "verified_at": now_iso()}})
    company = await db.companies.find_one({"id": payload.company_id})
    if company:
        await db.users.update_one({"id": company["owner_user_id"]}, {"$set": {"verified": payload.verified}})
    await audit("admin.verify_company", user, "company", payload.company_id, meta={"verified": payload.verified}, request=request)
    return {"ok": True}


@router.get("/admin/audit")
async def admin_audit(limit: int = 200, user: dict = Depends(require_role("admin"))):
    items = await db.audit_log.find({}, {"_id": 0}).sort("timestamp", -1).to_list(limit)
    return {"items": items}


@router.post("/admin/operations/{op_id}/suspend")
async def admin_suspend(op_id: str, body: dict, request: Request, user: dict = Depends(require_role("admin"))):
    suspend = bool(body.get("suspend", True))
    await db.operations.update_one({"id": op_id}, {"$set": {"suspended": suspend, "suspend_reason": body.get("reason", "")}})
    await audit("admin.suspend_op", user, "operation", op_id, meta={"suspend": suspend}, request=request)
    return {"ok": True}
