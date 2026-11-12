"""
app/api/routes/students.py
==========================
NEW 2026-11-12 — the student roster.

    Alex Passion / Julius Bancud, post-UAT page 2, item 4:
      "Test Paper -> ID # Student / ID Student # -> file of Test Exam /
       Primary Key -> Additional Table"
    Doc Rubrica: "Create List of Students per Section"

Needs ONE line in `app/api/routes/__init__.py` — NOT in main.py, which names
no individual router (ROUTER-WIRING-2026-11-11.md).
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.student import (
    StudentCreate, StudentUpdate, StudentResponse, StudentDetailResponse,
    StudentBulkRequest, StudentBulkResponse, StudentDeleteResponse,
)
from app.services import student_service
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/students", tags=["students"])
bearer = HTTPBearer()


async def _uid(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> int:
    user = await get_current_user(db, credentials.credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user.user_id


# ---------------------------------------------------------------------------
# The LITERAL paths are declared before /{student_id}.
#
# Not strictly required - `student_id: int` compiles to a digits-only path
# regex, so "sections" and "bulk" cannot match it, MEASURED on 2026-11-11 for
# the /answer-key/generate case. Declared first anyway because it costs
# nothing and it stops being true the moment someone widens the parameter.
# ---------------------------------------------------------------------------

@router.get("/sections", response_model=List[str])
async def list_sections(uid: int = Depends(_uid), db: AsyncSession = Depends(get_db)):
    """The section labels this teacher already uses, for a dropdown.

    Read off the roster rather than kept in a table of their own: a section is
    a label on a student, and a sections table would need maintaining for no
    behaviour the screen does not already have.
    """
    return await student_service.sections(db, uid)


@router.post("/bulk", response_model=StudentBulkResponse)
async def bulk_add_students(
    data: StudentBulkRequest,
    uid: int = Depends(_uid),
    db: AsyncSession = Depends(get_db),
):
    """Add a pasted list. 200 even when rows failed.

    NOT 207, and not 422. Every row is accounted for in `created`, `skipped`
    or `failed`, and the teacher needs to read all three - a status code that
    made the browser treat the response as an error would hide the 32 students
    who WERE added. The only 422 here is a request whose shape is wrong.

    `success: False` is reserved for "nothing was attempted", which today means
    the list was over MAX_BULK_ROWS.
    """
    result = await student_service.bulk_create(
        db, uid,
        [row.model_dump() for row in data.rows],
        section=data.section,
    )
    if not result.get("success"):
        raise HTTPException(status_code=422, detail=result.get("reason", "Could not add that list."))
    return result


@router.get("", response_model=List[StudentResponse])
async def list_students(
    section: Optional[str] = Query(None, description="Exact section label; omit for all."),
    q: Optional[str] = Query(None, description="Matches surname, given name or number."),
    uid: int = Depends(_uid),
    db: AsyncSession = Depends(get_db),
):
    return await student_service.list_students(db, uid, section=section, query=q)


@router.post("", response_model=StudentResponse, status_code=201)
async def add_student(
    data: StudentCreate,
    uid: int = Depends(_uid),
    db: AsyncSession = Depends(get_db),
):
    """409, not 422, on a duplicate number.

    The request is well formed and every field is valid; it is the server's
    existing state that refuses it. The same call made on 2026-11-09 for
    DuplicatePaper, and for the same reason: 422 would tell the teacher she
    typed something wrong when she did not.

    `detail` is a plain string so api.ts's `body.detail ?? message` puts it
    straight on ApiError.message with no frontend change.
    """
    try:
        return await student_service.create_student(
            db, uid,
            student_number=data.student_number,
            last_name=data.last_name,
            first_name=data.first_name,
            section=data.section,
        )
    except student_service.DuplicateStudent as dup:
        raise HTTPException(status_code=409, detail=dup.message)


@router.get("/{student_id}", response_model=StudentDetailResponse)
async def get_student(
    student_id: int,
    uid: int = Depends(_uid),
    db: AsyncSession = Depends(get_db),
):
    """One student, with the count of papers linked to them.

    The count is here so the roster screen can warn before a delete instead of
    after it.
    """
    student = await student_service.get_student(db, uid, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    count = await student_service.papers_count(db, student_id)
    return StudentDetailResponse(
        student_id=student.student_id,
        student_number=student.student_number,
        last_name=student.last_name,
        first_name=student.first_name,
        section=student.section,
        created_at=student.created_at,
        papers_count=count,
    )


@router.put("/{student_id}", response_model=StudentResponse)
async def edit_student(
    student_id: int,
    data: StudentUpdate,
    uid: int = Depends(_uid),
    db: AsyncSession = Depends(get_db),
):
    try:
        student = await student_service.update_student(
            db, uid, student_id,
            student_number=data.student_number,
            last_name=data.last_name,
            first_name=data.first_name,
            section=data.section,
        )
    except student_service.DuplicateStudent as dup:
        raise HTTPException(status_code=409, detail=dup.message)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    return student


@router.delete("/{student_id}", response_model=StudentDeleteResponse)
async def remove_student(
    student_id: int,
    uid: int = Depends(_uid),
    db: AsyncSession = Depends(get_db),
):
    """Remove one student. THEIR PAPERS SURVIVE.

    `test_papers.student_id` is ON DELETE SET NULL, so the papers keep their
    scores, their marked answers and their own last_name / first_name; they
    only lose the roster link. The count is read BEFORE the delete, because
    afterwards there is nothing left pointing at the row to count.

    200 with a body rather than 204: there is something worth saying, and a
    silent 204 would leave the teacher wondering what happened to the papers.
    """
    if not await student_service.get_student(db, uid, student_id):
        raise HTTPException(status_code=404, detail="Student not found")

    count = await student_service.papers_count(db, student_id)
    await student_service.delete_student(db, uid, student_id)

    if count == 0:
        message = "Student removed from the roster."
    else:
        message = (
            f"Student removed. {count} test paper(s) are no longer linked to a "
            "roster entry — their scores and marked answers are untouched."
        )
    return StudentDeleteResponse(
        success=True, student_id=student_id,
        papers_unlinked=count, message=message,
    )