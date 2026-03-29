from fastapi import APIRouter
from app.api.routes.auth import router as auth_router
from app.api.routes.exams import router as exams_router
from app.api.routes.papers import router as papers_router
 
router = APIRouter()
router.include_router(auth_router)
router.include_router(exams_router)
router.include_router(papers_router)