from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
 
from app.core.config import settings
 
# ── Import models FIRST so SQLAlchemy's mapper registry is populated ──────────
from app.models import models as _models  # noqa: F401
 
from app.api.routes import router
 
app = FastAPI(
    title="LearnLens API",
    version="1.0.0",
    description="Automated exam grading backend",
)
 
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
 
# Serve uploaded images as static files
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")
 
app.include_router(router, prefix="/api")
 
 
@app.get("/health", tags=["health"])
async def health():
    return {"status": "ok", "service": "LearnLens API"}