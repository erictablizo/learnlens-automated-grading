from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
 
from app.api import api_router
from app.core.config import settings
 
app = FastAPI(
    title=settings.APP_NAME,
    description="LearnLens Automated Grading API",
    version="1.0.0",
)
 
# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
 
app.include_router(api_router, prefix="/api/v1")
 
 
@app.get("/health")
async def health_check():
    return {"status": "ok", "app": settings.APP_NAME}