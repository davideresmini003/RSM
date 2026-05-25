"""
One-shot script to remove dev/test data from MongoDB.
Run manually: python clean_dev_data.py
"""
import asyncio
from database import db


async def main():
    # Remove test companies (name "ciao" or NIF with non-standard chars)
    r1 = await db.companies.delete_many({
        "$or": [
            {"name": {"$regex": "^ciao$", "$options": "i"}},
            {"tax_id": {"$regex": "[^a-zA-Z0-9\\-]"}},
        ]
    })
    print(f"Deleted {r1.deleted_count} dev companies")

    # Remove TEST_ packs
    r2 = await db.submission_packs.delete_many({"title": {"$regex": "^TEST_", "$options": "i"}})
    print(f"Deleted {r2.deleted_count} test packs")

    # Normalize country_region casing on existing packs
    cursor = db.submission_packs.find({"country_region": {"$exists": True, "$ne": ""}}, {"_id": 0, "id": 1, "country_region": 1})
    updated = 0
    async for p in cursor:
        normalized = (p.get("country_region") or "").strip().title()
        if normalized != p.get("country_region"):
            await db.submission_packs.update_one({"id": p["id"]}, {"$set": {"country_region": normalized}})
            updated += 1
    print(f"Normalized country_region on {updated} packs")


if __name__ == "__main__":
    asyncio.run(main())
