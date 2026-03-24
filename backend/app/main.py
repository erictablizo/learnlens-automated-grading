"""
main.py
-------
LearnLens Automated Grading — FastAPI application entry point.
 
Run locally:
    uvicorn app.main:app --reload --port 8000
 
Production:
    uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
"""
 
from contextlib import asynccontextmanager
from typing import AsyncGenerator
 
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
 
from app.core.config import settings
from app.core.database import engine, Base
 
# Import all models so Base.metadata is populated before create_all
import app.models  # noqa: F401
 
# Import routers
from app.api.routes import auth
 
 
# ── Lifespan (startup / shutdown) ──────────────────────────────────────────
@asynccontextmanager
async def lifespan(application: FastAPI) -> AsyncGenerator[None, None]:
    """
    Runs once on startup and once on shutdown.
 
    Startup  → (optional) verify DB connection is reachable.
    Shutdown → dispose the async engine connection pool cleanly.
 
    NOTE: We do NOT call Base.metadata.create_all() here because
    the schema is managed by learnlens_schema.sql.  If you ever want
    Alembic-free table creation in development, uncomment the block below.
    """
    # ── Startup ────────────────────────────────────────────────────────────
    # Uncomment to auto-create tables in development (skips Alembic):
    # async with engine.begin() as conn:
    #     await conn.run_sync(Base.metadata.create_all)
 
    print(f"🚀  LearnLens API starting — environment: {settings.APP_NAME}")
    yield
 
    # ── Shutdown ───────────────────────────────────────────────────────────
    await engine.dispose()
    print("🛑  LearnLens API shut down — database connections closed.")
 
 
# ── Application factory ────────────────────────────────────────────────────
def create_app() -> FastAPI:
    application = FastAPI(
        title="LearnLens API",
        description=(
            "Automated exam grading backend. "
            "Handles authentication, exam management, OCR answer-key parsing, "
            "and student paper scoring."
        ),
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )
 
    # ── CORS ───────────────────────────────────────────────────────────────
    # Allows the Next.js frontend (localhost:3000) to call the API.
    # In production, replace with your deployed frontend domain.
    application.add_middleware(
        CORSMiddleware,
        allow_origins=[
            settings.FRONTEND_URL,          # e.g. http://localhost:3000
            "http://localhost:3000",         # dev fallback
            "http://127.0.0.1:3000",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
 
    # ── Routers ────────────────────────────────────────────────────────────
    application.include_router(
        auth.router,
        prefix="/api/auth",
        tags=["Authentication"],
    )
    # Future routers (add as features are built):
    # application.include_router(exams.router,  prefix="/api/exams",  tags=["Exams"])
    # application.include_router(papers.router, prefix="/api/papers", tags=["Papers"])
    # application.include_router(grades.router, prefix="/api/grades", tags=["Grading"])
 
    return application
 
 
# ── App instance ───────────────────────────────────────────────────────────
app = create_app()
 
 
# ── Health check ───────────────────────────────────────────────────────────
@app.get("/", tags=["Health"], summary="Root health check")
async def root() -> JSONResponse:
    """
    Simple liveness probe.
    Returns 200 OK so load-balancers and Docker health checks can verify
    the API is reachable.
    """
    return JSONResponse(
        content={
            "status": "ok",
            "app": settings.APP_NAME,
            "version": "1.0.0",
            "docs": "/docs",
        }
    )
 
 
@app.get("/health", tags=["Health"], summary="Detailed health check")
async def health() -> JSONResponse:
    """
    Readiness probe — confirms DB engine is initialised.
    Does NOT execute a query (use a separate DB-ping endpoint for that).
    """
    return JSONResponse(
        content={
            "status": "healthy",
            "database": "connected" if engine else "unavailable",
        }
    )