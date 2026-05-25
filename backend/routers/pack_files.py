"""Pack files: upload + list + download. Files are stored in mongo as base64.
Access rules:
- Owner (cedente of the pack) can always upload/list/download.
- Reaseguradores: can list files only after NCA has been signed for THEIR operation on this pack.
- Broker assigned to the pack: can list files in operations they participate in.
- Admin: full access.
"""
import uuid
import base64
from fastapi import APIRouter, HTTPException, Request, Depends, UploadFile, File
from fastapi.responses import Response
from database import db
from security import get_current_user
from utils import now_iso, clean_doc, audit

router = APIRouter()


async def _can_see_pack_files(pack: dict, user: dict) -> bool:
    """True if the user can list/download files attached to a pack."""
    if user["role"] == "admin":
        return True
    user_company = user.get("company_id")
    # Owner (cedente)
    if pack["cedente_user_id"] == user["id"]:
        return True
    if user_company and user_company == pack.get("cedente_company_id"):
        return True
    # Reasegurador: any user from a company that has an operation on this pack where ALL NCAs are signed
    if user["role"] == "reasegurador" and user_company:
        ops_q = {
            "pack_id": pack["id"],
            "reasegurador_company_id": user_company,
            "nca_signed_cedente": True,
            "nca_signed_reasegurador": True,
            "state": {"$nin": ["cancelled"]},
        }
        async for op in db.operations.find(ops_q):
            # If operation has broker, broker NCA must also be signed
            if op.get("broker_user_id") and not op.get("nca_signed_broker"):
                continue
            return True
    # Broker
    if user["role"] == "broker" and pack.get("broker_id") == user["id"]:
        ops_q = {
            "pack_id": pack["id"],
            "broker_user_id": user["id"],
            "nca_signed_cedente": True,
            "nca_signed_reasegurador": True,
            "nca_signed_broker": True,
            "state": {"$nin": ["cancelled"]},
        }
        op = await db.operations.find_one(ops_q)
        if op:
            return True
    return False


def _is_pack_owner(pack: dict, user: dict) -> bool:
    if pack["cedente_user_id"] == user["id"]:
        return True
    user_company = user.get("company_id")
    if user_company and user_company == pack.get("cedente_company_id"):
        return True
    return False


@router.post("/submission-packs/{pack_id}/files")
async def upload_pack_file(pack_id: str, request: Request, file: UploadFile = File(...), is_preview: bool = False, user: dict = Depends(get_current_user)):
    pack = await db.submission_packs.find_one({"id": pack_id})
    if not pack:
        raise HTTPException(status_code=404, detail="Pack no encontrado")
    if not _is_pack_owner(pack, user) and user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Solo el propietario puede subir archivos")
    if not file.filename:
        raise HTTPException(status_code=400, detail="Archivo vacío")
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="El archivo no puede superar 10 MB")
    doc = {
        "id": str(uuid.uuid4()),
        "pack_id": pack_id,
        "filename": file.filename,
        "content_type": file.content_type or "application/octet-stream",
        "size": len(content),
        "is_preview": bool(is_preview),
        "uploaded_by": user["id"],
        "uploaded_at": now_iso(),
        "data": base64.b64encode(content).decode(),
    }
    await db.pack_files.insert_one(doc)
    await audit("pack_file.upload", user, "pack", pack_id, meta={"filename": file.filename, "size": len(content), "preview": bool(is_preview)}, request=request)
    return {"file": {k: v for k, v in doc.items() if k not in ("data", "_id")}}


@router.get("/submission-packs/{pack_id}/files")
async def list_pack_files(pack_id: str, user: dict = Depends(get_current_user)):
    pack = await db.submission_packs.find_one({"id": pack_id})
    if not pack:
        raise HTTPException(status_code=404)
    is_owner = _is_pack_owner(pack, user)
    can_see_all = await _can_see_pack_files(pack, user)
    if can_see_all:
        files = await db.pack_files.find({"pack_id": pack_id}, {"_id": 0, "data": 0}).sort("uploaded_at", 1).to_list(100)
        # Owners (cedente / admin) see everything as-is. Counterparties (reasegurador, broker)
        # see a snapshot frozen at the moment the NCA was completed in their operation.
        if not is_owner and user["role"] != "admin":
            user_company = user.get("company_id")
            op_filter = {"pack_id": pack_id, "state": {"$nin": ["cancelled"]}}
            if user["role"] == "reasegurador":
                op_filter["reasegurador_company_id"] = user_company
            elif user["role"] == "broker":
                op_filter["broker_user_id"] = user["id"]
            cutoff = None
            async for op in db.operations.find(op_filter):
                if not (op.get("nca_signed_cedente") and op.get("nca_signed_reasegurador")):
                    continue
                if op.get("broker_user_id") and not op.get("nca_signed_broker"):
                    continue
                # operation is fully NCA-signed for this counterparty → use the latest NCA signature as the freeze cutoff
                stamps = [op.get("nca_signed_at_cedente"), op.get("nca_signed_at_reasegurador")]
                if op.get("broker_user_id"):
                    stamps.append(op.get("nca_signed_at_broker"))
                ts = max([s for s in stamps if s], default=None)
                if ts and (cutoff is None or ts > cutoff):
                    cutoff = ts
            if cutoff:
                files = [f for f in files if (f.get("uploaded_at") or "") <= cutoff or f.get("is_preview")]
        return {"files": files, "locked": False, "is_owner": is_owner}
    # Anyone authenticated can see ONLY preview files (no NCA needed)
    preview = await db.pack_files.find({"pack_id": pack_id, "is_preview": True}, {"_id": 0, "data": 0}).sort("uploaded_at", 1).to_list(50)
    return {"files": preview, "locked": True, "is_owner": False}


@router.delete("/submission-packs/{pack_id}/files/{file_id}")
async def delete_pack_file(pack_id: str, file_id: str, request: Request, user: dict = Depends(get_current_user)):
    pack = await db.submission_packs.find_one({"id": pack_id})
    if not pack:
        raise HTTPException(status_code=404)
    if not _is_pack_owner(pack, user) and user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Solo el propietario puede eliminar archivos")
    res = await db.pack_files.delete_one({"id": file_id, "pack_id": pack_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404)
    await audit("pack_file.delete", user, "pack", pack_id, meta={"file_id": file_id}, request=request)
    return {"ok": True}


@router.get("/pack-files/{file_id}/download")
async def download_pack_file(file_id: str, user: dict = Depends(get_current_user)):
    f = await db.pack_files.find_one({"id": file_id})
    if not f:
        raise HTTPException(status_code=404)
    pack = await db.submission_packs.find_one({"id": f["pack_id"]})
    if not pack:
        raise HTTPException(status_code=404)
    # Preview files are accessible to anyone authenticated
    if not f.get("is_preview"):
        if not await _can_see_pack_files(pack, user):
            raise HTTPException(status_code=403, detail="Sin acceso al archivo (requiere NCA firmado)")
    data = base64.b64decode(f["data"])
    return Response(
        content=data,
        media_type=f["content_type"],
        headers={"Content-Disposition": f'attachment; filename="{f["filename"]}"'},
    )
