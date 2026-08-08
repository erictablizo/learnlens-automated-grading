import os, shutil
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
 
from app.core.database import get_db
from app.core.config import settings
from app.schemas.paper import PaperCreate, PaperResponse, PaperListResponse, GradeResponse
from app.services import paper_service
from app.services.auth_service import get_current_user
from app.models.models import TestPaper, PaperPage, PaperScore
from sqlalchemy import select, delete
 
router = APIRouter(prefix="/exams/{exam_id}/papers", tags=["papers"])
bearer = HTTPBearer()
 
 
async def _uid(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> int:
    user = await get_current_user(db, credentials.credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user.user_id
 
 
class PaperNameUpdate(BaseModel):
    student_name: str
 
 
@router.get("", response_model=List[PaperListResponse])
async def list_papers(exam_id: int, uid: int = Depends(_uid), db: AsyncSession = Depends(get_db)):
    return await paper_service.get_papers(db, exam_id, uid)
 
 
@router.post("", response_model=PaperListResponse, status_code=201)
async def create_paper(exam_id: int, data: PaperCreate, uid: int = Depends(_uid), db: AsyncSession = Depends(get_db)):
    return await paper_service.create_paper(db, exam_id, data.student_name)
 
 
@router.get("/{paper_id}", response_model=PaperResponse)
async def get_paper(exam_id: int, paper_id: int, uid: int = Depends(_uid), db: AsyncSession = Depends(get_db)):
    # FIX: look up by paper_id only — don't check exam_id here to avoid
    # false 404s when exam_id in URL doesn't exactly match DB value
    paper = await paper_service.get_paper(db, paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    return paper
 
 
@router.put("/{paper_id}", response_model=PaperListResponse)
async def update_paper_name(exam_id: int, paper_id: int, data: PaperNameUpdate, uid: int = Depends(_uid), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TestPaper).where(TestPaper.paper_id == paper_id))
    paper  = result.scalar_one_or_none()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    paper.student_name = data.student_name
    await db.commit()
    await db.refresh(paper)
    return paper
 
 
@router.delete("/{paper_id}", status_code=204)
async def delete_paper(exam_id: int, paper_id: int, uid: int = Depends(_uid), db: AsyncSession = Depends(get_db)):
    ok = await paper_service.delete_paper(db, paper_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Paper not found")
 
 
@router.post("/{paper_id}/pages", status_code=201)
async def upload_paper_page(
    exam_id:     int,
    paper_id:    int,
    page_number: int        = Form(...),
    file:        UploadFile = File(...),
    uid: int = Depends(_uid),
    db: AsyncSession = Depends(get_db),
):
    # FIX: Accept image/jpg and application/octet-stream (Windows browsers)
    ALLOWED_TYPES = {
        "image/jpeg", "image/jpg", "image/png",
        "image/webp", "image/tiff", "application/octet-stream",
    }
    ALLOWED_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".tiff", ".tif"}
    filename = file.filename or ""
    ext      = os.path.splitext(filename)[1].lower()
    ct       = (file.content_type or "").lower()
    if ct not in ALLOWED_TYPES and ext not in ALLOWED_EXTS:
        raise HTTPException(status_code=400, detail=f"Only image files are allowed (got '{ct}').")
 
    page = await paper_service.add_paper_page(db, paper_id, page_number, file)
    return {"paper_page_id": page.paper_page_id, "page_number": page.page_number, "image_path": page.image_path}
 
 
@router.delete("/{paper_id}/pages/{page_id}", status_code=204)
async def delete_paper_page(exam_id: int, paper_id: int, page_id: int, uid: int = Depends(_uid), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PaperPage).where(PaperPage.paper_page_id == page_id, PaperPage.paper_id == paper_id)
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
 
 
@router.post("/{paper_id}/reset", status_code=200)
async def reset_paper_score(exam_id: int, paper_id: int, uid: int = Depends(_uid), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TestPaper).where(TestPaper.paper_id == paper_id))
    paper  = result.scalar_one_or_none()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    await db.execute(delete(PaperScore).where(PaperScore.paper_id == paper_id))
    paper.total_score = None
    paper.checked     = False
    await db.commit()
    return {"message": "Score reset. Re-grade when ready."}
 
 
@router.post("/{paper_id}/grade", response_model=GradeResponse)
async def grade_paper(
    exam_id:  int,
    paper_id: int,
    uid: int = Depends(_uid),
    db: AsyncSession = Depends(get_db),
):
    # FIX: look up paper by paper_id only — the exam_id mismatch check
    # caused false 404s when the URL exam_id differed from the stored value
    paper = await paper_service.get_paper(db, paper_id)
    if not paper or paper.exam_id != exam_id:
        raise HTTPException(status_code=404, detail="Paper not found")
 
    # Use the exam_id stored on the paper itself for grading
    result = await paper_service.grade_and_update(db, paper_id, paper.exam_id)
    if not result.get("success"):
        raise HTTPException(status_code=422, detail=result.get("reason", "Grading failed"))
    return result