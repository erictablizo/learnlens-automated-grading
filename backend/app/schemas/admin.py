"""
app/schemas/admin.py
====================
NEW 2026-11-13 — the administrator view.

    Alex Passion / Julius Bancud, post-UAT page 2, item 1:
    "(*) Admin -> ID -> to handle maintenance"

READ-ONLY, deliberately. Nothing here changes another teacher's data. An
administrator who can delete across accounts has a blast radius nothing in
that note asks for, and the ownership guards this project spent 2026-11-12
installing exist precisely to keep one teacher out of another's papers.
Widening that is a separate decision, taken on purpose, not a side effect of
adding a list screen.
"""
from typing import Optional

from pydantic import BaseModel


class AdminTeacher(BaseModel):
    """One account, with how much of the system it owns."""

    user_id: int
    email: str
    role: str
    # Counted with CORRELATED SUBQUERIES rather than GROUP BY over joins, so a
    # teacher who has created nothing still appears with zeros. That teacher
    # is exactly who an administrator is looking for.
    exams: int
    students: int
    papers: int


class AdminExam(BaseModel):
    """One exam, and whose it is."""

    exam_id: int
    exam_name: str
    subject: Optional[str] = None
    schedule: Optional[str] = None
    owner_email: str
    owner_id: int
    # Answer-key rows. 0 means the key has not been generated yet.
    items: int
    papers: int
    # Papers with checked = true. The rest are unchecked or still under
    # review, and their scores are FLOORS - see grade_paper.
    checked: int


class AdminOverview(BaseModel):
    """The one-line summary an administrator lands on."""

    teachers: int
    admins: int
    exams: int
    papers: int
    students: int