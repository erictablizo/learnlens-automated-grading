"""
NEW 2026-11-11 — response models for the Data Analytics page.

Save as: backend/app/schemas/analytics.py
"""
from typing import List

from pydantic import BaseModel


class ItemAnalytics(BaseModel):
    """One question, counted across every paper in the exam."""

    question_number: int
    correct_answer: str

    # True when this item was graded against MORE THAN ONE answer key - i.e.
    # the key was edited after some papers were already checked, and those
    # papers still carry the old verdict. The page shows a warning on such a
    # row, because its wrong-count is not a fact about the students.
    key_mismatch: bool

    answered: int   # rows recorded for this item = papers graded so far
    correct: int
    wrong: int      # Doc Rubrica's "number that students did not get the correct answer"
    review: int     # still waiting for the teacher's decision; neither correct nor wrong
    blank: int      # left blank or not detected; a SUBSET of `wrong`, not an extra category


class ExamAnalytics(BaseModel):
    exam_id: int
    papers_total: int     # every paper added to this exam
    papers_checked: int   # those with checked = true; the rest have provisional scores
    items: List[ItemAnalytics]