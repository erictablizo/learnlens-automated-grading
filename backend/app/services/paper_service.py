import os, uuid
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload
from fastapi import UploadFile

from app.models.models import TestPaper, PaperPage, PaperScore, Exam
from app.core.config import settings
from app.services.ocr_service import grade_paper


async def get_papers(db: AsyncSession, exam_id: int, user_id: int) -> List[TestPaper]:
    exam = (await db.execute(
        select(Exam).where(Exam.exam_id == exam_id, Exam.created_by == user_id)
    )).scalar_one_or_none()
    if not exam:
        return []
    result = await db.execute(
        select(TestPaper).where(TestPaper.exam_id == exam_id).order_by(TestPaper.added_at.desc())
    )
    return list(result.scalars().all())


async def get_paper(db: AsyncSession, paper_id: int) -> Optional[TestPaper]:
    result = await db.execute(
        select(TestPaper)
        .options(selectinload(TestPaper.paper_pages), selectinload(TestPaper.paper_scores))
        .where(TestPaper.paper_id == paper_id)
    )
    return result.scalar_one_or_none()


async def create_paper(db: AsyncSession, exam_id: int, student_name: str) -> TestPaper:
    paper = TestPaper(exam_id=exam_id, student_name=student_name.strip())
    db.add(paper)
    await db.commit()
    await db.refresh(paper)
    return paper


async def delete_paper(db: AsyncSession, paper_id: int) -> bool:
    paper = (await db.execute(select(TestPaper).where(TestPaper.paper_id == paper_id))).scalar_one_or_none()
    if not paper:
        return False
    paths = (await db.execute(select(PaperPage.image_path).where(PaperPage.paper_id == paper_id))).scalars().all()
    await db.delete(paper)
    await db.commit()
    for p in paths:
        try:
            if os.path.exists(p):
                os.remove(p)
        except OSError:
            pass
    return True


async def add_paper_page(db: AsyncSession, paper_id: int, page_number: int, file: UploadFile) -> PaperPage:
    """
    FIX 2026-09-22: re-uploading page N (Edit Paper) crashed on the
    (paper_id, page_number) unique key. The page is now replaced, and because
    the old score came from the old photo, the paper is marked unchecked.
    """
    upload_dir = os.path.join(settings.UPLOAD_DIR, "paper_pages", str(paper_id))
    os.makedirs(upload_dir, exist_ok=True)
    ext = os.path.splitext(file.filename or "page.jpg")[1].lower() or ".jpg"
    file_path = os.path.join(upload_dir, f"page_{page_number}_{uuid.uuid4().hex[:8]}{ext}")
    data = await file.read()
    if not data:
        raise ValueError(f"The image for page {page_number} is empty.")
    with open(file_path, "wb") as f:
        f.write(data)

    page = (await db.execute(
        select(PaperPage).where(PaperPage.paper_id == paper_id, PaperPage.page_number == page_number)
    )).scalar_one_or_none()
    if page:
        old = page.image_path
        page.image_path = file_path
        await db.execute(delete(PaperScore).where(PaperScore.paper_id == paper_id))
        paper = (await db.execute(select(TestPaper).where(TestPaper.paper_id == paper_id))).scalar_one_or_none()
        if paper:
            paper.total_score = None
            paper.checked = False
        try:
            if old != file_path and os.path.exists(old):
                os.remove(old)
        except OSError:
            pass
    else:
        page = PaperPage(paper_id=paper_id, page_number=page_number, image_path=file_path)
        db.add(page)
    await db.commit()
    await db.refresh(page)
    return page


async def grade_and_update(db: AsyncSession, paper_id: int, exam_id: int) -> dict:
    """Grade the paper (question type comes from the answer key — see ocr_service)."""
    return await grade_paper(db, paper_id, exam_id)