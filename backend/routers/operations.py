import uuid
import base64
from typing import Optional
from fastapi import APIRouter, HTTPException, Request, Depends, UploadFile, File, Form
from fastapi.responses import Response
from database import db
from models import InterestIn, NcaSignIn, QuoteIn, MessageIn
from security import get_current_user, require_role
from utils import now_iso, clean_doc, audit

router = APIRouter()


def _operation_visibility(op: dict, user: dict) -> dict:
    both_signed = op.get("nca_signed_cedente") and op.get("nca_signed_reasegurador")
    op = dict(op)
    op["revealed"] = bool(both_signed)
    if user["role"] == "admin":
        op["revealed"] = True
    return op


# ─── Interests ───────────────────────────────────────────────────────────────

@router.post("/interests")
async def express_interest(payload: InterestIn, request: Request, user: dict = Depends(require_role("reasegurador"))):
    pack = await db.submission_packs.find_one({"id": payload.pack_id, "status": "published"})
    if not pack:
        raise HTTPException(status_code=404, detail="Pack not available")
    # Bug 3: require verified company for expressing interest
    company = await db.companies.find_one({"id": user.get("company_id")}) if user.get("company_id") else None
    if not company or not company.get("verified"):
        raise HTTPException(status_code=403, detail="Tu empresa debe estar verificada para expresar interés en operaciones")
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


@router.get("/interests/received")
async def interests_received(status: Optional[str] = None, user: dict = Depends(require_role("cedente"))):
    user_company = user.get("company_id")
    base_q = {"$or": [{"cedente_user_id": user["id"]}]}
    if user_company:
        base_q["$or"].append({"cedente_company_id": user_company})
    q = {"$and": [base_q, {"status": status}]} if status else base_q
    items = await db.interests.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    for it in items:
        pack = await db.submission_packs.find_one({"id": it["pack_id"]}, {"_id": 0, "code": 1, "title": 1})
        it["pack"] = pack
    return {"items": items}


@router.get("/interests/mine")
async def interests_mine(user: dict = Depends(require_role("reasegurador"))):
    user_company = user.get("company_id")
    q: dict = {"$or": [{"reasegurador_user_id": user["id"]}]}
    if user_company:
        q["$or"].append({"reasegurador_company_id": user_company})
    items = await db.interests.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    for it in items:
        pack = await db.submission_packs.find_one({"id": it["pack_id"]}, {"_id": 0, "code": 1, "title": 1})
        it["pack"] = pack
    return {"items": items}


@router.post("/interests/{interest_id}/respond")
async def respond_interest(interest_id: str, body: dict, request: Request, user: dict = Depends(require_role("cedente"))):
    action = body.get("action")
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


# ─── Operations ──────────────────────────────────────────────────────────────

@router.get("/operations")
async def list_operations(user: dict = Depends(get_current_user)):
    user_company = user.get("company_id")
    q = {}
    if user["role"] == "cedente":
        if user_company:
            q["cedente_company_id"] = user_company
        else:
            q["cedente_user_id"] = user["id"]
    elif user["role"] == "reasegurador":
        if user_company:
            q["reasegurador_company_id"] = user_company
        else:
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
        cedente_co = await db.companies.find_one({"id": op["cedente_company_id"]}, {"_id": 0, "name": 1})
        rea_co = await db.companies.find_one({"id": op["reasegurador_company_id"]}, {"_id": 0, "name": 1})
        op["cedente_name"] = cedente_co.get("name") if cedente_co else None
        op["reasegurador_name"] = rea_co.get("name") if rea_co else None
        out.append(op)
    return {"operations": out}


@router.get("/operations/{op_id}")
async def get_operation(op_id: str, user: dict = Depends(get_current_user)):
    op = await db.operations.find_one({"id": op_id}, {"_id": 0})
    if not op:
        raise HTTPException(status_code=404)
    user_company = user.get("company_id")
    allowed = (
        user["role"] == "admin"
        or op["cedente_user_id"] == user["id"]
        or op["reasegurador_user_id"] == user["id"]
        or op.get("broker_user_id") == user["id"]
        or (user_company and user_company == op.get("cedente_company_id"))
        or (user_company and user_company == op.get("reasegurador_company_id"))
    )
    if not allowed:
        raise HTTPException(status_code=403)
    op = _operation_visibility(op, user)
    cedente_co = await db.companies.find_one({"id": op["cedente_company_id"]}, {"_id": 0})
    rea_co = await db.companies.find_one({"id": op["reasegurador_company_id"]}, {"_id": 0})
    op["cedente_company"] = clean_doc(dict(cedente_co)) if cedente_co else None
    op["reasegurador_company"] = clean_doc(dict(rea_co)) if rea_co else None
    pack = await db.submission_packs.find_one({"id": op["pack_id"]}, {"_id": 0})
    op["pack"] = pack
    quote = None
    if op.get("quote_id"):
        quote = await db.quotes.find_one({"id": op["quote_id"]}, {"_id": 0})
    op["quote"] = quote
    all_quotes = await db.quotes.find({"operation_id": op_id}, {"_id": 0}).sort("version", 1).to_list(50)
    op["quote_history"] = [clean_doc(dict(q)) for q in all_quotes]
    contract = None
    if op.get("contract_id"):
        contract = await db.contracts.find_one({"id": op["contract_id"]}, {"_id": 0})
    op["contract"] = contract
    return {"operation": op}


@router.post("/operations/{op_id}/sign-nca")
async def sign_nca(op_id: str, payload: NcaSignIn, request: Request, user: dict = Depends(get_current_user)):
    if not payload.accepted:
        raise HTTPException(status_code=400, detail="Must accept NCA")
    op = await db.operations.find_one({"id": op_id})
    if not op:
        raise HTTPException(status_code=404)
    if op.get("suspended"):
        raise HTTPException(status_code=400, detail="Operación suspendida")
    user_company = user.get("company_id")
    user_role = user.get("role")
    # Allow any user from the same company to sign (not just the original user who expressed interest)
    is_cedente = (op["cedente_user_id"] == user["id"]) or (
        user_role == "cedente" and user_company and user_company == op.get("cedente_company_id")
    )
    is_rea = (op["reasegurador_user_id"] == user["id"]) or (
        user_role == "reasegurador" and user_company and user_company == op.get("reasegurador_company_id")
    )
    if is_cedente:
        filter_cond = {"id": op_id, "nca_signed_cedente": False}
        update_fields = {
            "nca_signed_cedente": True,
            "nca_signed_at_cedente": now_iso(),
            "nca_signer_cedente": payload.signer_name,
        }
        already_msg = "La cedente ya firmó el NCA"
    elif is_rea:
        filter_cond = {"id": op_id, "nca_signed_reasegurador": False}
        update_fields = {
            "nca_signed_reasegurador": True,
            "nca_signed_at_reasegurador": now_iso(),
            "nca_signer_reasegurador": payload.signer_name,
        }
        already_msg = "El reasegurador ya firmó el NCA"
    else:
        raise HTTPException(status_code=403, detail="No está autorizado para firmar este NCA")
    # Atomic update: only succeeds if the field is still False (prevents double-sign race condition)
    before = await db.operations.find_one_and_update(filter_cond, {"$set": update_fields})
    if before is None:
        raise HTTPException(status_code=400, detail=already_msg)
    # Determine state after update by merging before-doc with the fields we just set
    new_cedente = update_fields.get("nca_signed_cedente", before.get("nca_signed_cedente"))
    new_rea = update_fields.get("nca_signed_reasegurador", before.get("nca_signed_reasegurador"))
    if new_cedente and new_rea:
        await db.operations.update_one({"id": op_id}, {"$set": {"state": "quote_pending"}})
    await audit("nca.sign", user, "operation", op_id, meta={"signer": payload.signer_name}, request=request)
    return {"ok": True}


@router.post("/operations/{op_id}/quote")
async def submit_quote(op_id: str, payload: QuoteIn, request: Request, user: dict = Depends(get_current_user)):
    op = await db.operations.find_one({"id": op_id})
    if op and op.get("suspended"):
        raise HTTPException(status_code=400, detail="Operación suspendida")
    user_company = user.get("company_id")
    user_role = user.get("role")
    is_rea = (op and op["reasegurador_user_id"] == user["id"]) or (
        op and user_role == "reasegurador" and user_company and user_company == op.get("reasegurador_company_id")
    )
    is_cedente = (op and op["cedente_user_id"] == user["id"]) or (
        op and user_role == "cedente" and user_company and user_company == op.get("cedente_company_id")
    )
    if not op or not (is_rea or is_cedente):
        raise HTTPException(status_code=403)
    if not (op.get("nca_signed_cedente") and op.get("nca_signed_reasegurador")):
        raise HTTPException(status_code=400, detail="NCA not fully signed")
    # Bug 14: enforce minimum A- rating for reaseguradores sending quotes
    if is_rea and not is_cedente:
        VALID_RATINGS = {"A-", "A", "A+", "AA-", "AA", "AA+", "AAA",
                         "A+ (Superior)", "A (Excellent)", "A- (Excellent)"}
        rea_company = await db.companies.find_one({"id": op.get("reasegurador_company_id")})
        rating = (rea_company or {}).get("rating_value") or (rea_company or {}).get("rating") or ""
        if rating not in VALID_RATINGS:
            raise HTTPException(status_code=403, detail="Se requiere rating mínimo A− para participar en operaciones")
    if not (0 <= payload.offered_share_pct <= 100):
        raise HTTPException(status_code=400, detail="El porcentaje de participación debe estar entre 0 y 100")
    for fval in [payload.ceding_commission_pct, payload.rate_on_line_pct, payload.attachment_point,
                 payload.limit_eur, payload.estimated_premium_eur, payload.profit_commission_pct]:
        if fval < 0:
            raise HTTPException(status_code=400, detail="Los valores numéricos no pueden ser negativos")
    # Block only if the current quote was already accepted (contract phase started)
    if op.get("quote_id"):
        existing = await db.quotes.find_one({"id": op["quote_id"]})
        if existing and existing.get("accepted"):
            raise HTTPException(status_code=400, detail="La cotización ya fue aceptada — el contrato está en curso")
    quote = {
        "id": str(uuid.uuid4()),
        "operation_id": op_id,
        "sender_user_id": user["id"],
        "sender_role": user_role,
        "version": (await db.quotes.count_documents({"operation_id": op_id})) + 1,
        "created_at": now_iso(),
        "accepted": False,
        "accepted_at": None,
        **payload.model_dump(),
    }
    await db.quotes.insert_one(quote)
    await db.operations.update_one({"id": op_id}, {"$set": {"quote_id": quote["id"], "state": "quote_received"}})
    await audit("quote.submit", user, "operation", op_id, meta={"version": quote["version"], "sender_role": user_role}, request=request)
    return {"quote": clean_doc(dict(quote))}


@router.post("/operations/{op_id}/accept-quote")
async def accept_quote(op_id: str, request: Request, user: dict = Depends(get_current_user)):
    op = await db.operations.find_one({"id": op_id})
    if not op:
        raise HTTPException(status_code=404)
    if op.get("suspended"):
        raise HTTPException(status_code=400, detail="Operación suspendida")
    user_company = user.get("company_id")
    is_cedente = (
        op["cedente_user_id"] == user["id"]
        or (user_company and user_company == op.get("cedente_company_id"))
    )
    is_rea = (
        op.get("reasegurador_user_id") == user["id"]
        or (user_company and user_company == op.get("reasegurador_company_id"))
    )
    if not (is_cedente or is_rea):
        raise HTTPException(status_code=404)
    quote = await db.quotes.find_one({"id": op.get("quote_id")}) if op.get("quote_id") else None
    if not quote:
        raise HTTPException(status_code=400, detail="No quote")
    # Bug 2: race-condition guard — atomic accept on the quote document itself
    if quote.get("accepted"):
        raise HTTPException(status_code=400, detail="Esta cotización ya fue aceptada")
    sender_role = quote.get("sender_role", "")
    if is_cedente and sender_role == "cedente":
        raise HTTPException(status_code=403, detail="Cannot accept your own quote")
    if is_rea and sender_role == "reasegurador":
        raise HTTPException(status_code=403, detail="Cannot accept your own quote")
    if op.get("contract_id"):
        raise HTTPException(status_code=400, detail="Quote already accepted")
    await db.quotes.update_one({"id": op["quote_id"]}, {"$set": {"accepted": True, "accepted_at": now_iso()}})
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


@router.post("/operations/{op_id}/sign-contract")
async def sign_contract(op_id: str, payload: NcaSignIn, request: Request, user: dict = Depends(get_current_user)):
    op = await db.operations.find_one({"id": op_id})
    if not op or not op.get("contract_id"):
        raise HTTPException(status_code=404)
    contract = await db.contracts.find_one({"id": op["contract_id"]})
    if not contract:
        raise HTTPException(status_code=404)
    user_company = user.get("company_id")
    user_role = user.get("role")
    is_cedente = (op["cedente_user_id"] == user["id"]) or (
        user_role == "cedente" and user_company and user_company == op.get("cedente_company_id")
    )
    is_rea = (op["reasegurador_user_id"] == user["id"]) or (
        user_role == "reasegurador" and user_company and user_company == op.get("reasegurador_company_id")
    )
    update = {}
    if is_cedente:
        if contract.get("signed_cedente"):
            raise HTTPException(status_code=400, detail="Already signed")
        update["signed_cedente"] = True
        update["signed_at_cedente"] = now_iso()
        update["signer_cedente"] = payload.signer_name
    elif is_rea:
        if contract.get("signed_reasegurador"):
            raise HTTPException(status_code=400, detail="Already signed")
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


# ─── Messages ────────────────────────────────────────────────────────────────

@router.get("/messages/{message_id}/attachment")
async def get_message_attachment(message_id: str, user: dict = Depends(get_current_user)):
    msg = await db.messages.find_one({"id": message_id})
    if not msg or not msg.get("attachment"):
        raise HTTPException(status_code=404)
    op = await db.operations.find_one({"id": msg["operation_id"]})
    if not op:
        raise HTTPException(status_code=404)
    user_company = user.get("company_id")
    allowed = (
        user["role"] == "admin"
        or op["cedente_user_id"] == user["id"]
        or op["reasegurador_user_id"] == user["id"]
        or op.get("broker_user_id") == user["id"]
        or (user_company and user_company == op.get("cedente_company_id"))
        or (user_company and user_company == op.get("reasegurador_company_id"))
    )
    if not allowed:
        raise HTTPException(status_code=403)
    att = msg["attachment"]
    data = base64.b64decode(att["data"])
    return Response(
        content=data,
        media_type=att["content_type"],
        headers={"Content-Disposition": f'attachment; filename="{att["filename"]}"'},
    )


@router.get("/messages/{op_id}")
async def get_messages(op_id: str, channel: str, user: dict = Depends(get_current_user)):
    op = await db.operations.find_one({"id": op_id})
    if not op:
        raise HTTPException(status_code=404)
    user_company = user.get("company_id")
    allowed = (
        user["role"] == "admin"
        or op["cedente_user_id"] == user["id"]
        or op["reasegurador_user_id"] == user["id"]
        or op.get("broker_user_id") == user["id"]
        or (user_company and user_company == op.get("cedente_company_id"))
        or (user_company and user_company == op.get("reasegurador_company_id"))
    )
    if not allowed:
        raise HTTPException(status_code=403)
    role = user["role"]
    both_nca_signed = op.get("nca_signed_cedente") and op.get("nca_signed_reasegurador")
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
    if both_nca_signed:
        allowed_channels.add("documents")
    if role == "admin":
        allowed_channels.update({"documents", "cedente-reasegurador", "broker-cedente", "broker-reasegurador"})
    if channel not in allowed_channels:
        raise HTTPException(status_code=403, detail="Channel not available")
    both_signed = op.get("nca_signed_cedente") and op.get("nca_signed_reasegurador")
    msgs = await db.messages.find({"operation_id": op_id, "channel": channel}, {"_id": 0}).sort("created_at", 1).to_list(500)
    # Anonymize sender names until both parties sign NCA
    if not both_signed:
        for m in msgs:
            if m.get("sender_role") == "cedente":
                m["sender_name"] = "Cedente Anónimo"
            elif m.get("sender_role") == "reasegurador":
                m["sender_name"] = "Reasegurador Anónimo"
    return {"messages": msgs, "locked": False, "pre_nca": not both_signed}


@router.post("/messages")
async def send_message(payload: MessageIn, request: Request, user: dict = Depends(get_current_user)):
    op = await db.operations.find_one({"id": payload.operation_id})
    if not op:
        raise HTTPException(status_code=404)
    channel = payload.channel
    user_company = user.get("company_id")
    user_role = user.get("role")
    is_cedente_user = (op["cedente_user_id"] == user["id"]) or (
        user_role == "cedente" and user_company and user_company == op.get("cedente_company_id")
    )
    is_rea_user = (op["reasegurador_user_id"] == user["id"]) or (
        user_role == "reasegurador" and user_company and user_company == op.get("reasegurador_company_id")
    )
    is_broker_user = op.get("broker_user_id") == user["id"]
    both_nca_msg = op.get("nca_signed_cedente") and op.get("nca_signed_reasegurador")
    if channel == "broker-cedente":
        if not (is_broker_user or is_cedente_user):
            raise HTTPException(status_code=403)
    elif channel == "broker-reasegurador":
        if not (is_broker_user or is_rea_user):
            raise HTTPException(status_code=403)
    elif channel == "cedente-reasegurador":
        if op.get("broker_user_id"):
            raise HTTPException(status_code=400, detail="Canal no disponible cuando la operación tiene broker")
        if not (is_cedente_user or is_rea_user):
            raise HTTPException(status_code=403)
    elif channel == "documents":
        if not both_nca_msg:
            raise HTTPException(status_code=403, detail="Firma el NCA primero para acceder a documentos")
        if not (is_cedente_user or is_rea_user or is_broker_user):
            raise HTTPException(status_code=403)
    else:
        raise HTTPException(status_code=400)
    msg = {
        "id": str(uuid.uuid4()),
        "operation_id": payload.operation_id,
        "channel": channel,
        "sender_id": user["id"],
        "sender_role": user["role"],
        "sender_name": user.get("name"),
        "text": payload.text,
        "created_at": now_iso(),
    }
    await db.messages.insert_one(msg)
    await audit("message.send", user, "operation", payload.operation_id, meta={"channel": channel}, request=request)
    return {"message": clean_doc(dict(msg))}


@router.post("/messages/upload")
async def send_message_with_file(
    request: Request,
    operation_id: str = Form(...),
    channel: str = Form(...),
    text: str = Form(""),
    file: UploadFile = File(None),
    user: dict = Depends(get_current_user),
):
    op = await db.operations.find_one({"id": operation_id})
    if not op:
        raise HTTPException(status_code=404)
    user_company = user.get("company_id")
    user_role = user.get("role")
    is_cedente_user = (op["cedente_user_id"] == user["id"]) or (
        user_role == "cedente" and user_company and user_company == op.get("cedente_company_id")
    )
    is_rea_user = (op["reasegurador_user_id"] == user["id"]) or (
        user_role == "reasegurador" and user_company and user_company == op.get("reasegurador_company_id")
    )
    is_broker_user = op.get("broker_user_id") == user["id"]
    both_nca = op.get("nca_signed_cedente") and op.get("nca_signed_reasegurador")
    if channel == "broker-cedente":
        if not (is_broker_user or is_cedente_user):
            raise HTTPException(status_code=403)
    elif channel == "broker-reasegurador":
        if not (is_broker_user or is_rea_user):
            raise HTTPException(status_code=403)
    elif channel == "cedente-reasegurador":
        if op.get("broker_user_id"):
            raise HTTPException(status_code=400, detail="Canal no disponible cuando la operación tiene broker")
        if not (is_cedente_user or is_rea_user):
            raise HTTPException(status_code=403)
    elif channel == "documents":
        if not both_nca:
            raise HTTPException(status_code=403, detail="Firma el NCA primero para acceder a documentos")
        if not (is_cedente_user or is_rea_user or is_broker_user):
            raise HTTPException(status_code=403)
    else:
        raise HTTPException(status_code=400)

    msg = {
        "id": str(uuid.uuid4()),
        "operation_id": operation_id,
        "channel": channel,
        "sender_id": user["id"],
        "sender_role": user["role"],
        "sender_name": user.get("name"),
        "text": text,
        "created_at": now_iso(),
        "attachment": None,
    }
    if file and file.filename:
        content = await file.read()
        if len(content) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="El archivo no puede superar 10 MB")
        msg["attachment"] = {
            "filename": file.filename,
            "content_type": file.content_type or "application/octet-stream",
            "size": len(content),
            "data": base64.b64encode(content).decode(),
        }
    await db.messages.insert_one(msg)
    await audit("message.send", user, "operation", operation_id, meta={"channel": channel, "has_file": bool(msg["attachment"])}, request=request)
    resp = clean_doc(dict(msg))
    if resp.get("attachment"):
        del resp["attachment"]["data"]
    return {"message": resp}
