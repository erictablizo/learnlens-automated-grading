from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
 
from app.core.config import settings
from app.api.routes import router
 
app = FastAPI(title="LearnLens API", version="1.0.0")
 
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
 
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")
 
app.include_router(router, prefix="/api")
 
 
@app.get("/health")
async def health():
    return {"status": "ok"}