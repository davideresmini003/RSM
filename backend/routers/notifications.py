"""Notifications: mark-as-read endpoint for chat messages.
The unread counts endpoint already lives in admin.py.
"""
from fastapi import APIRouter, HTTPException, Depends
from database import db
from security import get_current_user

router = APIRouter()


@router.post("/messages/{operation_id}/mark-read")
async def mark_messages_read(operation_id: str, body: dict, user: dict = Depends(get_current_user)):
    """Mark all messages in this op+channel as read by current user. Idempotent."""
    channel = body.get("channel")
    if not channel:
        raise HTTPException(status_code=400, detail="channel required")
    op = await db.operations.find_one({"id": operation_id})
    if not op:
        raise HTTPException(status_code=404)
    user_company = user.get("company_id")
    allowed = (
        user["role"] == "admin"
        or op["cedente_user_id"] == user["id"]
        or op["reasegurador_user_id"] == user["id"]
        or op.get("broker_user_id") == user["id"]
        or (user_company and user_company in (op.get("cedente_company_id"), op.get("reasegurador_company_id")))
    )
    if not allowed:
        raise HTTPException(status_code=403)
    await db.messages.update_many(
        {"operation_id": operation_id, "channel": channel, "sender_id": {"$ne": user["id"]}, "read_by": {"$ne": user["id"]}},
        {"$addToSet": {"read_by": user["id"]}},
    )
    return {"ok": True}
