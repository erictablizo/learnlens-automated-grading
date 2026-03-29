from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
 
from app.models.models import Exam, ExamPage, AnswerKey
 
 
async def get_exams(db: AsyncSession, user_id: int) -> List[Exam]:
    result = await db.execute(
        select(Exam).where(Exam.created_by == user_id).order_by(Exam.created_at.desc())
    )
    return list(result.scalars().all())
 
 
async def get_exam(db: AsyncSession, exam_id: int, user_id: int) -> Optional[Exam]:
    result = await db.execute(
        select(Exam)
        .options(selectinload(Exam.pages), selectinload(Exam.answer_keys))
        .where(Exam.exam_id == exam_id, Exam.created_by == user_id)
    )
    return result.scalar_one_or_none()
 
 
async def create_exam(db: AsyncSession, user_id: int, exam_name: str, description: str) -> Exam:
    exam = Exam(created_by=user_id, exam_name=exam_name, description=description)
    db.add(exam)
    await db.commit()
    await db.refresh(exam)
    return exam
 
 
async def update_exam(db: AsyncSession, exam_id: int, user_id: int, **kwargs) -> Optional[Exam]:
    result = await db.execute(select(Exam).where(Exam.exam_id == exam_id, Exam.created_by == user_id))
    exam = result.scalar_one_or_none()
    if not exam:
        return None
    for k, v in kwargs.items():
        if v is not None:
            setattr(exam, k, v)
    await db.commit()
    await db.refresh(exam)
    return exam
 
 
async def delete_exam(db: AsyncSession, exam_id: int, user_id: int) -> bool:
    result = await db.execute(select(Exam).where(Exam.exam_id == exam_id, Exam.created_by == user_id))
    exam = result.scalar_one_or_none()
    if not exam:
        return False
    await db.delete(exam)
    await db.commit()
    return True
 
 
async def add_exam_page(db: AsyncSession, exam_id: int, page_number: int, image_path: str) -> ExamPage:
    page = ExamPage(exam_id=exam_id, page_number=page_number, image_path=image_path)
    db.add(page)
    await db.commit()
    await db.refresh(page)
    return page
 
 
async def generate_answer_key(db: AsyncSession, exam_id: int, page_id: int) -> List[AnswerKey]:
    """Stub: generate answer keys for exam page (OCR would go here)."""
    # Placeholder: return existing answer keys for this page
    result = await db.execute(
        select(AnswerKey).where(AnswerKey.exam_id == exam_id, AnswerKey.page_id == page_id)
    )
    return list(result.scalars().all())