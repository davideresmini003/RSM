import uuid
from datetime import datetime, timezone
from fastapi import Request
from database import db


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def clean_doc(doc: dict) -> dict:
    if not doc:
        return doc
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    return doc


def anon_code() -> str:
    year = datetime.now(timezone.utc).year
    return f"RSM-{year}-{str(uuid.uuid4())[:4].upper()}"


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
