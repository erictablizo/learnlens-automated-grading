import os, shutil, uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.config import settings
from app.schemas.exam import ExamCreate, ExamUpdate, ExamResponse, ExamListResponse, GenerateAnswerKeyResponse
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