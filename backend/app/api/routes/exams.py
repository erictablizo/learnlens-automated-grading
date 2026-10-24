import os, shutil, uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.config import settings
from app.schemas.exam import (
    ExamCreate, ExamUpdate, ExamResponse, ExamListResponse, GenerateAnswerKeyResponse,
    ExamPageNumberUpdate, ExamPageNumberResponse,          # NEW 2026-09-29
    # NEW 2026-10-24 — declared parts (add these to app/schemas/exam.py)
    ExamPagePartsRequest, ExamPagePartResponse, GenerateAnswerKeyPartsResponse,
)
from app.services import exam_service
from app.services.auth_service import get_current_user
from app.models.models import ExamPage

router = APIRouter(prefix="/exams", tags=["exams"])
bearer = HTTPBearer()

ALLOWED_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/tiff", "application/octet-stream"}
ALLOWED_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"}
MAX_UPLOAD_MB = 15


async def current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> int:
    user = await get_current_user(db, credentials.credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user.user_id


@router.get("", response_model=List[ExamListResponse])
async def list_exams(uid: int = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    return await exam_service.get_exams(db, uid)


@router.post("", response_model=ExamListResponse, status_code=201)
async def create_exam(data: ExamCreate, uid: int = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    return await exam_service.create_exam(db, uid, data.exam_name, data.description)


@router.get("/{exam_id}", response_model=ExamResponse)
async def get_exam(exam_id: int, uid: int = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    exam = await exam_service.get_exam(db, exam_id, uid)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    return exam


@router.get("/{exam_id}/has-checked-papers")
async def check_has_checked_papers(exam_id: int, uid: int = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    if not await exam_service.get_exam(db, exam_id, uid):
        raise HTTPException(status_code=404, detail="Exam not found")
    return {"has_checked_papers": await exam_service.has_checked_papers(db, exam_id)}


@router.put("/{exam_id}", response_model=ExamListResponse)
async def update_exam(exam_id: int, data: ExamUpdate, uid: int = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    exam = await exam_service.update_exam(db, exam_id, uid, exam_name=data.exam_name, description=data.description)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    return exam


@router.delete("/{exam_id}", status_code=204)
async def delete_exam(exam_id: int, uid: int = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    if not await exam_service.delete_exam(db, exam_id, uid):
        raise HTTPException(status_code=404, detail="Exam not found")


@router.post("/{exam_id}/pages", status_code=201)
async def upload_exam_page(
    exam_id:     int,
    page_number: int        = Form(...),
    file:        UploadFile = File(...),
    uid: int = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
):
    exam = await exam_service.get_exam(db, exam_id, uid)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    if page_number < 1:
        raise HTTPException(status_code=400, detail="Page number must be 1 or higher.")

    # FIX 2026-09-22: "No image uploaded" check on the server too, and accept
    # image/jpg + application/octet-stream (Windows) like the papers route does.
    filename = file.filename or ""
    ext = os.path.splitext(filename)[1].lower()
    ct = (file.content_type or "").lower()
    if not filename:
        raise HTTPException(status_code=400, detail=f"No image uploaded for page {page_number}.")
    if ct not in ALLOWED_TYPES and ext not in ALLOWED_EXTS:
        raise HTTPException(status_code=400, detail="Only image files (JPG, PNG, WEBP, TIFF) are allowed.")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail=f"The image for page {page_number} is empty.")
    if len(data) > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"Image is larger than {MAX_UPLOAD_MB} MB.")

    upload_dir = os.path.join(settings.UPLOAD_DIR, "exam_pages", str(exam_id))
    os.makedirs(upload_dir, exist_ok=True)
    # unique name -> replacing a page never serves the old cached image
    file_path = os.path.join(upload_dir, f"page_{page_number}_{uuid.uuid4().hex[:8]}{ext or '.jpg'}")
    with open(file_path, "wb") as f:
        f.write(data)
    page = await exam_service.add_exam_page(db, exam_id, page_number, file_path)
    await exam_service.reset_exam_paper_scores(db, exam_id)
    return {"page_id": page.page_id, "page_number": page.page_number, "image_path": file_path}


# NEW 2026-09-29 (Edit Exam enhancement): change a page's NUMBER without
# re-uploading its image. Numbers stay 1..N, so this swaps with the page that
# currently holds the target number. Needs set_page_number() in exam_service.py
# and ExamPageNumberUpdate / ExamPageNumberResponse in schemas/exam.py.
@router.put("/{exam_id}/pages/{page_id}", response_model=ExamPageNumberResponse)
async def set_exam_page_number(
    exam_id: int,
    page_id: int,
    data: ExamPageNumberUpdate,
    uid: int = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
):
    if not await exam_service.get_exam(db, exam_id, uid):
        raise HTTPException(status_code=404, detail="Exam not found")
    result = await exam_service.set_page_number(db, exam_id, page_id, data.page_number)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("reason", "Could not move this page."))
    return result


@router.delete("/{exam_id}/pages/{page_id}", status_code=204)
async def delete_exam_page(exam_id: int, page_id: int, uid: int = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    if not await exam_service.get_exam(db, exam_id, uid):
        raise HTTPException(status_code=404, detail="Exam not found")
    page = (await db.execute(
        select(ExamPage).where(ExamPage.page_id == page_id, ExamPage.exam_id == exam_id)
    )).scalar_one_or_none()
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    if os.path.exists(page.image_path):
        try:
            os.remove(page.image_path)
        except OSError:
            pass
    await db.delete(page)
    await db.commit()
    await exam_service.renumber_answer_keys(db, exam_id)   # FIX: keep 1..N after a page is removed
    await exam_service.reset_exam_paper_scores(db, exam_id)


@router.post("/{exam_id}/answer-key/generate", response_model=GenerateAnswerKeyResponse)
async def generate_answer_key(
    exam_id: int,
    page_id: int,
    question_type: str = Query("encircled"),
    # NEW 2026-09-22: "Number of items on this page" from the Select Question Type dialog
    expected_items: Optional[int] = Query(None, ge=1, le=200),
    uid: int = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
):
    if not await exam_service.get_exam(db, exam_id, uid):
        raise HTTPException(status_code=404, detail="Exam not found")
    result = await exam_service.generate_answer_key(db, exam_id, page_id, question_type, expected_items)
    if not result.get("success"):
        raise HTTPException(status_code=422, detail=result.get("reason", "Answer key generation failed."))
    return result


# ---------------------------------------------------------------------------
# NEW 2026-10-24 — declared parts (Doc Rubrica's sixth comment)
#
# One question_type per page cannot describe her English 101 sheet: page 2
# alone has item 12 encircled, items 13-18 as letters written on blanks,
# 19-24 identification and 25-30 True/False. These three endpoints let the
# teacher declare the ranges, read them back, and clear them again.
#
# The parts are PERSISTED because a paper must be read with the same ranges
# its key was built with: infer_question_type() cannot tell `encircled` from
# `written_letter`, since both store a bare letter.
# ---------------------------------------------------------------------------

@router.post("/{exam_id}/answer-key/generate-parts",
             response_model=GenerateAnswerKeyPartsResponse)
async def generate_answer_key_with_parts(
    exam_id: int,
    data: ExamPagePartsRequest,
    page_id: int = Query(...),
    uid: int = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Generate one page's answer key from declared item ranges, and store them.

    422 rather than 400 on a rejected declaration, to match the existing
    /answer-key/generate endpoint: both fail on content the client could not
    have known was wrong (overlapping ranges, an unreadable photo).
    """
    if not await exam_service.get_exam(db, exam_id, uid):
        raise HTTPException(status_code=404, detail="Exam not found")
    result = await exam_service.generate_answer_key_parts(
        db, exam_id, page_id, [p.model_dump() for p in data.parts]
    )
    if not result.get("success"):
        raise HTTPException(status_code=422,
                            detail=result.get("reason", "Answer key generation failed."))
    return result


@router.get("/{exam_id}/pages/{page_id}/parts",
            response_model=List[ExamPagePartResponse])
async def get_exam_page_parts(
    exam_id: int,
    page_id: int,
    uid: int = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """What this page was declared as. The Declare Parts dialog reads this to
    show the teacher her previous ranges instead of an empty form."""
    if not await exam_service.get_exam(db, exam_id, uid):
        raise HTTPException(status_code=404, detail="Exam not found")
    page = (await db.execute(
        select(ExamPage).where(ExamPage.page_id == page_id, ExamPage.exam_id == exam_id)
    )).scalar_one_or_none()
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    return await exam_service.get_page_parts(db, page_id)


@router.delete("/{exam_id}/pages/{page_id}/parts", status_code=200)
async def clear_exam_page_parts(
    exam_id: int,
    page_id: int,
    uid: int = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Go back to one question type for the whole page.

    `generate_answer_key()` refuses to overwrite a page that has declared
    parts, so without this a page declared once could never be un-declared.
    This also drops that page's answer key, which was generated from the
    ranges being removed. 200 with a body rather than 204, because the teacher
    needs to be told the key went with them.
    """
    if not await exam_service.get_exam(db, exam_id, uid):
        raise HTTPException(status_code=404, detail="Exam not found")
    page = (await db.execute(
        select(ExamPage).where(ExamPage.page_id == page_id, ExamPage.exam_id == exam_id)
    )).scalar_one_or_none()
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    removed = await exam_service.clear_page_parts(db, exam_id, page_id)
    return {
        "success": True,
        "removed": removed,
        "message": (f"{removed} declared part(s) and this page's answer key were removed. "
                    "Generate the key again with one question type, or declare new ranges."
                    if removed else "This page had no declared parts."),
    }