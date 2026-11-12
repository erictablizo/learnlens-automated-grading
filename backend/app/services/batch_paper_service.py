"""
app/services/batch_paper_service.py
===================================
NEW 2026-11-12 — creating a test paper FOR A ROSTER STUDENT.

    Alex Passion / Julius Bancud, page 2 item 7: "Batch upload -> of Exam",
    resting on item 4: "ID Student # -> file of Test Exam".

WHY THIS IS NOT `paper_service.create_paper`
---------------------------------------------
`create_paper` refuses a second paper whose LAST/FIRST name matches one already
in the exam (DuplicatePaper, 2026-11-09). That guard is right when a name is
all the system has — four identical "Tablizo, Erica Grace" rows got in before
it existed.

It is WRONG on this path, and wrong in the one way that matters: two different
students may share a name. A section with two Ana Cruzes is exactly the case
the student number was introduced to handle, and routing a by-student create
through the name guard would refuse the second Ana a paper while telling the
teacher she was a duplicate of the first.

So this path does not compare names at all. Uniqueness comes from
`ux_test_papers_exam_student`, UNIQUE (exam_id, student_id) WHERE student_id IS
NOT NULL — an exact test, which is the whole point of having an ID.

The paper still gets its own `last_name` / `first_name` / `student_name`,
copied from the roster at creation. That is deliberate: the paper records the
student as they were when the exam was taken, every existing read site keeps
working untouched, and the row stays readable if the roster entry is later
removed (the FK is ON DELETE SET NULL).
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Student, TestPaper
from app.services.paper_service import _owned_exam, compose_student_name


class PaperExistsForStudent(Exception):
    """This student already has a paper in this exam."""

    def __init__(self, student: Student, paper: TestPaper):
        self.student = student
        self.paper = paper
        self.message = (
            f"{student.last_name}, {student.first_name} "
            f"({student.student_number}) already has a paper in this exam."
        )
        super().__init__(self.message)


async def paper_for_student(
    db: AsyncSession, exam_id: int, student_id: int,
) -> Optional[TestPaper]:
    """The existing paper linking this student to this exam, or None.

    `.limit(1).scalars().first()` rather than `scalar_one_or_none()`: the
    partial unique index makes two impossible in a correct database, but this
    also runs against databases where the 2026-11-12 migration has not been
    applied, and MultipleResultsFound there would be a 500 instead of an
    answer. Same choice as `find_paper_by_name` (2026-11-09) and `by_number`.
    """
    return (await db.execute(
        select(TestPaper).where(
            TestPaper.exam_id == exam_id,
            TestPaper.student_id == student_id,
        ).limit(1)
    )).scalars().first()


async def create_for_student(
    db: AsyncSession,
    exam_id: int,
    owner_id: int,
    student: Student,
) -> Optional[TestPaper]:
    """Create this exam's paper for this roster student.

    Returns None when the exam is not this teacher's — the 404 shape, matching
    `create_paper`. Raises PaperExistsForStudent when one already exists.

    The caller is expected to have established that `student` belongs to the
    same teacher (routes/papers.py does, via student_service.by_number scoped
    to uid). The EXAM's ownership is re-checked here through `_owned_exam`,
    which is the one source of truth for it.
    """
    if not await _owned_exam(db, exam_id, owner_id):
        return None

    existing = await paper_for_student(db, exam_id, student.student_id)
    if existing:
        raise PaperExistsForStudent(student, existing)

    paper = TestPaper(
        exam_id=exam_id,
        student_id=student.student_id,
        last_name=student.last_name,
        first_name=student.first_name,
        # Composed by the same function paper_service uses, so exactly one
        # place in the codebase knows the "Last, First" format.
        student_name=compose_student_name(student.last_name, student.first_name),
        checked=False,
    )
    db.add(paper)
    await db.commit()
    await db.refresh(paper)
    return paper