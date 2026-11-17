"""
app/api/routes/admin_students.py
================================
NEW 2026-11-17 — the GLOBAL student table, maintained by an administrator.

    Recommendations page 6:
      "For ADMIN Page ONLY: When you click this option "Students" in the side
       bar. Remove this Pop-up Page ... Instead display this Page ONLY: Where
       we maintain and add Student Number, Last Name First Name, Middle Name
       and Section. This the GLOBAL info of Student Info."
      "This list reflects the Student Numbers for All students, arranged in
       ascending order."

REGISTER IT. One line in `backend/app/api/routes/__init__.py`, beside the
others - NOT in main.py, which names no individual router
(ROUTER-WIRING-2026-11-11.md).

WHY A SEPARATE ROUTER, AND NOT A ROLE FLAG ON students.py
---------------------------------------------------------
admin.py made this argument on 2026-11-13 and it holds here:

    "The obvious way to add an administrator is to change every ownership test
     from `created_by == uid` to `created_by == uid OR is_admin`. ... a mistake
     in any one of them hands a teacher another teacher's papers again."

So students.py is not touched by this file. Its endpoints keep answering the
same question for a teacher. Everything an administrator may do to the WHOLE
table lives here, behind `_admin`, under one prefix - which keeps `/admin*`
the complete, greppable list of places one user reaches another's data.

`_admin` IS IMPORTED, NOT RE-DECLARED. It reads the role from the database
rather than the token, so removing an administrator takes effect on their next
request; a second copy of that logic here is a second thing to get wrong, and
the 2026-11-12 authz regression came from exactly that kind of duplication.

403, NOT 404 — same reasoning as admin.py: the endpoint's existence is not a
secret and "you are not an administrator" is the honest answer. `_admin`
already answers that way.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import User
from app.schemas.student import (
    StudentCreate, StudentUpdate, StudentResponse, StudentDetailResponse,
    StudentDeleteResponse,
)
from app.services import student_service
# The SINGLE definition of "is this caller an administrator", from the router
# that owns the question. admin.py imports nothing from here, so this cannot
# become a cycle.
from app.api.routes.admin import _admin

router = APIRouter(prefix="/admin/students", tags=["admin"])


@router.get("", response_model=List[StudentResponse])
async def list_all_students(
    q: Optional[str] = Query(None, description="Matches surname, given name or number."),
    admin: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
):
    """Every student, ascending by number.

    "arranged in ascending order" is page 6's wording, and it is ordered in the
    DATABASE for the reason list_students() already is: a 300-row table should
    not be sorted in the browser on every keystroke.

    Ascending by `lower(trim(student_number))`, not by the raw column: that is
    what ux_students_number indexes, so the order the administrator sees and
    the order the uniqueness rule uses are the same order. "2021-A123" and
    "2021-a123" sit together rather than in two different halves of the list.
    """
    del admin          # the dependency IS the authorisation; nothing else needs it
    return await student_service.all_students(db, query=q)


@router.post("", response_model=StudentResponse, status_code=201)
async def add_global_student(
    data: StudentCreate,
    admin: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
):
    """409 on a duplicate number, 422 on a bad value — as students.py does.

    `created_by` records WHO TYPED IT IN, which since
    migrations/2026-11-17_global_students.sql is all it means. It is not
    ownership and nothing filters on it.
    """
    try:
        return await student_service.create_student(
            db, admin.user_id,
            student_number=data.student_number,
            last_name=data.last_name,
            first_name=data.first_name,
            middle_name=data.middle_name,
            section=data.section,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except student_service.DuplicateStudent as dup:
        raise HTTPException(status_code=409, detail=dup.message)


@router.get("/{student_id}", response_model=StudentDetailResponse)
async def get_global_student(
    student_id: int,
    admin: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
):
    del admin
    student = await student_service.get_student(db, None, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    count = await student_service.papers_count(db, student_id)
    return StudentDetailResponse(
        student_id=student.student_id,
        student_number=student.student_number,
        last_name=student.last_name,
        first_name=student.first_name,
        middle_name=student.middle_name,
        section=student.section,
        created_at=student.created_at,
        papers_count=count,
    )


@router.put("/{student_id}", response_model=StudentResponse)
async def edit_global_student(
    student_id: int,
    data: StudentUpdate,
    admin: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
):
    del admin
    try:
        student = await student_service.update_student(
            db, None, student_id,
            student_number=data.student_number,
            last_name=data.last_name,
            first_name=data.first_name,
            middle_name=data.middle_name,
            section=data.section,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except student_service.DuplicateStudent as dup:
        raise HTTPException(status_code=409, detail=dup.message)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    return student


@router.delete("/{student_id}", response_model=StudentDeleteResponse)
async def remove_global_student(
    student_id: int,
    admin: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
):
    """Remove a student from the GLOBAL table. Their papers survive.

    `test_papers.student_id` is ON DELETE SET NULL and the paper keeps its own
    last_name / first_name, so marked answers and scores are untouched - the
    same guarantee students.py gives, and the reason that FK was never a
    CASCADE.

    THE COUNT IS READ FIRST, because afterwards nothing points at the row to
    count. It is also now a count across EVERY teacher's exams, not one
    teacher's, so the warning an administrator sees is the true blast radius.
    """
    del admin
    if not await student_service.get_student(db, None, student_id):
        raise HTTPException(status_code=404, detail="Student not found")

    count = await student_service.papers_count(db, student_id)
    await student_service.delete_student(db, None, student_id)

    if count == 0:
        message = "Student removed from the global list."
    else:
        message = (
            f"Student removed. {count} test paper(s) across all teachers are no "
            "longer linked to a roster entry — their scores and marked answers "
            "are untouched."
        )
    return StudentDeleteResponse(
        success=True, student_id=student_id,
        papers_unlinked=count, message=message,
    )
