"""
app/services/reference_service.py
=================================
NEW 2026-11-14 — the three maintainable dropdown lists.

TWO AUDIENCES, ONE SOURCE. The read helpers serve every signed-in teacher
(they fill the Edit Profile and Setup dropdowns) and the write helpers serve
an administrator. Both go through this module so that "what counts as a valid
college" has exactly one definition, and `validate_selection()` below is that
definition - it is what replaces `CollegeEnum`.

DEACTIVATE, DO NOT DELETE. `set_active(False)` always works. `delete_*` works
only when nothing references the row, and raises 409 otherwise. An
administrator must not be able to change, by a single click, what is stored in
another teacher's profile - the same boundary the 2026-11-12 ownership guards
draw, applied to reference data.

ONE SUBTLETY WORTH KNOWING. `user_profiles` stores the college CODE and the
course NAME as plain strings, not foreign keys. So "is this course in use?"
is a match on the text, and RENAMING a course does not follow through to the
profiles that stored the old name. That is why rename is offered but the UI
warns, and why `in_use` is shown before any edit: it is the honest cost of not
rewriting a column three screens read, nineteen days before a defence.
"""
from typing import List, Optional, Sequence, Tuple

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.profile import UserProfile
from app.models.reference import College, Course, YearLevel


# ── reads ──────────────────────────────────────────────────────────────────

async def list_colleges(db: AsyncSession, include_inactive: bool = False) -> Sequence[College]:
    stmt = select(College).order_by(College.sort_order, College.code)
    if not include_inactive:
        stmt = stmt.where(College.active.is_(True))
    return (await db.execute(stmt)).scalars().all()


async def get_college(db: AsyncSession, college_id: int) -> College:
    row = (await db.execute(
        select(College).where(College.college_id == college_id)
    )).scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="College not found")
    return row


async def college_by_code(db: AsyncSession, code: str) -> Optional[College]:
    return (await db.execute(
        select(College).where(College.code == code)
    )).scalars().first()


async def list_courses(db: AsyncSession, college_id: int,
                       include_inactive: bool = False) -> Sequence[Course]:
    stmt = (select(Course).where(Course.college_id == college_id)
            .order_by(Course.sort_order, Course.name))
    if not include_inactive:
        stmt = stmt.where(Course.active.is_(True))
    return (await db.execute(stmt)).scalars().all()


async def list_year_levels(db: AsyncSession, college_id: int,
                           include_inactive: bool = False) -> Sequence[YearLevel]:
    stmt = (select(YearLevel).where(YearLevel.college_id == college_id)
            .order_by(YearLevel.level))
    if not include_inactive:
        stmt = stmt.where(YearLevel.active.is_(True))
    return (await db.execute(stmt)).scalars().all()


# ── how much is standing on a row ──────────────────────────────────────────
# Counted against `user_profiles`, which stores the college CODE and the course
# NAME as text. These three are what make "deactivate" safe and "delete"
# refusable, and the number is shown on the admin screen BEFORE the switch is
# thrown rather than in an error afterwards.

async def college_in_use(db: AsyncSession, code: str) -> int:
    return (await db.execute(
        select(func.count()).select_from(UserProfile).where(UserProfile.college == code)
    )).scalar_one()


async def course_in_use(db: AsyncSession, college_code: str, name: str) -> int:
    return (await db.execute(
        select(func.count()).select_from(UserProfile)
        .where(UserProfile.college == college_code, UserProfile.course == name)
    )).scalar_one()


async def year_level_in_use(db: AsyncSession, college_code: str, level: int) -> int:
    return (await db.execute(
        select(func.count()).select_from(UserProfile)
        .where(UserProfile.college == college_code, UserProfile.year_level == level)
    )).scalar_one()


# ── the rule that replaces CollegeEnum ─────────────────────────────────────

async def validate_selection(
    db: AsyncSession,
    college: Optional[str],
    course: Optional[str],
    year_level: Optional[int],
) -> None:
    """Refuse a profile save that names something not on the lists.

    THIS IS WHERE THE DATABASE CHECK CONSTRAINT WENT. `user_profiles` no longer
    carries `user_profiles_college_check`, because a CHECK cannot reference
    another table; the rule lives here instead and is applied on every save.

    Each field is checked ONLY when it is being set, because a PUT that omits a
    field leaves it alone - the rule update_profile() already follows. And an
    INACTIVE entry is refused for a NEW save while remaining perfectly valid as
    a stored value: that asymmetry is the whole point of `active`.
    """
    if college is not None:
        row = await college_by_code(db, college)
        # TWO DIFFERENT FACTS, TWO DIFFERENT SENTENCES. "There is no such
        # college" and "that college has been switched off" are not the same
        # thing, and a teacher who is told the first about a college they can
        # see on their own saved profile will reasonably think the system is
        # broken. Collapsing them into one message is the 2026-10-08 defect in
        # miniature - a screen stating something other than what happened.
        if not row:
            raise HTTPException(
                status_code=422,
                detail=f"{college} is not on the list of colleges.")
        if not row.active:
            raise HTTPException(
                status_code=422,
                detail=(f"{college} is no longer offered. Your saved profile is "
                        f"unaffected, but please choose a current college to save "
                        f"a change."))

    if course is not None and college is not None:
        row = await college_by_code(db, college)
        if row:
            hit = (await db.execute(
                select(Course).where(Course.college_id == row.college_id,
                                     Course.name == course,
                                     Course.active.is_(True))
            )).scalars().first()
            if not hit:
                raise HTTPException(
                    status_code=422,
                    detail=f"That course is not listed under {college}.")

    if year_level is not None and college is not None:
        row = await college_by_code(db, college)
        if row:
            hit = (await db.execute(
                select(YearLevel).where(YearLevel.college_id == row.college_id,
                                        YearLevel.level == year_level,
                                        YearLevel.active.is_(True))
            )).scalars().first()
            if not hit:
                raise HTTPException(
                    status_code=422,
                    detail=f"Year level {year_level} is not offered by {college}.")


# ── writes: colleges ───────────────────────────────────────────────────────

def _apply(row, data: dict) -> None:
    """Set only the keys the request actually sent.

    `exclude_unset` at the route, this here: together they mean a PATCH-shaped
    PUT that mentions `active` alone does not blank the name. The 2026-11-03
    year_level note explains why an unconditional assign on a schema whose
    defaults are None wipes data."""
    for k, v in data.items():
        setattr(row, k, v)


async def create_college(db: AsyncSession, data: dict) -> College:
    if await college_by_code(db, data["code"]):
        raise HTTPException(status_code=409,
                            detail=f"A college with the code {data['code']} already exists.")
    row = College(**data)
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409,
                            detail=f"A college with the code {data['code']} already exists.")
    await db.refresh(row)
    return row


async def update_college(db: AsyncSession, college_id: int, data: dict) -> College:
    row = await get_college(db, college_id)
    old_code = row.code
    new_code = data.get("code", old_code)
    # RENAMING A CODE ORPHANS PROFILES. user_profiles.college stores the text,
    # so changing "CAST" to "CASTE" leaves every CAST profile pointing at a
    # college that no longer exists, and their next save is refused by
    # validate_selection(). Refused rather than cascaded: a silent UPDATE
    # across other teachers' rows is exactly what this design does not do.
    if new_code != old_code:
        used = await college_in_use(db, old_code)
        if used:
            raise HTTPException(
                status_code=409,
                detail=(f"{old_code} is saved in {used} profile(s), so its code cannot "
                        f"be changed. Rename the display name instead, or switch the "
                        f"college off to hide it from the dropdowns."))
    _apply(row, data)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="That code is already taken.")
    await db.refresh(row)
    return row


async def delete_college(db: AsyncSession, college_id: int) -> None:
    row = await get_college(db, college_id)
    used = await college_in_use(db, row.code)
    if used:
        raise HTTPException(
            status_code=409,
            detail=(f"{row.code} is saved in {used} profile(s) and cannot be deleted. "
                    f"Switch it off instead - it will disappear from the dropdowns "
                    f"and those profiles will keep working."))
    await db.delete(row)          # courses and year levels cascade
    await db.commit()


# ── writes: courses ────────────────────────────────────────────────────────

async def get_course(db: AsyncSession, course_id: int) -> Course:
    row = (await db.execute(
        select(Course).where(Course.course_id == course_id))).scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Course not found")
    return row


async def create_course(db: AsyncSession, college_id: int, data: dict) -> Course:
    await get_college(db, college_id)
    row = Course(college_id=college_id, **data)
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409,
                            detail="That course is already listed under this college.")
    await db.refresh(row)
    return row


async def update_course(db: AsyncSession, course_id: int, data: dict) -> Course:
    row = await get_course(db, course_id)
    college = await get_college(db, row.college_id)
    new_name = data.get("name", row.name)
    if new_name != row.name:
        used = await course_in_use(db, college.code, row.name)
        if used:
            raise HTTPException(
                status_code=409,
                detail=(f"That course is saved in {used} profile(s), so renaming it "
                        f"would leave them pointing at a course that no longer exists. "
                        f"Switch it off and add the new name instead."))
    _apply(row, data)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409,
                            detail="That course is already listed under this college.")
    await db.refresh(row)
    return row


async def delete_course(db: AsyncSession, course_id: int) -> None:
    row = await get_course(db, course_id)
    college = await get_college(db, row.college_id)
    used = await course_in_use(db, college.code, row.name)
    if used:
        raise HTTPException(
            status_code=409,
            detail=(f"That course is saved in {used} profile(s) and cannot be deleted. "
                    f"Switch it off instead."))
    await db.delete(row)
    await db.commit()


# ── writes: year levels ────────────────────────────────────────────────────

async def get_year_level(db: AsyncSession, year_level_id: int) -> YearLevel:
    row = (await db.execute(
        select(YearLevel).where(YearLevel.year_level_id == year_level_id))).scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Year level not found")
    return row


async def create_year_level(db: AsyncSession, college_id: int, data: dict) -> YearLevel:
    await get_college(db, college_id)
    row = YearLevel(college_id=college_id, **data)
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409,
                            detail="That year level is already listed under this college.")
    await db.refresh(row)
    return row


async def update_year_level(db: AsyncSession, year_level_id: int, data: dict) -> YearLevel:
    row = await get_year_level(db, year_level_id)
    college = await get_college(db, row.college_id)
    new_level = data.get("level", row.level)
    if new_level != row.level:
        used = await year_level_in_use(db, college.code, row.level)
        if used:
            raise HTTPException(
                status_code=409,
                detail=(f"Year level {row.level} is saved in {used} profile(s), so its "
                        f"number cannot be changed. Edit the label instead."))
    _apply(row, data)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409,
                            detail="That year level is already listed under this college.")
    await db.refresh(row)
    return row


async def delete_year_level(db: AsyncSession, year_level_id: int) -> None:
    row = await get_year_level(db, year_level_id)
    college = await get_college(db, row.college_id)
    used = await year_level_in_use(db, college.code, row.level)
    if used:
        raise HTTPException(
            status_code=409,
            detail=(f"Year level {row.level} is saved in {used} profile(s) and cannot "
                    f"be deleted. Switch it off instead."))
    await db.delete(row)
    await db.commit()