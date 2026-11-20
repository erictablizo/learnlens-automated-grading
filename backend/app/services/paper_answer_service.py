"""
app/services/paper_answer_service.py
====================================
NEW 2026-11-11 — per-paper answer override. One student, one item, nobody else.

    Alex Passion / Julius Bancud, page 2:
    "Create an option to override the answers in each number to handle
     corrections on the OCR Reading" — on one Test Paper, that paper only.

WHY THIS EXISTS — measured, not assumed
---------------------------------------
From the full-path run of 2026-10-24 (`OCR-SERVICE-WIRED-2026-10-24.md`):

    Item 16 is the one OCR error (she wrote E, the detector read C) — and it
    is a *letter* item, which has no review state, so it is a silent lost mark.

and from step 4 of the same run:

    resolve_review on a non-review item is refused:
        "Item 12 is not under review (it is marked correct)."

So before this file, a confidently-misread LETTER item could not be corrected
by anybody. The review queue refuses it with a 422, because only identification
items ever reach `verdict='review'`. The student lost the mark and nothing on
screen said so. This was the last place in the system where a score could be
wrong with no way to fix it.

WHAT IS STORED — the student's ANSWER, never a verdict stamp
------------------------------------------------------------
The teacher types what the student actually wrote. The item is then RE-GRADED
against the key by the same `recheck_answer()` the answer-key cascade uses.

The alternative — stamping `verdict='correct'` and leaving `student_answer` as
the misread 'C' — does not compose. A later answer-key correction re-grades
from 'C' and silently destroys her decision:

    stamp:   key 'E'→'D' cascade re-grades 'C' vs 'D' → WRONG   her fix is gone
    answer:  key 'E'→'D' cascade re-grades 'E' vs 'D' → WRONG   still correct

Storing 'E' means every later re-grade starts from a fact about the paper
instead of an artefact of Tesseract.

`ocr_confidence` is set to NULL on an overridden item. It described a reading
that no longer stands, and a stale number beside a hand-entered answer invites
exactly the wrong inference.

The review queue is NOT replaced. It still handles the items OCR flags, with
the cropped handwriting beside them (`GET /{paper_id}/review`). This sits
next to it and covers any item on the paper, reviewed or not.
"""
from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import AnswerKey, PaperScore, TestPaper
from app.ml.grader import CORRECT, REVIEW
from app.ml.scoring import ScoreSummary, summarise          # NEW 2026-11-20
from app.services.answer_key_service import recheck_answer, _identification_items
from app.services.correction_service import build_sample

logger = logging.getLogger(__name__)

# Matches app/services/ocr_service.py and the String(100) columns in models.py.
MAX_ANSWER_LEN = 100


async def _key_map(db: AsyncSession, exam_id: int) -> dict[int, str]:
    """{question_number: correct_answer} for the whole exam.

    The WHOLE exam, not just this item: `_identification_items` classifies by
    looking at every key answer, and an item's grading mode is a property of
    the key it is judged against.
    """
    rows = (await db.execute(
        select(AnswerKey.question_number, AnswerKey.correct_answer)
        .where(AnswerKey.exam_id == exam_id)
    )).all()
    return {q: (a or "") for q, a in rows}


async def _recount(db: AsyncSession, paper_id: int) -> ScoreSummary:
    """The paper's score, read back from its rows.

    RECOUNTED, never adjusted by a delta — the same rule the answer-key
    cascade follows, and for the same reason: a delta is only right if the
    previous total was, and correcting a wrong total is half the point of
    this function.

    CHANGED 2026-11-20 — it now returns a ScoreSummary instead of three
    numbers, and joins the key to find what each item is worth. The sum lives
    in app/ml/scoring.py, which the grader also uses: one definition of "what
    is this paper worth", so an overridden answer and a freshly checked paper
    cannot disagree about a student's mark.
    """
    rows = (await db.execute(
        select(PaperScore.question_number, PaperScore.verdict, AnswerKey.points)
        .join(AnswerKey, AnswerKey.answer_key_id == PaperScore.answer_key_id)
        .where(PaperScore.paper_id == paper_id)
    )).all()
    return summarise(((q, v) for q, v, _p in rows),
                     {q: p for q, _v, p in rows})


async def override_answer(
    db: AsyncSession,
    paper: TestPaper,
    question_number: int,
    student_answer: str,
    corrected_by: Optional[int] = None,
) -> dict:
    """Correct what this one student wrote for this one item, and re-grade it.

    `paper` is the row the caller has ALREADY established the current user
    owns (routes/papers.py `_owned`). Ownership is not re-derived here — one
    source of truth for that check, as with `_owned_exam` in analytics.

    Returns a dict with `success: False` and a `reason` for anything the
    current state does not allow, matching `resolve_review` and
    `grade_and_update`, so the route maps it to 422 the same way.
    """
    new_answer = (student_answer or "").strip()[:MAX_ANSWER_LEN]

    score: Optional[PaperScore] = (await db.execute(
        select(PaperScore).where(
            PaperScore.paper_id == paper.paper_id,
            PaperScore.question_number == question_number,
        )
    )).scalars().first()

    if score is None:
        # UNIQUE(paper_id, answer_key_id) plus UNIQUE(exam_id, question_number)
        # make this unambiguous: no row means the paper was never graded, or
        # the item is outside the key.
        return {
            "success": False,
            "reason": (
                f"Item {question_number} has no result on this paper yet. "
                "Check the paper first, then correct individual answers."
            ),
        }

    key_map = await _key_map(db, paper.exam_id)
    raw_key = key_map.get(question_number, score.correct_answer or "")
    is_identification = question_number in _identification_items([], key_map)

    old_answer = score.student_answer
    verdict, is_correct = recheck_answer(new_answer, raw_key, is_identification)

    # NEW 2026-11-19 — keep the pair. Alex, points 5 and 6: "training set,
    # datasets, sample specimen". The reader saw `score.student_answer`, a
    # human says the page said `new_answer`. Both values exist right here and
    # until now the first was thrown away on the next line.
    #
    # READ BEFORE THE OVERWRITE, deliberately: build_sample needs
    # `score.ocr_confidence`, which is set to None four lines below precisely
    # because the reading no longer stands. That NULL is also what stops an
    # already-corrected item from being counted as evidence about the reader.
    #
    # A SAVEPOINT, so this can never cost a teacher their correction. If the
    # samples table is missing - deployed before its migration, which has
    # happened - only the nested block rolls back and the override proceeds.
    sample = build_sample(score, paper.exam_id, new_answer, corrected_by)
    if sample is not None:
        try:
            async with db.begin_nested():
                db.add(sample)
        except Exception:                                    # noqa: BLE001
            logger.warning("Could not record OCR correction sample for "
                           "paper %s item %s", paper.paper_id, question_number,
                           exc_info=True)

    score.student_answer = new_answer
    score.correct_answer = (raw_key or "")[:MAX_ANSWER_LEN]
    score.verdict = verdict
    score.is_correct = is_correct
    # The confidence belonged to a reading that has just been replaced by a
    # human. Keeping it would attach a Tesseract number to a typed answer.
    score.ocr_confidence = None

    await db.flush()

    s = await _recount(db, paper.paper_id)
    total_items, needs_review = s.total_items, s.review_items
    correct = s.points_earned          # the MARK, in points
    paper.total_score = correct
    # Mirrors grade_paper's `paper.checked = grading.is_final` and the
    # cascade's rule: a paper with anything under review is NOT finished, and
    # its score is a floor. An override CAN send a paper back to unchecked —
    # correcting an identification answer into the 0.40–1.0 band does exactly
    # that — and the screen must say so rather than let it happen quietly.
    paper.checked = (needs_review == 0)

    await db.commit()

    moved = old_answer != new_answer
    shown_old = old_answer or "—"
    shown_new = new_answer or "—"
    if not moved:
        message = f"Item {question_number} is unchanged."
    elif verdict == REVIEW:
        message = (
            f"Item {question_number} changed from {shown_old} to {shown_new} "
            "and now needs review. This paper is unfinished again."
        )
    else:
        message = (
            f"Item {question_number} changed from {shown_old} to {shown_new} "
            f"and is now {verdict}. Score {correct} of {s.points_possible}."
        )

    return {
        "success":           True,
        "question_number":   question_number,
        "old_answer":        shown_old,
        "student_answer":    shown_new,
        "correct_answer":    score.correct_answer,
        "verdict":           verdict,
        "is_correct":        is_correct,
        "is_identification": is_identification,
        "correct":           correct,                       # points earned
        "max_possible":      s.max_points,                  # points, review included
        "correct_items":     s.correct_items,               # NEW — the item count
        "points_possible":   s.points_possible,             # NEW
        "needs_review":      needs_review,
        "total_items":       total_items,
        "is_final":          needs_review == 0,
        "message":           message,
    }