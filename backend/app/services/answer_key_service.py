"""
NEW 2026-11-11 — correcting an answer key item, and re-checking every paper.

Alex Passion / Julius Bancud, post-UAT recommendations page 2:

    Can override or edit scanned answer in Answer Key (Column)
    If this item # 2 in "Column Answer Key" was updated it will automatic
    updates all the checking of item # 2 in all Test Papers tie-up to this
    answer key and updates the score of students affected.

Doc Rubrica, page 1, independently:

    If Ans-Key was corrected -> auto-upload for all

TODAY THE SYSTEM IS WRONG, not merely incomplete. Editing a key leaves every
already-checked paper carrying the verdict it got against the OLD key, and the
Summary Report goes on presenting those scores as finished. The ⚠ flag added
to the analytics endpoint on the same day exists to make that visible; this
closes it.

NO RE-OCR. The paper images are not read again - `PaperScore.student_answer`
already holds what the student wrote, so only the COMPARISON is redone. That
is the difference between a second or two and a minute per paper, and it also
guarantees the student's answer cannot drift because Tesseract had a different
day.
"""
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import AnswerKey, ExamPage, ExamPagePart, TestPaper, PaperScore
# The grading rule lives in ONE place. _norm and BLANK are private names, and
# importing them is still right: re-implementing "is this answer correct"
# here would let the cascade disagree with the original grading, so a paper
# could flip on re-check for no reason at all. Same argument as importing
# _owned_exam rather than copying the ownership test.
from app.ml.grader import CORRECT, REVIEW, WRONG, BLANK, _norm
from app.ml.ocr_identification import grade_identification, MAX_ANSWER_LEN
from app.ml.ocr import normalize_question_type
from app.services.paper_service import _owned_exam


class AnswerKeyItemNotFound(Exception):
    """No such question number in this exam's answer key."""


class BlankAnswerKey(Exception):
    """A key item cannot be blanked - grade_detected refuses to grade on one."""


def _identification_items(parts: List[ExamPagePart], key_map: dict) -> set:
    """Which question numbers are Part IV style word answers.

    A VERBATIM copy of ocr_service._identification_items, reduced to a flat
    parts list. Copied rather than imported for one reason: importing
    ocr_service pulls in app.ml.ocr, which imports cv2 and pytesseract at
    module load. This service never touches an image, and a key correction
    should not fail because OpenCV is missing.

    The duplication is real and is the lesser evil, but it IS duplication -
    if the rule in ocr_service changes, change it here too.

    NOTE THE KEY-BASED FALLBACK. When no part is declared, the ANSWER decides:
    more than one character and not TRUE/FALSE means a word answer. So editing
    an item's key from "A" to "ANTONYM" MOVES that item from exact-match
    grading into three-state grading, and the reverse. That is why this is
    recomputed from the new key map rather than captured before the edit.
    """
    out: set = set()
    for p in parts:
        if normalize_question_type(p.question_type) == "identification":
            out.update(range(p.first_item, p.last_item + 1))
    for q, ans in key_map.items():
        if q in out:
            continue
        a = (ans or "").strip().upper()
        if len(a) > 1 and a not in ("TRUE", "FALSE"):
            out.add(q)
    return out


def recheck_answer(student_answer: str, raw_key: str, is_identification: bool) -> tuple:
    """(verdict, is_correct) for one stored answer against a key.

    Mirrors the per-item branch of ml.grader.grade_detected EXACTLY. Read that
    function beside this one before changing either.

    `student_answer` comes out of the database, where grade_detected wrote it:
    already _norm()-ed for a letter item, trimmed-but-raw for a word item, and
    BLANK ("—") when nothing was detected. _norm is idempotent, so re-applying
    it to a stored letter is a no-op.

    BLANK is tested FIRST and explicitly. Left implicit it would still produce
    the right verdict - "—" never equals a key and normalises to "" for
    similarity - but only by accident, and an accident is not a grading rule.
    """
    stored = (student_answer or "").strip()
    is_blank = (not stored) or stored == BLANK

    if is_identification:
        if is_blank:
            return WRONG, False
        verdict = grade_identification(stored, (raw_key or "").strip())
        return verdict, verdict == CORRECT

    key = _norm(raw_key)
    student = "" if is_blank else _norm(stored)
    ok = bool(student) and student == key
    return (CORRECT if ok else WRONG), ok


async def update_key_item(
    db: AsyncSession,
    exam_id: int,
    question_number: int,
    new_answer: str,
    user_id: int,
) -> Optional[dict]:
    """Correct one answer key item and re-check it on every paper.

    Returns None when the exam is not this teacher's, so the route can answer
    404 without confirming that someone else's exam exists.

    Raises AnswerKeyItemNotFound / BlankAnswerKey, which the route turns into
    404 and 422.
    """
    if not await _owned_exam(db, exam_id, user_id):
        return None

    cleaned = (new_answer or "").strip()[:MAX_ANSWER_LEN]
    if not cleaned:
        # grade_detected refuses to grade an exam with a blank key item, so
        # allowing one here would silently break checking for the whole exam.
        raise BlankAnswerKey(
            "An answer key item cannot be blank. Enter the correct answer for "
            f"item {question_number}."
        )

    key_row = (await db.execute(
        select(AnswerKey).where(
            AnswerKey.exam_id == exam_id,
            AnswerKey.question_number == question_number,
        )
    )).scalar_one_or_none()
    if key_row is None:
        raise AnswerKeyItemNotFound(
            f"Item {question_number} is not in this exam's answer key."
        )

    old_answer = key_row.correct_answer or ""
    key_row.correct_answer = cleaned

    # The WHOLE key, with the edit applied, because the identification
    # fallback reads every item's answer.
    key_rows = (await db.execute(
        select(AnswerKey).where(AnswerKey.exam_id == exam_id)
    )).scalars().all()
    key_map = {k.question_number: (k.correct_answer or "") for k in key_rows}

    parts = list((await db.execute(
        select(ExamPagePart).where(ExamPagePart.exam_id == exam_id)
    )).scalars().all())

    ident = _identification_items(parts, key_map)
    is_ident = question_number in ident

    # Only the rows graded against THIS key row. answer_key_id is a real
    # foreign key with UNIQUE(paper_id, answer_key_id), so this is exact -
    # no matching on question numbers, no risk of catching another exam.
    scores = list((await db.execute(
        select(PaperScore).where(PaperScore.answer_key_id == key_row.answer_key_id)
    )).scalars().all())

    flipped = 0
    touched_paper_ids = set()
    for s in scores:
        verdict, ok = recheck_answer(s.student_answer, cleaned, is_ident)
        if s.verdict != verdict or bool(s.is_correct) != ok:
            flipped += 1
        s.correct_answer = cleaned[:MAX_ANSWER_LEN]
        s.verdict = verdict
        s.is_correct = ok
        touched_paper_ids.add(s.paper_id)

    # Re-total every paper that had a row for this item. Counted from its own
    # score rows rather than adjusted by a delta: a delta is only right if the
    # previous total was right, and the whole reason this function exists is
    # that it might not have been.
    rescored: List[dict] = []
    if touched_paper_ids:
        papers = list((await db.execute(
            select(TestPaper).where(TestPaper.paper_id.in_(touched_paper_ids))
        )).scalars().all())

        # ONE query for every affected paper's rows, grouped in Python. A
        # query per paper would be 35 round trips on a full section, for data
        # the session has already loaded half of.
        all_rows = list((await db.execute(
            select(PaperScore).where(PaperScore.paper_id.in_(touched_paper_ids))
        )).scalars().all())
        by_paper: dict = {}
        for r in all_rows:
            by_paper.setdefault(r.paper_id, []).append(r)

        for paper in papers:
            rows = by_paper.get(paper.paper_id, [])
            correct = sum(1 for r in rows if r.verdict == CORRECT)
            review  = sum(1 for r in rows if r.verdict == REVIEW)

            old_score   = paper.total_score
            old_checked = bool(paper.checked)

            paper.total_score = correct
            # Mirrors grade_paper: `paper.checked = grading.is_final`, and
            # is_final is needs_review == 0. A paper whose corrected key puts
            # an item back under review becomes unchecked again, which is
            # correct - its score is a floor once more.
            paper.checked = (review == 0)

            if old_score != paper.total_score or old_checked != paper.checked:
                rescored.append({
                    "paper_id":     paper.paper_id,
                    "student_name": paper.student_name,
                    "old_score":    old_score,
                    "new_score":    paper.total_score,
                    "was_checked":  old_checked,
                    "now_checked":  bool(paper.checked),
                })

    await db.commit()

    return {
        "exam_id":          exam_id,
        "question_number":  question_number,
        "old_answer":       old_answer,
        "correct_answer":   cleaned,
        "is_identification": is_ident,
        "papers_affected":  len(touched_paper_ids),
        "items_flipped":    flipped,
        "papers_rescored":  rescored,
    }
