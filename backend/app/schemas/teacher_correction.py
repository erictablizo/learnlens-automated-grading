# -*- coding: utf-8 -*-
"""
backend/app/schemas/teacher_correction.py                        2026-11-25
============================================================================

Ms. Melanie, Recommendations page 19, requirement 1: "Admin side can monitor
how many the teachers recorrected answer".

Two shapes: the per-teacher tally, and one corrected answer.
"""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class TeacherCorrectionCount(BaseModel):
    """One account's tally."""
    user_id: int
    email:   str
    role:    str
    name:    Optional[str] = None

    # EVERY answer on this teacher's exams that a person has typed over -
    # paper_scores.ocr_confidence IS NULL. This is the number her
    # requirement asks for.
    corrections: int

    # Of those, how many were kept as evidence about the reader.
    # ALWAYS <= corrections, and the gap is not an error: a second correction
    # of the same item, a correction to or from blank, and a contested `a|b`
    # reading are all refused by correction_service.sample_worth_keeping,
    # because none of them says anything about the recogniser. The screen
    # shows both so the gap is visible instead of two tables quietly
    # disagreeing.
    samples: int


class CorrectedAnswer(BaseModel):
    """One re-corrected answer, with the reader's version where it was kept."""
    score_id:        int
    exam_id:         int
    exam_name:       str
    question_number: int

    # What the item says NOW - the teacher's answer - and what the key says.
    answer:         str
    correct_answer: str
    verdict:        str

    # What the reader had before the teacher changed it. None when the
    # correction was not kept as evidence; see `samples` above. The two
    # timestamps and corrected_by come from the same row, so they are None
    # together.
    reader_saw:        Optional[str] = None
    reader_confidence: Optional[float] = None
    corrected_by:      Optional[int] = None
    corrected_at:      Optional[datetime] = None


class TeacherCorrectionDetail(BaseModel):
    user_id: int
    email:   str
    items:   List[CorrectedAnswer]
    # True when the list was cut at the limit. Said rather than silently
    # shown short, which is how a count and a list come to disagree.
    truncated: bool = False