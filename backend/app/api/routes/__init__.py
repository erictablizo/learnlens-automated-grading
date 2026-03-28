from fastapi import APIRouter
from app.api.routes import auth, exams, papers
router = APIRouter()
router.include_router(auth.router)
router.include_router(exams.router)
router.include_router(papers.router)