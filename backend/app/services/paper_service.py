from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
 
from app.models.models import TestPaper, PaperPage, PaperScore, Exam
 
 
async def get_papers(db: AsyncSession, exam_id: int, user_id: int) -> List[TestPaper]:
    # Verify exam belongs to user
    exam_result = await db.execute(select(Exam).where(Exam.exam_id == exam_id, Exam.created_by == user_id))
    if not exam_result.scalar_one_or_none():
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
    paper = TestPaper(exam_id=exam_id, student_name=student_name)
    db.add(paper)
    await db.commit()
    await db.refresh(paper)
    return paper
 
 
async def update_paper(db: AsyncSession, paper_id: int, **kwargs) -> Optional[TestPaper]:
    result = await db.execute(select(TestPaper).where(TestPaper.paper_id == paper_id))
    paper = result.scalar_one_or_none()
    if not paper:
        return None
    for k, v in kwargs.items():
        if v is not None:
            setattr(paper, k, v)
    await db.commit()
    await db.refresh(paper)
    return paper
 
 
async def delete_paper(db: AsyncSession, paper_id: int) -> bool:
    result = await db.execute(select(TestPaper).where(TestPaper.paper_id == paper_id))
    paper = result.scalar_one_or_none()
    if not paper:
        return False
    await db.delete(paper)
    await db.commit()
    return True
 
 
async def add_paper_page(db: AsyncSession, paper_id: int, page_number: int, image_path: str) -> PaperPage:
    page = PaperPage(paper_id=paper_id, page_number=page_number, image_path=image_path)
    db.add(page)
    await db.commit()
    await db.refresh(page)
    return page
