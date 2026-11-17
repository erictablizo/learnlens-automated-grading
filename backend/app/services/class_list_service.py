"""
app/services/class_list_service.py
==================================
NEW 2026-11-17 — Recommendations page 7.

A class list is (TEACHER, SUBJECT, SCHEDULE) and the students in it. It is
NOT a section: a section is a property of the STUDENT, set by the
administrator on the global table, and page 7 has it auto-populate from there
rather than be typed per class.

WHY A JOIN TABLE AND NOT A COLUMN. A student is in as many class lists as
they take subjects - the same person sits in English101 MWF and Math2 TTh.
A subject column on `students` could hold one of those, which is how a roster
starts lying.

OWNERSHIP IS ON THE LIST, NOT THE STUDENT. `class_lists.created_by` is the
teacher and every query here filters on it, exactly as the teacher paths in
student_service.py always have. The STUDENTS reached through it are global,
and that asymmetry is the whole point of page 6 plus page 7: one roster,
many private lists over it.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import ClassList, ClassListStudent, Student
from app.schemas._text import check_schedule, check_subject
from app.services import student_service


class DuplicateClassList(Exception):
    """This teacher already has a list for that subject and schedule."""

    def __init__(self, existing: ClassList):
        self.existing = existing
        self.message = (
            f"You already have a list for {existing.subject} / "
            f"{existing.schedule}. Open it instead of creating another."
        )
        super().__init__(self.message)


def _key(v: str) -> str:
    """What ux_class_lists_owner_subject_schedule indexes: lower(trim(...)).

    Internal whitespace is collapsed too, the 2026-11-10 parity rule, so
    "MWF  7:30AM" and "MWF 7:30AM" are one schedule rather than two lists the
    teacher has to remember the spelling of.
    """
    return " ".join((v or "").split()).lower()


async def find(db: AsyncSession, owner_id: int,
               subject: str, schedule: str) -> Optional[ClassList]:
    """This teacher's list for that subject+schedule, or None."""
    s, t = _key(subject), _key(schedule)
    if not s or not t:
        return None
    return (await db.execute(
        select(ClassList).where(
            ClassList.created_by == owner_id,
            func.lower(func.trim(ClassList.subject)) == s,
            func.lower(func.trim(ClassList.schedule)) == t,
        ).limit(1)
    )).scalars().first()


async def get(db: AsyncSession, owner_id: int,
              class_list_id: int) -> Optional[ClassList]:
    """By row id, scoped to the teacher — the 404 shape."""
    return (await db.execute(
        select(ClassList).where(
            ClassList.class_list_id == class_list_id,
            ClassList.created_by == owner_id,
        )
    )).scalars().first()


async def counts(db: AsyncSession, ids: list[int]) -> dict[int, int]:
    """How many students are in each list. ONE query, not one per list.

    The picker shows every list the teacher has; counting inside a loop would
    be N round trips to render one dropdown.
    """
    if not ids:
        return {}
    rows = (await db.execute(
        select(ClassListStudent.class_list_id, func.count())
        .where(ClassListStudent.class_list_id.in_(ids))
        .group_by(ClassListStudent.class_list_id)
    )).all()
    return {cid: n for cid, n in rows}


async def list_for(db: AsyncSession, owner_id: int) -> list[ClassList]:
    """Every list this teacher has, by subject then schedule."""
    return list((await db.execute(
        select(ClassList)
        .where(ClassList.created_by == owner_id)
        .order_by(func.lower(ClassList.subject),
                  func.lower(ClassList.schedule),
                  ClassList.class_list_id)
    )).scalars().all())


async def create(db: AsyncSession, owner_id: int,
                 subject: str, schedule: str) -> ClassList:
    """Raises DuplicateClassList, or ValueError from the field rules."""
    subj = check_subject(subject)
    sched = check_schedule(schedule)

    existing = await find(db, owner_id, subj, sched)
    if existing:
        raise DuplicateClassList(existing)

    row = ClassList(created_by=owner_id, subject=subj, schedule=sched)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def students_in(db: AsyncSession, class_list_id: int,
                      query: Optional[str] = None) -> list[Student]:
    """The students on one list, by surname then given name.

    Ordered by NAME and not by number, unlike the administrator's global
    table: this is a class list a teacher reads down while handing papers
    back, and that is an alphabetical task. The admin's table is ordered by
    number because page 7 asks for it and because that is the order its
    uniqueness rule uses.
    """
    stmt = (select(Student)
            .join(ClassListStudent,
                  ClassListStudent.student_id == Student.student_id)
            .where(ClassListStudent.class_list_id == class_list_id))
    if query:
        q = f"%{' '.join(query.split()).lower()}%"
        stmt = stmt.where(
            func.lower(Student.last_name).like(q)
            | func.lower(Student.first_name).like(q)
            | func.lower(func.coalesce(Student.middle_name, "")).like(q)
            | func.lower(Student.student_number).like(q)
        )
    stmt = stmt.order_by(func.lower(Student.last_name),
                         func.lower(Student.first_name),
                         Student.student_id)
    return list((await db.execute(stmt)).scalars().all())


async def add_member(db: AsyncSession, class_list_id: int,
                     student_number: str) -> tuple[Optional[Student], str]:
    """Put an EXISTING global student on the list.

    Returns (student, message). `student` is None when there is no such
    number, which is the case page 7 leaves to the screen: the teacher is told
    to ask the administrator rather than being allowed to invent a student.
    NOTHING is created here - that is the difference between this and
    student_service.create_student, and it is the point.

    ALREADY-A-MEMBER IS NOT AN ERROR. Re-typing a number that is already on
    the list says so and changes nothing, the same way bulk_create treats a
    student already on the roster: pasting a list again to add three names is
    a normal thing to do.
    """
    student = await student_service.by_number(db, None, student_number)
    if not student:
        return None, (f"No student with number "
                      f"{' '.join((student_number or '').split())} has been "
                      f"added yet. Ask your administrator to add them first.")

    already = (await db.execute(
        select(ClassListStudent).where(
            ClassListStudent.class_list_id == class_list_id,
            ClassListStudent.student_id == student.student_id,
        )
    )).scalars().first()
    if already:
        return student, (f"{student.last_name}, {student.first_name} is "
                         f"already on this list.")

    db.add(ClassListStudent(class_list_id=class_list_id,
                            student_id=student.student_id))
    await db.commit()
    return student, f"{student.last_name}, {student.first_name} added."


async def remove_member(db: AsyncSession, class_list_id: int,
                        student_id: int) -> bool:
    """Take a student OFF this list. The student, and their papers, survive.

    This deletes a membership row and nothing else. A teacher tidying their
    class list must not be able to remove a student from the global table -
    that is the administrator's screen - and must certainly not touch papers.
    """
    result = await db.execute(
        delete(ClassListStudent).where(
            ClassListStudent.class_list_id == class_list_id,
            ClassListStudent.student_id == student_id,
        )
    )
    await db.commit()
    return result.rowcount > 0


async def delete_list(db: AsyncSession, owner_id: int,
                      class_list_id: int) -> bool:
    """Remove a whole list. Memberships cascade; the STUDENTS do not.

    class_list_students.student_id is ON DELETE CASCADE from the MEMBERSHIP
    side only - deleting a list deletes its rows in the join table, and the
    global student rows are untouched.
    """
    row = await get(db, owner_id, class_list_id)
    if not row:
        return False
    await db.delete(row)
    await db.commit()
    return True
