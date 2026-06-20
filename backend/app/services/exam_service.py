from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload
import os
 
from app.models.models import Exam, ExamPage, AnswerKey, TestPaper, PaperScore
 
 
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
    result = await db.execute(
        select(Exam).where(Exam.exam_id == exam_id, Exam.created_by == user_id)
    )
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
    result = await db.execute(
        select(Exam).where(Exam.exam_id == exam_id, Exam.created_by == user_id)
    )
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
 
 
async def has_checked_papers(db: AsyncSession, exam_id: int) -> bool:
    """True if any test paper under this exam has already been graded."""
    result = await db.execute(
        select(TestPaper).where(TestPaper.exam_id == exam_id, TestPaper.checked == True)  # noqa: E712
    )
    return result.scalar_one_or_none() is not None
 
 
async def reset_exam_paper_scores(db: AsyncSession, exam_id: int) -> int:
    """
    Reset all test paper scores under this exam (called when exam pages
    are edited and an answer key already existed). Returns count reset.
    """
    papers_result = await db.execute(
        select(TestPaper).where(TestPaper.exam_id == exam_id)
    )
    papers = list(papers_result.scalars().all())
 
    count = 0
    for paper in papers:
        if paper.checked:
            await db.execute(delete(PaperScore).where(PaperScore.paper_id == paper.paper_id))
            paper.total_score = None
            paper.checked     = False
            count += 1
 
    if count:
        await db.commit()
    return count
 
 
async def generate_answer_key(db: AsyncSession, exam_id: int, page_id: int) -> dict:
    """Run OCR pipeline on the exam page image to extract the answer key."""
    page_result = await db.execute(
        select(ExamPage).where(ExamPage.page_id == page_id, ExamPage.exam_id == exam_id)
    )
    page = page_result.scalar_one_or_none()
    if not page:
        return {"success": False, "reason": "Exam page not found."}
 
    if not os.path.exists(page.image_path):
        return {"success": False, "reason": f"Image file not found: {page.image_path}"}
 
    try:
        from app.ml.ocr import ocr_page, setup_tesseract
        from app.core.config import settings
        cmd = getattr(settings, "TESSERACT_CMD", "")
        if cmd:
            setup_tesseract(cmd)
        result = ocr_page(page.image_path)
    except ImportError:
        return {"success": False, "reason": "OCR libraries not installed."}
    except Exception as exc:
        return {"success": False, "reason": f"OCR error: {exc}"}
 
    if result.error:
        return {"success": False, "reason": result.error}
 
    if not result.answers:
        return {
            "success": False,
            "reason": "No encircled answers detected on this page. Make sure the image is clear and answers are clearly circled.",
        }
 
    await db.execute(
        delete(AnswerKey).where(AnswerKey.exam_id == exam_id, AnswerKey.page_id == page_id)
    )
 
    prev_pages_result = await db.execute(
        select(ExamPage)
        .where(ExamPage.exam_id == exam_id, ExamPage.page_number < page.page_number)
        .order_by(ExamPage.page_number)
    )
    prev_pages = list(prev_pages_result.scalars().all())
 
    offset = 0
    for pp in prev_pages:
        count_result = await db.execute(
            select(AnswerKey).where(AnswerKey.exam_id == exam_id, AnswerKey.page_id == pp.page_id)
        )
        offset += len(list(count_result.scalars().all()))
 
    for idx, answer in enumerate(result.answers, start=1):
        q_num = offset + idx
        db.add(AnswerKey(
            exam_id=exam_id, page_id=page_id, question_number=q_num,
            correct_answer=answer.letter, ocr_confidence=answer.confidence,
        ))
 
    await db.commit()
 
    return {
        "success":  True,
        "detected": len(result.answers),
        "message":  f"Answer key generated: {len(result.answers)} answers detected on page {page.page_number}.",
    }