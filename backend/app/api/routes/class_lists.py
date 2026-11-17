"""
app/api/routes/class_lists.py
=============================
NEW 2026-11-17 — Recommendations page 7.

    "Additional Option in Side Bar after "Student" Options:
     Additional Option Label = "List of Students"
     This reflect students for each subject and specific schedule a Teacher
     handles."

REGISTER IT. One line in `backend/app/api/routes/__init__.py` - NOT in
main.py (ROUTER-WIRING-2026-11-11.md).

PREFIX /class-lists, not /list-of-students. "List of Students" is the LABEL a
teacher reads; the resource is a class list, and a URL that reads like a
sentence from a document ages badly the moment the document is revised - as
page 6 was revised by page 7 four days before this was written.

TEACHER-SCOPED THROUGHOUT. Every handler reaches the list through
class_list_service.get(db, uid, id), which filters on created_by - so a list
id belonging to another teacher answers 404, the same shape papers.py uses.
The STUDENTS inside are global; the LIST is private. That asymmetry is the
design, and it is why the student lookup lives in students.py behind its own
read-only route rather than here.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.class_list import (
    ClassListCreate, ClassListResponse, ClassListDetailResponse,
    ClassListMemberRequest, ClassListMemberResponse,
)
from app.schemas.student import StudentResponse
from app.services import class_list_service
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/class-lists", tags=["class-lists"])
bearer = HTTPBearer()


async def _uid(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> int:
    user = await get_current_user(db, credentials.credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user.user_id


@router.get("", response_model=List[ClassListResponse])
async def list_class_lists(
    uid: int = Depends(_uid),
    db: AsyncSession = Depends(get_db),
):
    """Every list this teacher has, with its student count.

    The count comes from ONE grouped query rather than one per list - the
    picker renders them all, and a dropdown should not cost N round trips.
    """
    rows = await class_list_service.list_for(db, uid)
    counts = await class_list_service.counts(
        db, [r.class_list_id for r in rows])
    return [
        ClassListResponse(
            class_list_id=r.class_list_id,
            subject=r.subject,
            schedule=r.schedule,
            created_at=r.created_at,
            student_count=counts.get(r.class_list_id, 0),
        )
        for r in rows
    ]


@router.post("", response_model=ClassListResponse, status_code=201)
async def create_class_list(
    data: ClassListCreate,
    uid: int = Depends(_uid),
    db: AsyncSession = Depends(get_db),
):
    """409 when this teacher already has that subject+schedule.

    Not 422: the request is well formed and both values are valid; it is the
    teacher's existing lists that refuse it. The same call students.py makes
    for a duplicate student number, and for the same reason - 422 would say
    "you typed something wrong" when they did not.
    """
    try:
        row = await class_list_service.create(
            db, uid, subject=data.subject, schedule=data.schedule)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except class_list_service.DuplicateClassList as dup:
        raise HTTPException(status_code=409, detail=dup.message)
    return ClassListResponse(
        class_list_id=row.class_list_id, subject=row.subject,
        schedule=row.schedule, created_at=row.created_at, student_count=0,
    )


@router.get("/{class_list_id}", response_model=ClassListDetailResponse)
async def get_class_list(
    class_list_id: int,
    q: Optional[str] = Query(None, description="Matches name or number."),
    uid: int = Depends(_uid),
    db: AsyncSession = Depends(get_db),
):
    """One list and the students on it, by surname."""
    row = await class_list_service.get(db, uid, class_list_id)
    if not row:
        raise HTTPException(status_code=404, detail="List not found")
    students = await class_list_service.students_in(db, class_list_id, query=q)
    return ClassListDetailResponse(
        class_list_id=row.class_list_id, subject=row.subject,
        schedule=row.schedule, created_at=row.created_at,
        student_count=len(students),
        students=[StudentResponse.model_validate(s) for s in students],
    )


@router.post("/{class_list_id}/students", response_model=ClassListMemberResponse)
async def add_student_to_list(
    class_list_id: int,
    data: ClassListMemberRequest,
    uid: int = Depends(_uid),
    db: AsyncSession = Depends(get_db),
):
    """Put an existing GLOBAL student on this list, by number.

    404 when no student has that number — page 7's auto-fill reads the global
    table, and a teacher may not invent a student here. Nothing in this
    endpoint can create one.

    200 with `success: false` is NOT used. A number that does not exist is a
    404 so the screen can tell it from a number that does; already-a-member is
    a 200 that says so, because re-typing a number is not a mistake.
    """
    row = await class_list_service.get(db, uid, class_list_id)
    if not row:
        raise HTTPException(status_code=404, detail="List not found")

    student, message = await class_list_service.add_member(
        db, class_list_id, data.student_number)
    if not student:
        raise HTTPException(status_code=404, detail=message)

    return ClassListMemberResponse(
        success=True, class_list_id=class_list_id,
        student=StudentResponse.model_validate(student), message=message,
    )


@router.delete("/{class_list_id}/students/{student_id}",
               response_model=ClassListMemberResponse)
async def remove_student_from_list(
    class_list_id: int,
    student_id: int,
    uid: int = Depends(_uid),
    db: AsyncSession = Depends(get_db),
):
    """Take a student OFF this list. The student and their papers survive.

    This is the one a teacher will reach for by mistake expecting it to
    delete the student, so the message says what it actually did.
    """
    row = await class_list_service.get(db, uid, class_list_id)
    if not row:
        raise HTTPException(status_code=404, detail="List not found")

    removed = await class_list_service.remove_member(
        db, class_list_id, student_id)
    if not removed:
        raise HTTPException(status_code=404, detail="That student is not on this list.")
    return ClassListMemberResponse(
        success=True, class_list_id=class_list_id, student=None,
        message=("Removed from this list. The student stays on the school "
                 "roster and their papers are untouched."),
    )


@router.delete("/{class_list_id}", response_model=ClassListMemberResponse)
async def delete_class_list(
    class_list_id: int,
    uid: int = Depends(_uid),
    db: AsyncSession = Depends(get_db),
):
    """Remove a whole list. Its memberships go; the students do not."""
    if not await class_list_service.delete_list(db, uid, class_list_id):
        raise HTTPException(status_code=404, detail="List not found")
    return ClassListMemberResponse(
        success=True, class_list_id=class_list_id, student=None,
        message=("List removed. The students stay on the school roster."),
    )
