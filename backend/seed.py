import uuid
import logging
from database import db
from security import hash_password, verify_password
from config import DEMO_PASSWORD, ADMIN_EMAIL, ADMIN_PASSWORD
from utils import now_iso

log = logging.getLogger("rsm")


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
        if not verify_password(DEMO_PASSWORD, u["password_hash"]):
            await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_password(DEMO_PASSWORD)}})


async def seed_database():
    # Indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.companies.create_index("id", unique=True)
    await db.submission_packs.create_index("id", unique=True)
    await db.operations.create_index("id", unique=True)
    await db.audit_log.create_index("timestamp")
    await db.audit_log.create_index("action")
    await db.audit_log.create_index("user_id")

    # Auto-verify all companies for users who completed onboarding (demo env)
    async for u in db.users.find({"onboarding_complete": True, "role": {"$ne": "admin"}}):
        if u.get("company_id"):
            await db.companies.update_one(
                {"id": u["company_id"], "verified": False},
                {"$set": {"verified": True}}
            )

    # Admin
    admin_email = ADMIN_EMAIL.lower()
    await db.users.delete_many({"role": "admin", "email": {"$ne": admin_email}})
    admin = await db.users.find_one({"email": admin_email})
    if not admin:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "password_hash": hash_password(ADMIN_PASSWORD),
            "name": "RSM Admin",
            "role": "admin",
            "company_id": None,
            "verified": True,
            "onboarding_complete": True,
            "created_at": now_iso(),
        })
        log.info(f"Seeded admin: {admin_email}")
    else:
        update = {"role": "admin", "verified": True, "onboarding_complete": True}
        if not verify_password(ADMIN_PASSWORD, admin["password_hash"]):
            update["password_hash"] = hash_password(ADMIN_PASSWORD)
        await db.users.update_one({"email": admin_email}, {"$set": update})
        if admin.get("role") != "admin":
            log.info(f"Promoted existing user to admin: {admin_email}")

    # Demo users
    await _ensure_demo_user(
        "cedente@demo.eu", "Carla Demo", "cedente",
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
        "reasegurador@demo.eu", "Roberto Demo", "reasegurador",
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
        "broker@demo.eu", "Beatriz Demo", "broker",
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

    # Broker profile
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

    # Demo submission packs
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
            from utils import anon_code
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
