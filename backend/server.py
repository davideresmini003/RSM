from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import logging
from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware
from database import client
from seed import seed_database
from routers import auth, marketplace, operations, broker, admin, support, pack_files, notifications

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="RSM - Reinsurance Software Marketplace")

app.include_router(auth.router, prefix="/api")
app.include_router(marketplace.router, prefix="/api")
app.include_router(operations.router, prefix="/api")
app.include_router(broker.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(support.router, prefix="/api")
app.include_router(pack_files.router, prefix="/api")
app.include_router(notifications.router, prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    await seed_database()


@app.on_event("shutdown")
async def on_shutdown():
    client.close()
