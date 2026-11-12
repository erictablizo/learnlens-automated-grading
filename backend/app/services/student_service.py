"""
app/services/student_service.py
===============================
NEW 2026-11-12 — the student roster.

    Alex Passion / Julius Bancud, post-UAT page 2, item 4:
      "Test Paper -> ID # Student / ID Student # -> file of Test Exam /
       Primary Key -> Additional Table"
    Doc Rubrica: "Create List of Students per Section"

This is the prerequisite for item 7, "Batch upload of Exam". The blocker
MULTI-PAGE-UPLOAD-2026-10-23.md recorded was "the system cannot know whose
paper is whose"; the student number, written on the paper and used as the
image's file name, is what answers it.

ONE NORMALISATION, ONE PLACE
----------------------------
`norm_number()` is what the UNIQUE index agrees with:
`lower(trim(student_number))`. Every lookup goes through it. The 2026-11-11
email-case bug happened because three callers each did their own thing and only
one of them lowercased; the index and the code have to say the same sentence.
"""
from __future__ import annotations

from typing import Iterable, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Student, TestPaper
from app.schemas._text import check_name_part

MAX_NUMBER_LEN = 50
MAX_BULK_ROWS = 300


class DuplicateStudent(Exception):
    """This teacher already has a student with that number."""

    def __init__(self, existing: Student):
        self.existing = existing
        self.message = (
            f"Student number {existing.student_number} is already used by "
            f"{existing.last_name}, {existing.first_name}."
        )
        super().__init__(self.message)


def norm_number(v: str) -> str:
    """What `ux_students_owner_number` indexes: lower(trim(...)).

    Internal whitespace is collapsed too, per the 2026-11-10 parity rule, so a
    number pasted out of a spreadsheet as "2021 - 00123" does not become a
    different student from "2021 - 00123" typed by hand.
    """
    return " ".join((v or "").split()).lower()


def tidy_number(v: str) -> str:
    """The value as STORED: whitespace tidied, case preserved.

    Case is kept because a school's IDs may be meaningfully cased ("BSCS-3A-01")
    and the teacher should see her own spelling back. Only the INDEX is
    case-insensitive.
    """
    return " ".join((v or "").split())[:MAX_NUMBER_LEN]


def check_number(v: str) -> str:
    s = tidy_number(v)
    if not s:
        raise ValueError("Student number is required.")
    return s


async def by_number(
    db: AsyncSession, owner_id: int, student_number: str,
) -> Optional[Student]:
    """This teacher's student with that number, or None.

    `.limit(1).scalars().first()` and not `scalar_one_or_none()`: the unique
    index makes two rows impossible in a correct database, but this function
    also runs against databases where the migration has not been applied yet,
    and `MultipleResultsFound` there would be a 500 instead of an answer. The
    same choice as `find_paper_by_name` on 2026-11-09.
    """
    key = norm_number(student_number)
    if not key:
        return None
    return (await db.execute(
        select(Student).where(
            Student.created_by == owner_id,
            func.lower(func.trim(Student.student_number)) == key,
        ).limit(1)
    )).scalars().first()

async def get_student(
    db: AsyncSession, owner_id: int, student_id: int,
) -> Optional[Student]:
    """This teacher's student by row id, or None — the 404 shape.

    EXTRACTED 2026-11-12: update_student and delete_student each carried this
    select inline, and routes/students.py needed a third copy. Three copies of
    an ownership test is how `_owned` came to be missing from papers.py for six
    days (PAPERS-AUTHZ-REGRESSION-2026-11-11.md) - one source of truth, as with
    `_owned_exam` in analytics.
    """
    return (await db.execute(
        select(Student).where(
            Student.student_id == student_id,
            Student.created_by == owner_id,
        )
    )).scalars().first()


async def list_students(
    db: AsyncSession,
    owner_id: int,
    section: Optional[str] = None,
    query: Optional[str] = None,
) -> list[Student]:
    """The roster, by section then surname then given name.

    Ordered in the database rather than the browser because the roster screen
    pages through it and a 300-row class should not be sorted client-side on
    every keystroke.
    """
    stmt = select(Student).where(Student.created_by == owner_id)
    if section is not None:
        s = " ".join(section.split())
        stmt = stmt.where(func.coalesce(Student.section, "") == s)
    if query:
        q = f"%{' '.join(query.split()).lower()}%"
        stmt = stmt.where(
            func.lower(Student.last_name).like(q)
            | func.lower(Student.first_name).like(q)
            | func.lower(Student.student_number).like(q)
        )
    stmt = stmt.order_by(
        func.coalesce(Student.section, ""),
        func.lower(Student.last_name),
        func.lower(Student.first_name),
        Student.student_id,
    )
    return list((await db.execute(stmt)).scalars().all())


async def sections(db: AsyncSession, owner_id: int) -> list[str]:
    """The distinct section labels this teacher uses, for a dropdown."""
    rows = (await db.execute(
        select(Student.section)
        .where(Student.created_by == owner_id, Student.section.isnot(None))
        .distinct()
        .order_by(Student.section)
    )).scalars().all()
    return [s for s in rows if s]


async def create_student(
    db: AsyncSession,
    owner_id: int,
    student_number: str,
    last_name: str,
    first_name: str,
    section: Optional[str] = None,
) -> Student:
    """One student. Raises DuplicateStudent, or ValueError from the name rules.

    The duplicate is checked BEFORE the insert so the teacher gets a sentence
    naming who already holds the number, rather than a constraint violation.
    The index is still what guarantees it — this check is the message, not the
    guard. (The 2026-11-09 lesson in reverse: there the index was missing and
    only the check existed, so four duplicates got in.)
    """
    number = check_number(student_number)
    last = check_name_part(last_name, "Last name")
    first = check_name_part(first_name, "First name")
    sect = " ".join((section or "").split()) or None

    existing = await by_number(db, owner_id, number)
    if existing:
        raise DuplicateStudent(existing)

    student = Student(
        created_by=owner_id, student_number=number,
        last_name=last, first_name=first, section=sect,
    )
    db.add(student)
    await db.commit()
    await db.refresh(student)
    return student


async def update_student(
    db: AsyncSession,
    owner_id: int,
    student_id: int,
    student_number: str,
    last_name: str,
    first_name: str,
    section: Optional[str] = None,
) -> Optional[Student]:
    """Returns None when the row is not this teacher's — the 404 shape."""
    number = check_number(student_number)
    last = check_name_part(last_name, "Last name")
    first = check_name_part(first_name, "First name")
    sect = " ".join((section or "").split()) or None

    student = await get_student(db, owner_id, student_id)
    if not student:
        return None

    clash = await by_number(db, owner_id, number)
    # Re-saving a student under their own number, or changing only its case,
    # is NOT a duplicate. Same exclusion rule as rename_paper (2026-11-09).
    if clash and clash.student_id != student_id:
        raise DuplicateStudent(clash)

    student.student_number = number
    student.last_name = last
    student.first_name = first
    student.section = sect
    await db.commit()
    await db.refresh(student)
    return student


async def delete_student(db: AsyncSession, owner_id: int, student_id: int) -> bool:
    """Remove one student from the roster.

    Their PAPERS SURVIVE. `test_papers.student_id` is ON DELETE SET NULL, and
    the paper keeps its own last_name / first_name, so an exam that has already
    been marked stays readable and keeps its scores. A CASCADE here would have
    erased marked answers because a teacher tidied a class list.
    """
    student = await get_student(db, owner_id, student_id)
    if not student:
        return False
    await db.delete(student)
    await db.commit()
    return True


async def papers_count(db: AsyncSession, student_id: int) -> int:
    """How many papers point at this student — so the delete can say so."""
    return (await db.execute(
        select(func.count(TestPaper.paper_id))
        .where(TestPaper.student_id == student_id)
    )).scalar_one()


# ---------------------------------------------------------------------------
# Bulk import — how a 35-student section actually gets entered
# ---------------------------------------------------------------------------

async def bulk_create(
    db: AsyncSession,
    owner_id: int,
    rows: Iterable[dict],
    section: Optional[str] = None,
) -> dict:
    """Create many students, reporting EVERY row rather than stopping at one.

    PARTIAL SUCCESS IS THE POINT. A 35-row paste with one bad line must not
    throw away the other 34 and must not silently skip the bad one: the teacher
    needs to know which line to fix. Every row comes back in `created`,
    `skipped` or `failed`, each carrying its 1-based line number.

    TWO KINDS OF DUPLICATE, and they are different mistakes:
      - against the DATABASE: the student is already on the roster. Skipped,
        not an error - re-pasting a list to add three new names is a normal
        thing to do, and it should add the three and leave the rest alone.
      - against the SAME PASTE: the list itself names one number twice. That is
        a mistake in the list, so it is reported as failed with both line
        numbers, because silently keeping the first would hide it.

    One commit at the end: 35 commits is 35 round trips, and a paste should be
    all-or-nothing against a crash rather than half-applied.
    """
    created: list[Student] = []
    skipped: list[dict] = []
    failed: list[dict] = []
    seen: dict[str, int] = {}          # normalised number -> line it first appeared on
    sect_default = " ".join((section or "").split()) or None

    materialised = list(rows)
    if len(materialised) > MAX_BULK_ROWS:
        return {
            "success": False,
            "reason": (
                f"That list has {len(materialised)} rows; the most that can be "
                f"added at once is {MAX_BULK_ROWS}. Split it and paste again."
            ),
        }

    for line, raw in enumerate(materialised, start=1):
        try:
            number = check_number(str(raw.get("student_number", "")))
            last = check_name_part(str(raw.get("last_name", "")), "Last name")
            first = check_name_part(str(raw.get("first_name", "")), "First name")
        except ValueError as e:
            failed.append({"line": line, "student_number":
                           tidy_number(str(raw.get("student_number", ""))),
                           "reason": str(e)})
            continue

        key = norm_number(number)
        if key in seen:
            failed.append({
                "line": line, "student_number": number,
                "reason": (f"Student number {number} is on this list twice "
                           f"(also line {seen[key]}). Nothing was added for it."),
            })
            continue
        seen[key] = line

        existing = await by_number(db, owner_id, number)
        if existing:
            skipped.append({
                "line": line, "student_number": number,
                "reason": (f"Already on the roster as "
                           f"{existing.last_name}, {existing.first_name}."),
            })
            continue

        row_section = " ".join(str(raw.get("section", "") or "").split()) or sect_default
        student = Student(
            created_by=owner_id, student_number=number,
            last_name=last, first_name=first, section=row_section,
        )
        db.add(student)
        created.append(student)

    if created:
        await db.commit()
        for s in created:
            await db.refresh(s)

    return {
        "success": True,
        "created": created,
        "skipped": skipped,
        "failed": failed,
        "message": _bulk_message(len(created), len(skipped), len(failed)),
    }


def _bulk_message(created: int, skipped: int, failed: int) -> str:
    if created == 0 and skipped == 0 and failed == 0:
        return "That list was empty — nothing to add."
    bits = [f"{created} student(s) added" if created != 1 else "1 student added"]
    if skipped:
        bits.append(f"{skipped} already on the roster")
    if failed:
        bits.append(f"{failed} line(s) could not be read")
    return " · ".join(bits) + "."