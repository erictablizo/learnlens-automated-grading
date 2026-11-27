"""
app/services/correction_service.py
==================================
WHAT TEACHERS OVERRULED THE READER ON. Nothing else, as of 2026-11-27.

    Sir Alex Passion, 27 November 2026: the specimen-correction table is not
    needed, because the focus is ENCIRCLED answers.

    He is right, and the reason is worth keeping where the code used to be.
    A substitution table answers "the reader misread this handwritten
    character". On an encircled paper the reader is deciding WHICH OPTION IS
    MARKED, not which letter was written, so there is no glyph to substitute.
    The screen half-admitted it: its own help text had to warn that a
    true/false correction must be typed as TRUE rather than T, which is the
    feature explaining why it did not fit the data.

WHAT WAS REMOVED ON 2026-11-27, so the gap in the history is readable:

    apply_corrections()         the pass that rewrote a reading mid-check,
                                between ocr_service building `detected` and
                                grade_detected judging it
    active_map()                the lookup it used
    judge(), _correctable(), count_affected(), preview_for(), rescore_for(),
    RescoreReport, AffectedPreview, PREVIEW_CAP
                                the cascade that re-checked papers already in
                                the installation when a correction was saved
    Suggestion, suggestions()   the "Use this" feeder on the admin screen

and with them the OCRCorrection model, the ocr_corrections table's only
readers, /admin/corrections/*, and components/admin/SpecimenCorrections.tsx.

THE TABLE ITSELF IS STILL THERE AND IS NOW INERT - nothing in the codebase
reads or writes it. migrations/2026-11-27_drop_ocr_corrections.sql drops it
when you want it gone; there is no hurry, because an unreferenced table
costs nothing.

WHAT STAYED, AND WHY IT IS NOT PART OF WHAT HE WITHDREW
-------------------------------------------------------
`ocr_correction_samples` is the record of what a teacher typed over,
collected as a by-product of ordinary marking. It is the data behind

    Ms. Melanie, Recommendations page 19, requirement 1:
    "Admin side can monitor how many the teachers recorrected answer"

which is a live requirement from a different panellist. THE SUBSTITUTION IS
GONE; THE RECORD OF WHAT THE READER GOT WRONG IS NOT. The two were always
separate things that happened to live in one file:

    paper_answer_service.override_answer  calls build_sample on every
                                          correction a teacher makes
    teacher_correction_service            counts those rows for the
                                          "Corrections by teacher" panel

Deleting this file instead of emptying it would have taken Ms. Melanie's
panel down with Sir Alex's table, and the failure would have looked like a
column of zeroes rather than like a crash.

THE CODE BELOW IS UNCHANGED, statement for statement, from the version that
shipped on 2026-11-19. Three words of prose moved: norm_seen() lost a
sentence naming an index on the dropped table, and sample_worth_keeping()
says "the correction pass MADE" rather than "makes", because it no longer
exists. Nothing executable differs. This file is smaller, not different.
"""
from __future__ import annotations

from typing import Optional

from app.ml.ocr_item_numbers import CONTESTED_SEP
from app.ml.grader import BLANK
from app.models.models import PaperScore, OCRCorrectionSample


def norm_seen(v: str) -> str:
    """The comparison key: stripped and upper-cased."""
    return (v or "").strip().upper()


def sample_worth_keeping(seen: str, means: str, confidence) -> bool:
    """Is this correction evidence about the READER?

    Four refusals, the same four the correction pass made, plus one more that
    only applies here:

      `confidence is None` means the value being replaced was typed by a
      person, not produced by the reader - override_answer nulls the
      confidence precisely because the reading no longer stands. Correcting an
      already-corrected item says nothing about the recogniser, and counting
      it would let one teacher's repeated edits manufacture a suggestion.
    """
    if confidence is None:
        return False
    a, b = norm_seen(seen), norm_seen(means)
    if not a or not b or a == b:
        return False
    if a == norm_seen(BLANK) or b == norm_seen(BLANK):
        return False
    if CONTESTED_SEP in a or CONTESTED_SEP in b:
        return False
    return True


def build_sample(score: PaperScore, exam_id: int, means: str,
                 user_id: Optional[int]) -> Optional[OCRCorrectionSample]:
    """The row to record, or None when this correction is not evidence.

    Pure: takes the PaperScore as it stands BEFORE it is overwritten. The
    caller owns the transaction and decides how to insert it - see the
    paper_answer_service hook, which uses a SAVEPOINT so that a failure here
    can never cost a teacher their correction.
    """
    seen = score.student_answer
    if not sample_worth_keeping(seen, means, score.ocr_confidence):
        return None
    return OCRCorrectionSample(
        score_id=score.score_id,
        exam_id=exam_id,
        question_number=score.question_number,
        seen=(seen or "").strip()[:100],
        means=(means or "").strip()[:100],
        confidence=score.ocr_confidence,
        corrected_by=user_id,
    )
