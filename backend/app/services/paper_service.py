import os, shutil
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from fastapi import UploadFile
 
from app.models.models import TestPaper, PaperPage, PaperScore, Exam
from app.core.config import settings
from app.services.ocr_service import grade_paper
 
 
async def get_papers(db: AsyncSession, exam_id: int, user_id: int) -> List[TestPaper]:
    exam_result = await db.execute(
        select(Exam).where(Exam.exam_id == exam_id, Exam.created_by == user_id)
    )
    if not exam_result.scalar_one_or_none():
        return []
    result = await db.execute(
        select(TestPaper)
        .where(TestPaper.exam_id == exam_id)
        .order_by(TestPaper.added_at.desc())
    )
    return list(result.scalars().all())
 
 
async def get_paper(db: AsyncSession, paper_id: int) -> Optional[TestPaper]:
    result = await db.execute(
        select(TestPaper)
        .options(
            selectinload(TestPaper.paper_pages),
            selectinload(TestPaper.paper_scores),
        )
        .where(TestPaper.paper_id == paper_id)
    )
    return result.scalar_one_or_none()
 
 
async def create_paper(db: AsyncSession, exam_id: int, student_name: str) -> TestPaper:
    paper = TestPaper(exam_id=exam_id, student_name=student_name)
    db.add(paper)
    await db.commit()
    await db.refresh(paper)
    return paper
 
 
async def delete_paper(db: AsyncSession, paper_id: int) -> bool:
    result = await db.execute(select(TestPaper).where(TestPaper.paper_id == paper_id))
    paper  = result.scalar_one_or_none()
    if not paper:
        return False
    await db.delete(paper)
    await db.commit()
    return True
 
 
async def add_paper_page(
    db: AsyncSession,
    paper_id:    int,
    page_number: int,
    file:        UploadFile,
) -> PaperPage:
    upload_dir = os.path.join(settings.UPLOAD_DIR, "paper_pages", str(paper_id))
    os.makedirs(upload_dir, exist_ok=True)
    ext       = os.path.splitext(file.filename or "page.jpg")[1] or ".jpg"
    file_path = os.path.join(upload_dir, f"page_{page_number}{ext}")
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
 
    page = PaperPage(
        paper_id    = paper_id,
        page_number = page_number,
        image_path  = file_path,
    )
    db.add(page)
    await db.commit()
    await db.refresh(page)
    return page
 
 
async def grade_and_update(
    db:       AsyncSession,
    paper_id: int,
    exam_id:  int,
) -> dict:
    """Grade the paper and return a result summary."""
    return await grade_paper(db, paper_id, exam_id)