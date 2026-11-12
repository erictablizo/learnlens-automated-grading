"""
app/api/routes/key_image.py
===========================
NEW 2026-11-12 — POST /exams/{exam_id}/answer-key/from-image

    Alex Passion, post-UAT page 3:
    "For uploading the Answer Key, an option to upload image of enumerated
     List of answers only (without the questionnaire)."

REGISTER IT. One line in `backend/app/api/routes/__init__.py`, beside the
others - NOT in main.py, which does `from app.api.routes import router` and
names no individual router.

A SEPARATE ROUTER, like analytics.py and export.py, rather than an addition to
routes/papers.py, whose prefix is "/exams/{exam_id}/papers" - this path is a
sibling of that, not a child. It also sits beside answer_key.py's
`PUT /answer-key/{question_number}` without colliding: different method, and
"from-image" could never parse as a question number anyway.

TWO ENDPOINTS, NOT ONE
----------------------
Reading is free. Writing re-checks every paper in the exam and re-totals every
affected student. The OCR is 100% on printed keys and 95% on the handwritten
sheet it was measured against - which is to say it is wrong sometimes, and a
wrong answer key silently re-scores a whole section. So the image is read, the
teacher confirms, and only then is anything written.
"""
import os
import tempfile
from typing import Optional

from fastapi import (
    APIRouter, Depends, File, Form, HTTPException, UploadFile,
)
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.key_image import (
    KeyImageApply, KeyImageApplyResult, KeyImagePreview,
)
from app.services import key_image_service
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/exams/{exam_id}", tags=["answer-key"])
bearer = HTTPBearer()

# A phone photo of one page is 2-8 MB. 15 lets a high-resolution scan through
# and still refuses a video somebody picked by accident.
MAX_UPLOAD_BYTES = 15 * 1024 * 1024
ALLOWED_SUFFIXES = (".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".webp")


async def _uid(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> int:
    user = await get_current_user(db, credentials.credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user.user_id


def _suffix_of(name: Optional[str]) -> str:
    ext = os.path.splitext(name or "")[1].lower()
    if ext not in ALLOWED_SUFFIXES:
        raise HTTPException(
            status_code=422,
            detail=("That file is not an image. Upload a photo or scan of the "
                    "answer list (JPG or PNG)."),
        )
    return ext


@router.post("/answer-key/from-image", response_model=KeyImagePreview)
async def preview_key_image(
    exam_id: int,
    page_id: int = Form(...),
    file: UploadFile = File(...),
    uid: int = Depends(_uid),
    db: AsyncSession = Depends(get_db),
):
    """Read an enumerated answer list. WRITES NOTHING.

    404 when the exam is not this teacher's OR the page is not in that exam -
    deliberately the same answer for both, so the endpoint cannot be used to
    discover which exam_ids or page_ids exist. Same reasoning as
    `exam_analytics` and `update_key_item`.
    """
    suffix = _suffix_of(file.filename)
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail="That image is larger than 15 MB. Please use a smaller photo.",
        )
    if not data:
        raise HTTPException(status_code=422, detail="That file is empty.")

    # A TEMP FILE, deleted in `finally`. Exam pages are kept because the
    # viewer displays them; a key image is consumed once and everything it
    # said comes back in the preview, so keeping it would be disk and a
    # privacy surface for nothing. Written to disk at all only because
    # cv2.imread takes a path.
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    try:
        tmp.write(data)
        tmp.close()
        try:
            result = await key_image_service.preview(db, exam_id, page_id, tmp.name, uid)
        except ValueError as e:
            # read_key_image raises this for a file OpenCV cannot decode - a
            # .jpg that is not really a jpg, or a corrupt upload.
            raise HTTPException(status_code=422, detail=str(e))
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass

    if result is None:
        raise HTTPException(status_code=404, detail="Exam page not found")
    if not result["items"]:
        raise HTTPException(
            status_code=422,
            detail=("No numbered answers were found in that image. It should be "
                    "a list like \"1. A\" with one answer per line, and nothing "
                    "else on the page."),
        )
    return result


@router.post("/answer-key/from-image/apply", response_model=KeyImageApplyResult)
async def apply_key_image(
    exam_id: int,
    body: KeyImageApply,
    uid: int = Depends(_uid),
    db: AsyncSession = Depends(get_db),
):
    """Write the confirmed answers, re-checking every paper as it goes.

    Each item goes through `answer_key_service.update_key_item`, so the
    cascade, the re-total and the "back to review" rule are the same code a
    manual edit runs. Nothing about grading is reimplemented here.
    """
    answers = {i.question_number: i.answer for i in body.items}
    result = await key_image_service.apply(db, exam_id, answers, uid)
    if result is None:
        raise HTTPException(status_code=404, detail="Exam not found")
    return result