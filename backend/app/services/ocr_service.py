"""
app/services/ocr_service.py
===========================
Bridges the ML pipeline (app/ml/) with the database layer.

FIX 2026-09-22 — Checking Paper (thesis p. 24)
----------------------------------------------
* `grade_paper` called `ocr_page(pg.image_path)` with NO question type, so
  every student paper — including True/False ones — was read by the circle
  detector. The question type now comes from the stored answer key
  (all T/F = "true_false", otherwise "encircled").
* Paper page N is matched with exam page N: the OCR is told how many items
  that page has (`expected_items`) and its i-th answer maps to the i-th
  answer-key row of that page. Blank T/F lines stay in place, so a skipped
  item no longer shifts the rest of the paper.
* The PaperScore page lookup mixed up `page_id` and `page_number`; fixed.
"""

from __future__ import annotations

import os
from collections import defaultdict

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.models.models import AnswerKey, ExamPage, TestPaper, PaperPage, PaperScore
from app.ml.ocr import ocr_page, setup_tesseract, infer_question_type
from app.ml.grader import grade_detected


def _init_tesseract() -> None:
    """Read TESSERACT_CMD from settings and configure pytesseract."""
    try:
        from app.core.config import settings
        cmd = getattr(settings, "TESSERACT_CMD", "")
        if cmd:
            setup_tesseract(cmd)
    except Exception:
        pass


async def grade_paper(db: AsyncSession, paper_id: int, exam_id: int) -> dict:
    _init_tesseract()

    # ── Answer key, grouped by exam page number ──────────────────────────────
    rows = (await db.execute(
        select(AnswerKey, ExamPage.page_number)
        .join(ExamPage, ExamPage.page_id == AnswerKey.page_id)
        .where(AnswerKey.exam_id == exam_id)
        .order_by(ExamPage.page_number, AnswerKey.question_number)
    )).all()
    if not rows:
        return {"success": False, "reason": "No answer key found for this exam. Generate the answer key first."}

    keys_by_page: dict[int, list[AnswerKey]] = defaultdict(list)
    for ak, page_no in rows:
        keys_by_page[page_no].append(ak)
    ak_by_q: dict[int, AnswerKey] = {ak.question_number: ak for ak, _ in rows}
    key_map: dict[int, str] = {q: ak.correct_answer.upper() for q, ak in ak_by_q.items()}
    question_type = infer_question_type(key_map.values())

    # ── Paper pages ──────────────────────────────────────────────────────────
    pages: list[PaperPage] = list((await db.execute(
        select(PaperPage).where(PaperPage.paper_id == paper_id).order_by(PaperPage.page_number)
    )).scalars().all())
    if not pages:
        return {"success": False, "reason": "No pages uploaded for this paper."}
    paper_page_by_no = {p.page_number: p for p in pages}

    # ── OCR each paper page against the key of the matching exam page ────────
    detected: dict[int, tuple[str, float, int]] = {}
    warnings: list[str] = []
    read_any = False
    for page_no, keys in keys_by_page.items():
        pg = paper_page_by_no.get(page_no)
        if not pg:
            warnings.append(f"Page {page_no} of the paper was not uploaded.")
            continue
        if not os.path.exists(pg.image_path):
            warnings.append(f"Image for page {page_no} is missing on the server.")
            continue
        result = ocr_page(pg.image_path, question_type=question_type,
                          expected_items=len(keys), keep_blanks=True)
        if result.error:
            warnings.append(f"Page {page_no}: {result.error}")
            continue
        read_any = True
        if result.warning:
            warnings.append(f"Page {page_no}: {result.warning}")
        for ak, ans in zip(keys, result.answers):
            detected[ak.question_number] = (ans.letter, ans.confidence, page_no)

    if not read_any:
        return {"success": False, "reason": " ".join(warnings) or "Could not read any uploaded page images."}

    grading = grade_detected(detected, key_map)
    if not grading.success:
        return {"success": False, "reason": grading.reason}

    # ── Persist ──────────────────────────────────────────────────────────────
    await db.execute(delete(PaperScore).where(PaperScore.paper_id == paper_id))
    fallback_page = pages[0]
    for qr in grading.questions:
        ak = ak_by_q.get(qr.question_number)
        if not ak:
            continue
        pp = paper_page_by_no.get(qr.page_number, fallback_page)
        db.add(PaperScore(
            paper_id=paper_id,
            paper_page_id=pp.paper_page_id,
            answer_key_id=ak.answer_key_id,
            question_number=qr.question_number,
            student_answer=qr.student_answer[:10],
            correct_answer=qr.correct_answer[:10],
            is_correct=qr.is_correct,
            ocr_confidence=round(float(qr.ocr_confidence), 2),
        ))

    paper = (await db.execute(select(TestPaper).where(TestPaper.paper_id == paper_id))).scalar_one_or_none()
    if paper:
        paper.total_score = grading.correct
        paper.checked = True
    await db.commit()

    return {
        "success":       True,
        "question_type": question_type,
        "total_items":   grading.total_items,
        "answered":      grading.answered,
        "correct":       grading.correct,
        "score_percent": grading.score_percent,
        "warning":       " ".join(warnings) or None,
    }