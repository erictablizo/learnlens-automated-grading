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

CHANGED 2026-10-24 — Doc Rubrica's sixth comment. Four changes:

1. DECLARED PARTS. If an exam page has rows in `exam_page_parts`, the paper is
   read with `ocr_page_parts()` using exactly the ranges its answer key was
   built with. This is the whole reason that table exists: `infer_question_type`
   cannot tell `encircled` from `written_letter`, because both store a bare
   letter, so a key of C D A E B F is indistinguishable between the two. Read a
   Part III page with the circle detector and every student scores zero on it.

2. PER-PAGE inference instead of per-exam. The old code called
   `infer_question_type(key_map.values())` once over the WHOLE exam and used
   that one type for every page. On her sheet - page 1 multiple choice, page 2
   with True/False - that returns "mixed" and then runs both detectors on both
   pages: wrong on page 1 and twice the cost on both. It now infers from the
   keys of each page separately. (This also matters more now: a single word
   anywhere in the key makes the new `infer_question_type` return
   "identification", which would have been applied to the entire exam.)

3. POSITIONAL vs DECLARED mapping. The old `zip(keys, result.answers)` assumes
   the i-th detection is the i-th key row, which is right when the numbers were
   assigned by position. A parts page assigns them by DECLARATION, so
   `ocr_page_parts` returns them already keyed by item number and they are
   looked up, not zipped. Mixing the two is how answers end up one row out.

4. THREE-STATE grading and `verdict`. Identification is not auto-graded (see
   ocr_identification.py: 'UBSECT' for SUBJECT and 'OBJECT' for SUBJECT both
   score 0.714, so no threshold separates a bad read from a wrong answer). The
   identification question numbers are passed to `grade_detected`, each score
   row stores its verdict, and a paper with any item under review is NOT marked
   `checked` - its score is a floor, not a result. `resolve_review()` closes
   one of those items once a human has looked at it.

Also: `student_answer[:10]` / `correct_answer[:10]` truncated every
identification answer ('COMMUNICATION' -> 'COMMUNICAT'). Those columns are
VARCHAR(100) after the migration and the slice now matches.
"""

from __future__ import annotations

import os
from collections import defaultdict

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.models.models import (
    AnswerKey, ExamPage, ExamPagePart, TestPaper, PaperPage, PaperScore,
)
from app.ml.ocr import (
    ocr_page, ocr_page_parts, PagePart, setup_tesseract,
    infer_question_type, normalize_question_type,
)
from app.ml.grader import grade_detected, CORRECT, REVIEW, WRONG
from app.ml.ocr_identification import MAX_ANSWER_LEN


def _init_tesseract() -> None:
    """Read TESSERACT_CMD from settings and configure pytesseract."""
    try:
        from app.core.config import settings
        cmd = getattr(settings, "TESSERACT_CMD", "")
        if cmd:
            setup_tesseract(cmd)
    except Exception:
        pass


def _identification_items(parts_by_page: dict[int, list[ExamPagePart]]) -> set[int]:
    """Every question number that is a Part IV style word answer.

    Only declared parts can say this. A key row on its own cannot: a one-letter
    answer could be circled or written, and a word could only be identification
    but by then it is too late to have read the page correctly.
    """
    out: set[int] = set()
    for parts in parts_by_page.values():
        for p in parts:
            if normalize_question_type(p.question_type) == "identification":
                out.update(range(p.first_item, p.last_item + 1))
    return out


async def grade_paper(db: AsyncSession, paper_id: int, exam_id: int) -> dict:
    _init_tesseract()

    # ── Answer key, grouped by exam page number ──────────────────────────────
    rows = (await db.execute(
        select(AnswerKey, ExamPage.page_number, ExamPage.page_id)
        .join(ExamPage, ExamPage.page_id == AnswerKey.page_id)
        .where(AnswerKey.exam_id == exam_id)
        .order_by(ExamPage.page_number, AnswerKey.question_number)
    )).all()
    if not rows:
        return {"success": False, "reason": "No answer key found for this exam. Generate the answer key first."}

    keys_by_page: dict[int, list[AnswerKey]] = defaultdict(list)
    page_id_by_no: dict[int, int] = {}
    for ak, page_no, page_id in rows:
        keys_by_page[page_no].append(ak)
        page_id_by_no[page_no] = page_id
    ak_by_q: dict[int, AnswerKey] = {ak.question_number: ak for ak, _, _ in rows}
    key_map: dict[int, str] = {q: (ak.correct_answer or "").upper() for q, ak in ak_by_q.items()}

    # A key with holes cannot grade anything, and saying so beats marking a
    # whole class against blanks. generate_answer_key_parts leaves a blank slot
    # for an item it could not read, on purpose, so the numbering stays right.
    blank_key = sorted(q for q, a in key_map.items() if not a.strip())
    if blank_key:
        shown = ", ".join(str(q) for q in blank_key[:10]) + ("…" if len(blank_key) > 10 else "")
        return {"success": False,
                "reason": (f"The answer key still has {len(blank_key)} blank item(s) ({shown}). "
                           "Open the answer key and fill them in before checking papers.")}

    # ── Declared parts, per exam page ────────────────────────────────────────
    part_rows = (await db.execute(
        select(ExamPagePart, ExamPage.page_number)
        .join(ExamPage, ExamPage.page_id == ExamPagePart.page_id)
        .where(ExamPagePart.exam_id == exam_id)
        .order_by(ExamPage.page_number, ExamPagePart.first_item)
    )).all()
    parts_by_page: dict[int, list[ExamPagePart]] = defaultdict(list)
    for part, page_no in part_rows:
        parts_by_page[page_no].append(part)
    ident_items = _identification_items(parts_by_page)

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
    types_used: dict[int, str] = {}
    read_any = False
    for page_no, keys in sorted(keys_by_page.items()):
        pg = paper_page_by_no.get(page_no)
        if not pg:
            warnings.append(f"Page {page_no} of the paper was not uploaded.")
            continue
        if not os.path.exists(pg.image_path):
            warnings.append(f"Image for page {page_no} is missing on the server.")
            continue

        declared = parts_by_page.get(page_no)
        if declared:
            # Read it the way its key was built. The item numbers come back
            # already assigned, so they are looked up by number, not zipped.
            parts = [PagePart(first_item=p.first_item, last_item=p.last_item,
                              question_type=p.question_type, letters=p.letters)
                     for p in declared]
            types_used[page_no] = " + ".join(
                f"{p.first_item}-{p.last_item} {normalize_question_type(p.question_type)}"
                for p in declared)
            res = ocr_page_parts(pg.image_path, parts, keep_blanks=True)
            for w in res.warnings:
                warnings.append(f"Page {page_no}: {w}")
            if not res.success:
                warnings.append(f"Page {page_no}: {res.reason}")
                continue
            read_any = True
            for q, (letter, conf) in res.answers.items():
                if q in ak_by_q:
                    detected[q] = (letter, conf, page_no)
        else:
            # No declared parts: infer from THIS page's keys only, not the
            # whole exam's. See change 2 in the module docstring.
            qt = infer_question_type([key_map[k.question_number] for k in keys])
            types_used[page_no] = qt
            result = ocr_page(pg.image_path, question_type=qt,
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

    grading = grade_detected(detected, key_map, identification_items=ident_items)
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
            student_answer=qr.student_answer[:MAX_ANSWER_LEN],
            correct_answer=qr.correct_answer[:MAX_ANSWER_LEN],
            is_correct=qr.is_correct,
            verdict=qr.verdict,
            ocr_confidence=round(float(qr.ocr_confidence), 2),
        ))

    paper = (await db.execute(select(TestPaper).where(TestPaper.paper_id == paper_id))).scalar_one_or_none()
    if paper:
        paper.total_score = grading.correct
        # NOT marked checked while anything is under review. The score is a
        # FLOOR until a human resolves those items: the student has at least
        # `correct` and at most `correct + needs_review`. Marking it checked
        # would present a provisional number as a finished one.
        paper.checked = grading.is_final
    await db.commit()

    if grading.needs_review:
        shown = ", ".join(str(q) for q in grading.review_items[:10])
        warnings.append(
            f"{grading.needs_review} written answer(s) need your review "
            f"(item {shown}). The score is {grading.correct}-{grading.max_possible} "
            f"of {grading.total_items} until they are resolved.")

    return {
        "success":       True,
        "question_type": "; ".join(f"page {n}: {t}" for n, t in sorted(types_used.items())),
        "total_items":   grading.total_items,
        "answered":      grading.answered,
        "correct":       grading.correct,
        "max_possible":  grading.max_possible,
        "needs_review":  grading.needs_review,
        "review_items":  grading.review_items,
        "is_final":      grading.is_final,
        "score_percent": grading.score_percent,
        "warning":       " ".join(warnings) or None,
    }


async def resolve_review(db: AsyncSession, paper_id: int,
                         question_number: int, is_correct: bool) -> dict:
    """Close one item that was left for review, and re-total the paper.

    Three-state grading is useless without this: `grade_paper` leaves a paper
    unchecked while anything is under review, so without a way to resolve them
    an identification paper would stay unchecked for ever.
    """
    score = (await db.execute(
        select(PaperScore).where(PaperScore.paper_id == paper_id,
                                 PaperScore.question_number == question_number)
    )).scalar_one_or_none()
    if not score:
        return {"success": False, "reason": f"Item {question_number} is not on this paper."}
    if score.verdict != REVIEW:
        return {"success": False,
                "reason": (f"Item {question_number} is not under review "
                           f"(it is marked {score.verdict}).")}

    score.verdict = CORRECT if is_correct else WRONG
    score.is_correct = bool(is_correct)
    await db.flush()

    remaining = list((await db.execute(
        select(PaperScore.question_number)
        .where(PaperScore.paper_id == paper_id, PaperScore.verdict == REVIEW)
        .order_by(PaperScore.question_number)
    )).scalars().all())
    correct = len(list((await db.execute(
        select(PaperScore.score_id)
        .where(PaperScore.paper_id == paper_id, PaperScore.verdict == CORRECT)
    )).scalars().all()))

    paper = (await db.execute(select(TestPaper).where(TestPaper.paper_id == paper_id))).scalar_one_or_none()
    if paper:
        paper.total_score = correct
        paper.checked = not remaining
    await db.commit()

    return {
        "success": True,
        "question_number": question_number,
        "verdict": score.verdict,
        "correct": correct,
        "needs_review": len(remaining),
        "review_items": remaining,
        "is_final": not remaining,
        "message": (f"Item {question_number} marked "
                    f"{'correct' if is_correct else 'wrong'}. "
                    + (f"{len(remaining)} item(s) still need review."
                       if remaining else "This paper is now fully checked.")),
    }