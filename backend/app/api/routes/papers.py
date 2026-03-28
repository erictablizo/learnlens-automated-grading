import os, shutil
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
 
from app.core.database import get_db
from app.core.config import settings
from app.schemas.paper import PaperCreate, PaperResponse, PaperListResponse
from app.services import paper_service
from app.services.auth_service import get_current_user
 
router = APIRouter(prefix="/exams/{exam_id}/papers", tags=["papers"])
bearer = HTTPBearer()
 
 
async def current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> int:
    user = await get_current_user(db, credentials.credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user.user_id
 
 
@router.get("", response_model=List[PaperListResponse])
async def list_papers(exam_id: int, uid: int = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    return await paper_service.get_papers(db, exam_id, uid)
 
 
@router.post("", response_model=PaperListResponse, status_code=201)
async def create_paper(
    exam_id: int, data: PaperCreate,
    uid: int = Depends(current_user_id), db: AsyncSession = Depends(get_db)
):
    return await paper_service.create_paper(db, exam_id, data.student_name)
 
 
@router.get("/{paper_id}", response_model=PaperResponse)
async def get_paper(exam_id: int, paper_id: int, uid: int = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    paper = await paper_service.get_paper(db, paper_id)
    if not paper or paper.exam_id != exam_id:
        raise HTTPException(status_code=404, detail="Paper not found")
    return paper
 
 
@router.delete("/{paper_id}", status_code=204)
async def delete_paper(exam_id: int, paper_id: int, uid: int = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    ok = await paper_service.delete_paper(db, paper_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Paper not found")
 
 
@router.post("/{paper_id}/pages", status_code=201)
async def upload_paper_page(
    exam_id: int, paper_id: int,
    page_number: int = Form(...),
    file: UploadFile = File(...),
    uid: int = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
):
    upload_dir = os.path.join(settings.UPLOAD_DIR, "paper_pages", str(paper_id))
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, f"page_{page_number}_{file.filename}")
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    page = await paper_service.add_paper_page(db, paper_id, page_number, file_path)
    return {"paper_page_id": page.paper_page_id, "image_path": file_path}