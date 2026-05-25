import uuid
from fastapi import APIRouter, HTTPException, Request, Depends
from database import db
from security import get_current_user
from utils import now_iso, clean_doc, audit

router = APIRouter()


@router.get("/support/messages")
async def get_support_messages(user: dict = Depends(get_current_user)):
    if user["role"] == "admin":
        user_ids = await db.support_messages.distinct("user_id")
        conversations = []
        for uid in user_ids:
            u = await db.users.find_one({"id": uid}, {"_id": 0, "name": 1, "email": 1, "role": 1})
            msgs = await db.support_messages.find({"user_id": uid}, {"_id": 0}).sort("created_at", 1).to_list(500)
            if not msgs:
                continue
            unread = sum(1 for m in msgs if m.get("sender_role") != "admin" and not m.get("read_by_admin"))
            conversations.append({
                "user_id": uid,
                "user_name": u.get("name") if u else "—",
                "user_email": u.get("email") if u else "—",
                "user_role": u.get("role") if u else "—",
                "messages": msgs,
                "last_at": msgs[-1]["created_at"],
                "unread": unread,
            })
        conversations.sort(key=lambda x: x["last_at"], reverse=True)
        return {"conversations": conversations}
    msgs = await db.support_messages.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", 1).to_list(500)
    return {"messages": msgs}


@router.post("/support/messages")
async def send_support_message(body: dict, request: Request, user: dict = Depends(get_current_user)):
    text = (body.get("text") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Mensaje vacío")
    if user["role"] == "admin":
        target_user_id = body.get("user_id")
        if not target_user_id:
            raise HTTPException(status_code=400, detail="user_id requerido")
        msg = {
            "id": str(uuid.uuid4()),
            "user_id": target_user_id,
            "sender_id": user["id"],
            "sender_role": "admin",
            "sender_name": user.get("name", "RSM Support"),
            "text": text,
            "created_at": now_iso(),
            "read_by_admin": True,
        }
    else:
        msg = {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "sender_id": user["id"],
            "sender_role": user["role"],
            "sender_name": user.get("name"),
            "text": text,
            "created_at": now_iso(),
            "read_by_admin": False,
        }
    await db.support_messages.insert_one(msg)
    await audit("support.message", user, "support", msg["id"], request=request)
    return {"message": clean_doc(dict(msg))}


@router.post("/support/read")
async def mark_read(user: dict = Depends(get_current_user)):
    if user["role"] == "admin":
        return {"ok": True}
    await db.support_messages.update_many(
        {"user_id": user["id"], "sender_role": "admin"},
        {"$set": {"read_by_user": True}},
    )
    return {"ok": True}
