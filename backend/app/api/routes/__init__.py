from fastapi import APIRouter
from app.api.routes.auth import router as auth_router
from app.api.routes.exams import router as exams_router
from app.api.routes.papers import router as papers_router
from app.api.routes.profile import router as profile_router
from app.api.routes.analytics import router as analytics_router        # NEW 2026-11-11
from app.api.routes.answer_key import router as answer_key_router      # NEW 2026-11-11
from app.api.routes.students import router as students_router          # NEW 2026-11-12
from app.api.routes.export import router as export_router        # NEW 2026-11-12
from app.api.routes.key_image import router as key_image_router    # NEW 2026-11-12

router = APIRouter()
router.include_router(auth_router)
router.include_router(profile_router)
router.include_router(exams_router)
router.include_router(papers_router)
router.include_router(analytics_router)        # NEW 2026-11-11 — Data Analytics page
router.include_router(answer_key_router)       # NEW 2026-11-11 — answer-key cascade
router.include_router(students_router)         # NEW 2026-11-12 — student roster
router.include_router(export_router)        # NEW 2026-11-12 — Excel export
router.include_router(key_image_router)      # NEW 2026-11-12 — answer key from an image