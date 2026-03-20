from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.routes import api_router
 
app = FastAPI(title=settings.APP_NAME, debug=settings.DEBUG)
 
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
 
app.include_router(api_router)
 
 
@app.get("/health")
async def health():
    return {"status": "ok", "app": settings.APP_NAME}