import os, shutil
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
 
from app.core.database import get_db
from app.core.config import settings
from app.schemas.exam import ExamCreate, ExamUpdate, ExamResponse, ExamListResponse
from app.services import exam_service
from app.services.auth_service import get_current_user
 
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
async def update_exam(
    exam_id: int, data: ExamUpdate,
    uid: int = Depends(current_user_id), db: AsyncSession = Depends(get_db)
):
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
    exam_id: int,
    page_number: int = Form(...),
    file: UploadFile = File(...),
    uid: int = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
):
    exam = await exam_service.get_exam(db, exam_id, uid)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    upload_dir = os.path.join(settings.UPLOAD_DIR, "exam_pages", str(exam_id))
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, f"page_{page_number}_{file.filename}")
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    page = await exam_service.add_exam_page(db, exam_id, page_number, file_path)
    return {"page_id": page.page_id, "image_path": file_path}
 
 
@router.post("/{exam_id}/answer-key/generate")
async def generate_answer_key(
    exam_id: int, page_id: int,
    uid: int = Depends(current_user_id), db: AsyncSession = Depends(get_db)
):
    exam = await exam_service.get_exam(db, exam_id, uid)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    keys = await exam_service.generate_answer_key(db, exam_id, page_id)
    return {"answer_keys": keys, "message": "Answer key generation triggered (OCR pending)"}