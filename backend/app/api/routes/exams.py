import os, shutil
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
 
from app.core.database import get_db
from app.core.config import settings
from app.schemas.exam import ExamCreate, ExamUpdate, ExamResponse, ExamListResponse
from app.services import exam_service
from app.services.auth_service import get_current_user
from app.models.models import ExamPage
 
router = APIRouter(prefix="/exams", tags=["exams"])
bearer = HTTPBearer()
 
 
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
 
 
@router.put("/{exam_id}", response_model=ExamListResponse)
async def update_exam(exam_id: int, data: ExamUpdate, uid: int = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    exam = await exam_service.update_exam(db, exam_id, uid, exam_name=data.exam_name, description=data.description)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    return exam
 
 
@router.delete("/{exam_id}", status_code=204)
async def delete_exam(exam_id: int, uid: int = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    ok = await exam_service.delete_exam(db, exam_id, uid)
    if not ok:
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
    allowed = {"image/jpeg", "image/png", "image/webp", "image/tiff"}
    if file.content_type not in allowed:
        raise HTTPException(status_code=400, detail="Only image files are allowed.")
    upload_dir = os.path.join(settings.UPLOAD_DIR, "exam_pages", str(exam_id))
    os.makedirs(upload_dir, exist_ok=True)
    ext       = os.path.splitext(file.filename or "page.jpg")[1] or ".jpg"
    file_path = os.path.join(upload_dir, f"page_{page_number}{ext}")
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    page = await exam_service.add_exam_page(db, exam_id, page_number, file_path)
    return {"page_id": page.page_id, "page_number": page.page_number, "image_path": file_path}
 
 
@router.delete("/{exam_id}/pages/{page_id}", status_code=204)
async def delete_exam_page(
    exam_id: int,
    page_id: int,
    uid: int = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
):
    exam = await exam_service.get_exam(db, exam_id, uid)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
 
    result = await db.execute(
        select(ExamPage).where(ExamPage.page_id == page_id, ExamPage.exam_id == exam_id)
    )
    page = result.scalar_one_or_none()
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
 
    if os.path.exists(page.image_path):
        try:
            os.remove(page.image_path)
        except OSError:
            pass
 
    await db.delete(page)
    await db.commit()
 
 
@router.post("/{exam_id}/answer-key/generate")
async def generate_answer_key(
    exam_id: int,
    page_id: int,
    uid: int = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
):
    exam = await exam_service.get_exam(db, exam_id, uid)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    result = await exam_service.generate_answer_key(db, exam_id, page_id)
    if not result.get("success"):
        raise HTTPException(status_code=422, detail=result.get("reason", "Answer key generation failed."))
    return result