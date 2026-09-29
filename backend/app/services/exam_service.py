from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, update
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
    exam = Exam(created_by=user_id, exam_name=exam_name.strip(), description=description.strip())
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
            setattr(exam, k, v.strip() if isinstance(v, str) else v)
    await db.commit()
    await db.refresh(exam)
    return exam


async def delete_exam(db: AsyncSession, exam_id: int, user_id: int) -> bool:
    result = await db.execute(select(Exam).where(Exam.exam_id == exam_id, Exam.created_by == user_id))
    exam = result.scalar_one_or_none()
    if not exam:
        return False
    paths = (await db.execute(select(ExamPage.image_path).where(ExamPage.exam_id == exam_id))).scalars().all()
    await db.delete(exam)
    await db.commit()
    for path in paths:          # remove the uploaded images too
        _remove_file(path)
    return True


def _remove_file(path: str) -> None:
    try:
        if path and os.path.exists(path):
            os.remove(path)
    except OSError:
        pass


async def add_exam_page(db: AsyncSession, exam_id: int, page_number: int, image_path: str) -> ExamPage:
    """
    FIX 2026-09-22: uploading a NEW image for an existing page number (Edit Exam)
    used to crash on the (exam_id, page_number) unique constraint. Now the page is
    updated in place and its old answer key rows are removed (they belong to the old image).
    """
    existing = (await db.execute(
        select(ExamPage).where(ExamPage.exam_id == exam_id, ExamPage.page_number == page_number)
    )).scalar_one_or_none()
    if existing:
        if existing.image_path != image_path:
            _remove_file(existing.image_path)
        existing.image_path = image_path
        await db.execute(delete(AnswerKey).where(AnswerKey.page_id == existing.page_id))
        await db.commit()
        await renumber_answer_keys(db, exam_id)
        await db.refresh(existing)
        return existing
    page = ExamPage(exam_id=exam_id, page_number=page_number, image_path=image_path)
    db.add(page)
    await db.commit()
    await db.refresh(page)
    return page


async def set_page_number(db: AsyncSession, exam_id: int, page_id: int, new_number: int) -> dict:
    """
    NEW 2026-09-29 (Edit Exam enhancement): change which page number an already
    uploaded image belongs to, without re-uploading it.

    Page numbers stay 1..N with no gaps, so this is a SWAP: moving page 3 to
    page 1 gives the old page 1 the number 3. The (exam_id, page_number) unique
    key would collide half-way through, so the other page is parked on a
    temporary number first.

    Afterwards the answer key is renumbered (it is ordered by page) and every
    checked paper is reset, because question 1 may now be a different question.
    """
    pages = list((await db.execute(
        select(ExamPage).where(ExamPage.exam_id == exam_id).order_by(ExamPage.page_number)
    )).scalars().all())
    page = next((p for p in pages if p.page_id == page_id), None)
    if not page:
        return {"success": False, "reason": "Page not found."}
    if not 1 <= new_number <= len(pages):
        return {"success": False,
                "reason": f"Page number must be between 1 and {len(pages)}."}
    if page.page_number == new_number:
        return {"success": True, "changed": False, "reset": 0,
                "message": f"Page {new_number} is unchanged."}

    old_number = page.page_number
    other = next((p for p in pages if p.page_number == new_number), None)

    park = max(p.page_number for p in pages) + 1000
    if other:
        other.page_number = park
        await db.flush()
    page.page_number = new_number
    await db.flush()
    if other:
        other.page_number = old_number
    await db.commit()

    await renumber_answer_keys(db, exam_id)
    reset = await reset_exam_paper_scores(db, exam_id)

    msg = (f"Page {old_number} is now page {new_number}."
           if not other else
           f"Pages {old_number} and {new_number} were swapped.")
    if reset:
        msg += f" {reset} checked paper(s) were reset and must be checked again."
    return {"success": True, "changed": True, "reset": reset, "message": msg}


async def has_checked_papers(db: AsyncSession, exam_id: int) -> bool:
    result = await db.execute(
        select(TestPaper.paper_id).where(TestPaper.exam_id == exam_id, TestPaper.checked == True).limit(1)  # noqa: E712
    )
    return result.first() is not None


async def reset_exam_paper_scores(db: AsyncSession, exam_id: int) -> int:
    papers = list((await db.execute(select(TestPaper).where(TestPaper.exam_id == exam_id))).scalars().all())
    count = 0
    for paper in papers:
        if paper.checked:
            await db.execute(delete(PaperScore).where(PaperScore.paper_id == paper.paper_id))
            paper.total_score = None
            paper.checked = False
            count += 1
    if count:
        await db.commit()
    return count


async def renumber_answer_keys(db: AsyncSession, exam_id: int) -> None:
    """
    FIX 2026-09-22: keep question numbers continuous 1..N ordered by page.
    Before, re-generating page 1 with a different count (e.g. 16 → 12) left
    page 2's numbers wrong, or crashed on the (exam_id, question_number) unique key.
    Two passes (+1000 first) so the unique constraint never collides mid-update.
    """
    rows = (await db.execute(
        select(AnswerKey.answer_key_id)
        .join(ExamPage, ExamPage.page_id == AnswerKey.page_id)
        .where(AnswerKey.exam_id == exam_id)
        .order_by(ExamPage.page_number, AnswerKey.question_number)
    )).scalars().all()
    if not rows:
        return
    await db.execute(update(AnswerKey).where(AnswerKey.exam_id == exam_id)
                     .values(question_number=AnswerKey.question_number + 1000))
    for i, ak_id in enumerate(rows, start=1):
        await db.execute(update(AnswerKey).where(AnswerKey.answer_key_id == ak_id).values(question_number=i))
    await db.commit()


async def generate_answer_key(
    db: AsyncSession,
    exam_id: int,
    page_id: int,
    question_type: str = "encircled",
    expected_items: Optional[int] = None,
) -> dict:
    """
    Run OCR on one exam page and save its answer key.

    FIX 2026-09-22:
      * passes `expected_items` ("Number of items on this page") to the OCR so
        exactly that many answers are kept (12 for p.6 MC, 20 for p.14 T/F).
      * question numbers of later pages are renumbered after every generate.
      * scores of already-checked papers are reset, because the key changed.
    """
    from app.ml.ocr import ocr_page, setup_tesseract, normalize_question_type, QUESTION_TYPES

    question_type = normalize_question_type(question_type)
    if question_type not in QUESTION_TYPES:
        return {"success": False, "reason": "Question type must be Multiple Choice or True/False."}
    if expected_items is not None and not (1 <= expected_items <= 200):
        return {"success": False, "reason": "Number of items must be between 1 and 200."}

    page = (await db.execute(
        select(ExamPage).where(ExamPage.page_id == page_id, ExamPage.exam_id == exam_id)
    )).scalar_one_or_none()
    if not page:
        return {"success": False, "reason": "Exam page not found."}
    if not os.path.exists(page.image_path):
        return {"success": False, "reason": "The image of this page is missing on the server. Upload it again."}

    try:
        from app.core.config import settings
        if getattr(settings, "TESSERACT_CMD", ""):
            setup_tesseract(settings.TESSERACT_CMD)
        result = ocr_page(page.image_path, question_type=question_type, expected_items=expected_items)
    except ImportError:
        return {"success": False, "reason": "OCR libraries not installed (opencv-python, pytesseract)."}
    except Exception as exc:
        return {"success": False, "reason": f"OCR error: {exc}"}

    if result.error:
        return {"success": False, "reason": result.error}
    answers = [a for a in result.answers if a.letter]
    if not answers:
        kind = "True/False answers" if question_type == "true_false" else "encircled answers"
        return {"success": False, "reason": f"No {kind} detected on this page. Ensure answers are clearly marked."}

    # Replace this page's key, appended after all other keys, then renumber 1..N by page
    await db.execute(delete(AnswerKey).where(AnswerKey.exam_id == exam_id, AnswerKey.page_id == page_id))
    max_q = (await db.execute(
        select(AnswerKey.question_number).where(AnswerKey.exam_id == exam_id)
        .order_by(AnswerKey.question_number.desc()).limit(1)
    )).scalar_one_or_none() or 0
    for idx, a in enumerate(answers, start=1):
        db.add(AnswerKey(
            exam_id=exam_id, page_id=page_id, question_number=max_q + idx,
            correct_answer=a.letter[:10], ocr_confidence=round(float(a.confidence), 2),
        ))
    await db.commit()
    await renumber_answer_keys(db, exam_id)
    reset = await reset_exam_paper_scores(db, exam_id)

    msg = f"Answer key generated: {len(answers)} answers detected on page {page.page_number}."
    if reset:
        msg += f" {reset} checked paper(s) were reset and must be checked again."
    return {
        "success": True,
        "detected": len(answers),
        "expected_items": expected_items,
        "question_type": question_type,
        "message": msg,
        "warning": result.warning,
    }