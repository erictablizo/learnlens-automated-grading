"""
NEW 2026-11-11 — GET /exams/{exam_id}/analytics

Save as: backend/app/api/routes/analytics.py

REGISTER IT. One line in backend/app/main.py, beside the others:

    from app.api.routes import analytics
    app.include_router(analytics.router, prefix="/api")      # match the existing calls

Without that line the endpoint does not exist and the page 404s.

A SEPARATE ROUTER, not an addition to routes/papers.py, because that file's
prefix is "/exams/{exam_id}/papers" and this path is a sibling of it, not a
child.
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.analytics import ExamAnalytics
from app.services.analytics_service import exam_item_analytics
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/exams/{exam_id}", tags=["analytics"])
bearer = HTTPBearer()


async def _uid(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> int:
    user = await get_current_user(db, credentials.credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user.user_id


@router.get("/analytics", response_model=ExamAnalytics)
async def exam_analytics(
    exam_id: int,
    uid: int = Depends(_uid),
    db: AsyncSession = Depends(get_db),
):
    """Per-item results for one exam.

    404 when the exam does not exist OR is not this teacher's - deliberately
    the same answer for both, so the endpoint cannot be used to discover which
    exam_ids exist. Same reasoning as rename_paper's 404.
    """
    result = await exam_item_analytics(db, exam_id, uid)
    if result is None:
        raise HTTPException(status_code=404, detail="Exam not found")
    return result