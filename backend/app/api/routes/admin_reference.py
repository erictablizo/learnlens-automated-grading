"""
app/api/routes/admin_reference.py
=================================
NEW 2026-11-14 — maintaining the three dropdown lists.

    Alex Passion / Julius Bancud, Recommendations page 1:
      "Create an Admin Page - only Admin ID can access this Page"
      "Where to maintain the list of College Info in College Dropdown List"
      "Where to maintain the list of Course / Program Info ..."
      "Where to maintain the list of Year Level Info ..."

REGISTER IT. One line in `backend/app/api/routes/__init__.py`, beside the
others.

WHY A SECOND ADMIN FILE INSTEAD OF ADDING TO admin.py
-----------------------------------------------------
`admin.py` says of itself, and its schema file repeats it: READ-ONLY,
deliberately. It was written, deployed and verified on 2026-11-13 on exactly
that promise. Adding the first write endpoints to it would quietly retire a
documented guarantee inside a file nobody re-reads, and would mean editing a
router that is already running correctly in production.

So this is its own file, and it IMPORTS `_admin` rather than re-implementing
it. That matters more than the file split: there is still exactly ONE
definition of "is this caller an administrator", in `admin.py`, and changing
it changes both. Two copies of an authorisation test is how they drift.

AND THE PROMISE IS NOT BROKEN, it is made precise. `admin.py` is read-only
about TEACHERS' WORK - exams, papers, students, scores. Nothing here touches
any of that. What is writable here is REFERENCE DATA: the school's own list of
colleges, courses and year levels, which belongs to nobody in particular and
is the entire point of the recommendation. The one place the two meet is
guarded in `reference_service`: a row that a teacher's profile is standing on
cannot be deleted or re-coded, only switched off.
"""
from typing import List

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import User
# ONE definition of "administrator", imported rather than copied. See above.
from app.api.routes.admin import _admin
from app.schemas.reference import (
    CollegeIn, CollegeOut, CourseIn, CourseOut, YearLevelIn, YearLevelOut,
)
from app.services import reference_service as ref

router = APIRouter(prefix="/admin/reference", tags=["admin"])


# ── colleges ───────────────────────────────────────────────────────────────

@router.get("/colleges", response_model=List[CollegeOut])
async def colleges(
    _: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
):
    """Every college, ACTIVE OR NOT, each with how many profiles hold it.

    Inactive rows are included here and nowhere else: an administrator has to
    be able to see what they switched off in order to switch it back on.

    `in_use` is computed per row rather than left for the screen to work out,
    because it is what decides whether Delete is offered at all - and showing
    the number BEFORE the click is the difference between a considered choice
    and an error message.
    """
    out = []
    for c in await ref.list_colleges(db, include_inactive=True):
        row = CollegeOut.model_validate(c).model_dump()
        row["in_use"] = await ref.college_in_use(db, c.code)
        out.append(row)
    return out


@router.post("/colleges", response_model=CollegeOut, status_code=201)
async def add_college(
    data: CollegeIn,
    _: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
):
    return await ref.create_college(db, data.model_dump(exclude_unset=True, exclude_none=True))


@router.put("/colleges/{college_id}", response_model=CollegeOut)
async def edit_college(
    college_id: int,
    data: CollegeIn,
    _: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
):
    """`exclude_unset`, so a request that sends only `active` does not blank
    the name. The 2026-11-03 year_level note is the reason this is not an
    unconditional assignment."""
    return await ref.update_college(db, college_id,
                                    data.model_dump(exclude_unset=True, exclude_none=True))


@router.delete("/colleges/{college_id}", status_code=204)
async def remove_college(
    college_id: int,
    _: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
):
    """409 when any profile holds it, with the count in the message."""
    await ref.delete_college(db, college_id)
    return Response(status_code=204)


# ── courses ────────────────────────────────────────────────────────────────

@router.get("/colleges/{college_id}/courses", response_model=List[CourseOut])
async def courses(
    college_id: int,
    _: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
):
    college = await ref.get_college(db, college_id)
    out = []
    for x in await ref.list_courses(db, college_id, include_inactive=True):
        row = CourseOut.model_validate(x).model_dump()
        row["in_use"] = await ref.course_in_use(db, college.code, x.name)
        out.append(row)
    return out


@router.post("/colleges/{college_id}/courses", response_model=CourseOut, status_code=201)
async def add_course(
    college_id: int,
    data: CourseIn,
    _: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
):
    return await ref.create_course(db, college_id,
                                   data.model_dump(exclude_unset=True, exclude_none=True))


@router.put("/courses/{course_id}", response_model=CourseOut)
async def edit_course(
    course_id: int,
    data: CourseIn,
    _: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
):
    return await ref.update_course(db, course_id,
                                   data.model_dump(exclude_unset=True, exclude_none=True))


@router.delete("/courses/{course_id}", status_code=204)
async def remove_course(
    course_id: int,
    _: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
):
    await ref.delete_course(db, course_id)
    return Response(status_code=204)


# ── year levels ────────────────────────────────────────────────────────────

@router.get("/colleges/{college_id}/year-levels", response_model=List[YearLevelOut])
async def year_levels(
    college_id: int,
    _: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
):
    college = await ref.get_college(db, college_id)
    out = []
    for x in await ref.list_year_levels(db, college_id, include_inactive=True):
        row = YearLevelOut.model_validate(x).model_dump()
        row["in_use"] = await ref.year_level_in_use(db, college.code, x.level)
        out.append(row)
    return out


@router.post("/colleges/{college_id}/year-levels", response_model=YearLevelOut, status_code=201)
async def add_year_level(
    college_id: int,
    data: YearLevelIn,
    _: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
):
    return await ref.create_year_level(db, college_id,
                                       data.model_dump(exclude_unset=True, exclude_none=True))


@router.put("/year-levels/{year_level_id}", response_model=YearLevelOut)
async def edit_year_level(
    year_level_id: int,
    data: YearLevelIn,
    _: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
):
    return await ref.update_year_level(db, year_level_id,
                                       data.model_dump(exclude_unset=True, exclude_none=True))


@router.delete("/year-levels/{year_level_id}", status_code=204)
async def remove_year_level(
    year_level_id: int,
    _: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
):
    await ref.delete_year_level(db, year_level_id)
    return Response(status_code=204)