"""
NEW 2026-11-11 — request and response for correcting an answer key item.

Save as: backend/app/schemas/answer_key.py
"""
from typing import List, Optional

from pydantic import BaseModel, field_validator

# Matches PaperScore.correct_answer / AnswerKey.correct_answer, String(100).
MAX_ANSWER_LEN = 100


class AnswerKeyItemUpdate(BaseModel):
    """Alex: "Can override or edit scanned answer in Answer Key (Column)"."""

    correct_answer: str

    @field_validator("correct_answer")
    @classmethod
    def check_answer(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            # ml.grader.grade_detected REFUSES to grade an exam that has any
            # blank key item - "a blank key cannot grade anything" - so
            # accepting one here would break checking for the entire exam,
            # not just this question.
            raise ValueError("The answer cannot be blank.")
        if len(v) > MAX_ANSWER_LEN:
            raise ValueError(f"The answer is too long (maximum {MAX_ANSWER_LEN} characters).")
        return v


class RescoredPaper(BaseModel):
    """One student whose total changed because of the correction."""

    paper_id:     int
    student_name: str
    old_score:    Optional[int]
    new_score:    Optional[int]
    was_checked:  bool
    now_checked:  bool


class AnswerKeyUpdateResult(BaseModel):
    exam_id:         int
    question_number: int
    old_answer:      str
    correct_answer:  str

    # Whether this item is graded as a WORD (three-state, a human confirms the
    # middle band) or by exact match. It can change with the edit itself: an
    # undeclared item whose key goes from "A" to "ANTONYM" becomes a word
    # answer. Returned so the screen can say so rather than leaving the
    # teacher to wonder why an item suddenly needs review.
    is_identification: bool

    papers_affected: int   # papers that had a row for this item
    items_flipped:   int   # rows whose verdict actually changed
    papers_rescored: List[RescoredPaper]