"""
app/services/ocr_service.py
===========================
Bridges the ML pipeline (app/ml/) with the database layer.
 
Flow
----
1. Load answer keys and paper pages from DB
2. Call app.ml.ocr.ocr_page() for each page image
3. Call app.ml.grader.grade_pages() with OCR results + answer key map
4. Persist PaperScore rows and update TestPaper.total_score
"""
 
from __future__ import annotations
 
import os
 
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
 
from app.models.models import AnswerKey, TestPaper, PaperPage, PaperScore
from app.ml.ocr import ocr_page, setup_tesseract
from app.ml.grader import grade_pages
 
 
def _init_tesseract() -> None:
    """Read TESSERACT_CMD from settings and configure pytesseract."""
    try:
        from app.core.config import settings
        cmd = getattr(settings, "TESSERACT_CMD", "")
        if cmd:
            setup_tesseract(cmd)
    except Exception:
        pass
 
 
async def grade_paper(
    db:       AsyncSession,
    paper_id: int,
    exam_id:  int,
) -> dict:
    """
    Full grading pipeline:
      - OCR every uploaded page via app.ml.ocr.ocr_page()
      - Grade via app.ml.grader.grade_pages()
      - Persist results to DB
    Returns a plain dict matching GradeResponse schema.
    """
    _init_tesseract()
 
    # ── Load answer key ───────────────────────────────────────────────────────
    ak_rows = list(
        (await db.execute(
            select(AnswerKey).where(AnswerKey.exam_id == exam_id)
        )).scalars().all()
    )
    if not ak_rows:
        return {"success": False, "reason": "No answer key found for this exam."}
 
    # {question_number: AnswerKey row}
    ak_map: dict[int, AnswerKey] = {ak.question_number: ak for ak in ak_rows}
 
    # {question_number: correct_letter}  — for the grader
    key_map: dict[int, str] = {q: ak.correct_answer.upper() for q, ak in ak_map.items()}
 
    # ── Load paper pages ──────────────────────────────────────────────────────
    pages: list[PaperPage] = list(
        (await db.execute(
            select(PaperPage)
            .where(PaperPage.paper_id == paper_id)
            .order_by(PaperPage.page_number)
        )).scalars().all()
    )
    if not pages:
        return {"success": False, "reason": "No pages uploaded for this paper."}
 
    # ── Run OCR on each page ──────────────────────────────────────────────────
    page_results = []
    for pg in pages:
        if os.path.exists(pg.image_path):
            result = ocr_page(pg.image_path)
            page_results.append(result)
 
    if not page_results:
        return {"success": False, "reason": "Could not read any uploaded page images."}
 
    # ── Grade ─────────────────────────────────────────────────────────────────
    grading = grade_pages(page_results, key_map)
 
    if not grading.success:
        return {"success": False, "reason": grading.reason}
 
    # ── Persist: delete old scores, insert new ones ───────────────────────────
    await db.execute(delete(PaperScore).where(PaperScore.paper_id == paper_id))
 
    # Build a page lookup: page_number -> PaperPage
    page_by_num: dict[int, PaperPage] = {pg.page_number: pg for pg in pages}
    fallback_page = pages[0]
 
    for qr in grading.questions:
        correct_ak = ak_map.get(qr.question_number)
        if not correct_ak:
            continue
 
        # Assign to the page that contains this question's answer key entry
        page_for_q = page_by_num.get(correct_ak.page_id, fallback_page)
 
        db.add(PaperScore(
            paper_id        = paper_id,
            paper_page_id   = page_for_q.paper_page_id,
            answer_key_id   = correct_ak.answer_key_id,
            question_number = qr.question_number,
            student_answer  = qr.student_answer,
            correct_answer  = qr.correct_answer,
            is_correct      = qr.is_correct,
            ocr_confidence  = qr.ocr_confidence,
        ))
 
    # ── Update TestPaper ──────────────────────────────────────────────────────
    paper = (
        await db.execute(select(TestPaper).where(TestPaper.paper_id == paper_id))
    ).scalar_one_or_none()
 
    if paper:
        paper.total_score = grading.correct
        paper.checked     = True
 
    await db.commit()
 
    return {
        "success":       True,
        "total_items":   grading.total_items,
        "answered":      grading.answered,
        "correct":       grading.correct,
        "score_percent": grading.score_percent,
    }