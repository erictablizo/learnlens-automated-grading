"""
NEW 2026-11-11 — PUT /exams/{exam_id}/answer-key/{question_number}

Save as: backend/app/api/routes/answer_key.py

REGISTER IT, exactly as for analytics.py:

    from app.api.routes import answer_key
    app.include_router(answer_key.router, prefix="/api")   # match the existing calls
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.answer_key import AnswerKeyItemUpdate, AnswerKeyUpdateResult
from app.services.answer_key_service import (
    update_key_item, AnswerKeyItemNotFound, BlankAnswerKey,
)
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/exams/{exam_id}/answer-key", tags=["answer key"])
bearer = HTTPBearer()


async def _uid(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> int:
    user = await get_current_user(db, credentials.credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user.user_id


@router.put("/{question_number}", response_model=AnswerKeyUpdateResult)
async def update_answer_key_item(
    exam_id: int,
    question_number: int,
    data: AnswerKeyItemUpdate,
    uid: int = Depends(_uid),
    db: AsyncSession = Depends(get_db),
):
    """Correct one answer key item and re-check it on every paper of this exam.

    This is the cascade BOTH reviewers asked for - Alex's "it will automatic
    updates all the checking of item # 2 in all Test Papers tie-up to this
    answer key" and Doc Rubrica's "If Ans-Key was corrected -> auto-upload for
    all".

    No images are read again: PaperScore already holds what each student
    wrote, so only the comparison is redone.

    404 covers both "no such exam of yours" and "no such item in the key",
    deliberately: the first must not confirm that another teacher's exam_id
    exists, and the second is a genuine not-found.

    422 when the answer is blank - grade_detected refuses to grade an exam
    with a blank key item, so this is a state the system must not be put into.
    """
    try:
        result = await update_key_item(
            db, exam_id, question_number, data.correct_answer, uid
        )
    except AnswerKeyItemNotFound as e:
        raise HTTPException(status_code=404, detail=str(e))
    except BlankAnswerKey as e:
        raise HTTPException(status_code=422, detail=str(e))

    if result is None:
        raise HTTPException(status_code=404, detail="Exam not found")
    return result