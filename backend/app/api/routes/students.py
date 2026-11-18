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
    StudentBulkRequest, StudentBulkResponse, StudentDeleteResponse, StudentExamRecord
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


@router.get("/lookup", response_model=StudentResponse)
async def lookup_student(
    number: str = Query(..., description="The student number to look up."),
    uid: int = Depends(_uid),
    db: AsyncSession = Depends(get_db),
):
    """NEW 2026-11-17 - Recommendations page 6, the teacher's auto-fill.

        "Once you input the Student number, it will auto-populate the
         Student Name Info (Last Name, First Name and Middle Name) and
         Section Name from GLOBAL Database input of ADMIN ID."

    READ ONLY, and deliberately the ONLY place a teacher sees a student
    somebody else entered. It answers one question about one number the
    teacher already typed; it cannot list, search or enumerate the table.
    A teacher who guesses a number learns that the number exists and whose
    it is - which is the same thing the duplicate message on Add Student
    has told them since 2026-11-12, and is the point of a shared roster.

    404 when there is no such student, NOT an empty 200: the screen has to
    tell the difference between "nobody has that number" and "here is who
    does", and a 200 with empty fields would quietly blank the boxes the
    teacher had already filled in.

    DECLARED BEFORE /{student_id} like the other literal paths - see the
    note above.
    """
    del uid          # any signed-in user may look a number up
    student = await student_service.by_number(db, None, number)
    if not student:
        raise HTTPException(
            status_code=404,
            detail=(f"No student with number {number.strip()} has been added yet. "
                    f"Ask your administrator to add them first."))
    return student


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
            # NEW 2026-11-15. Without this the single-row form stored NULL, silently -
            # create_student's middle_name parameter simply defaulted.
            middle_name=data.middle_name,
            section=data.section,
        )
    except ValueError as e:
        # NEW 2026-11-15. The service re-checks every field and raises plain
        # ValueError; without this they arrive as an unhandled 500 with no
        # detail, while the SAME rule in the schema answers 422 and names the
        # field. 422 is right: the request is well-formed, a value is not.
        #
        # DuplicateStudent is NOT a ValueError subclass - checked, not assumed -
        # so this cannot swallow the 409 below.
        raise HTTPException(status_code=422, detail=str(e))
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
        middle_name=student.middle_name,
        section=student.section,
        created_at=student.created_at,
        papers_count=count,
    )

@router.get("/{student_id}/exams", response_model=StudentExamRecord)
async def student_exam_record(
    student_id: int,
    uid: int = Depends(_uid),
    db: AsyncSession = Depends(get_db),
):
    """NEW 2026-11-17 — Recommendations page 11. READ ONLY.

    404 when nobody holds that id. An EMPTY `exams` list is not a 404: the
    student exists and this teacher simply has no papers for them, which the
    screen says in words. Conflating the two would show "student not found"
    for a student plainly sitting on the class list.
    """
    student = await student_service.get_student(db, None, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    return StudentExamRecord(
        student=student,
        exams=await student_service.exams_for_student(db, uid, student_id),
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
            # NEW 2026-11-15. This is the line whose absence produced
            # "ValueError: Middle name is required." on a form that had one typed in.
            middle_name=data.middle_name,
            section=data.section,
        )
    except ValueError as e:
        # NEW 2026-11-15. The service re-checks every field and raises plain
        # ValueError; without this they arrive as an unhandled 500 with no
        # detail, while the SAME rule in the schema answers 422 and names the
        # field. 422 is right: the request is well-formed, a value is not.
        #
        # DuplicateStudent is NOT a ValueError subclass - checked, not assumed -
        # so this cannot swallow the 409 below.
        raise HTTPException(status_code=422, detail=str(e))
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

