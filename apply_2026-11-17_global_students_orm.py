#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
Make the ORM agree with the migrated database.                    2026-11-17

    python apply_2026-11-17_global_students_orm.py --dry-run \
        backend/app/models/models.py \
        backend/app/services/student_service.py

RUN THIS AS SOON AS 2026-11-17_global_students.sql HAS BEEN APPLIED.
Until it does, two things are wrong, and the first is a 500 a teacher can
reach today:

  1. by_number() still filters `Student.created_by == owner_id`, but
     student_number is now UNIQUE GLOBALLY. A teacher adding a number the
     ADMIN already holds gets no DuplicateStudent - the check cannot see the
     admin's row - so the insert goes through to the database and dies on
     ux_students_number as an unhandled IntegrityError. Before the migration
     that same insert was legal. The duplicate check has to be global because
     the constraint is.

  2. User.students carries cascade="all, delete", and
     Student.created_by is nullable=False with ondelete="CASCADE".
     The migration made the FK ON DELETE SET NULL precisely so that deleting
     one teacher cannot delete students every other teacher depends on - but
     the ORM would still do it in Python on any delete that goes through
     SQLAlchemy, and would still refuse to write the NULL the database now
     allows.

FIVE EDITS:

  models.py          the index pair, to match what the database now has
  models.py          created_by: nullable, ondelete SET NULL
  models.py          User.students: cascade removed
  student_service.py by_number(): global, not per-owner
  student_service.py DuplicateStudent: its docstring said "this teacher"

WHAT THIS DOES NOT DO. It does not change who may write. Teachers can still
create and edit students exactly as before; the admin-only gate arrives with
the class-list endpoints. This patch only stops the ORM contradicting the
schema.
"""

import shutil
import sys
from pathlib import Path

STAMP = "2026-11-17"
MARKER = "ux_students_number"

MODELS = [
    (
        '        Index("ux_students_owner_number", "created_by",\n'
        '              text("lower(trim(student_number))"), unique=True),\n'
        '        Index("ix_students_owner_section", "created_by", "section"),',

        '        # CHANGED 2026-11-17 - Recommendations page 6, and this reverses\n'
        '        # the note above it rather than contradicting it quietly.\n'
        '        #\n'
        '        # That note said: "UNIQUE PER TEACHER, not globally: two teachers\n'
        '        # at one school may hold the same student, and a global unique\n'
        '        # makes the second roster impossible to fill." That was right for\n'
        '        # a per-teacher roster. Page 6 replaces the per-teacher roster\n'
        '        # with ONE table the admin maintains - "This the GLOBAL info of\n'
        '        # Student Info" - so the second roster is no longer filled by\n'
        '        # re-entering the student; it is filled by adding the existing\n'
        '        # student to a class list.\n'
        '        #\n'
        '        # Matches migrations/2026-11-17_global_students.sql exactly. An\n'
        '        # index the model and the database disagree about is a phantom\n'
        '        # drift in every future schema comparison.\n'
        '        Index("ux_students_number",\n'
        '              text("lower(trim(student_number))"), unique=True),\n'
        '        Index("ix_students_section", "section"),',
    ),
    (
        '    created_by     = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)',

        '    # CHANGED 2026-11-17. created_by stops meaning OWNER and starts\n'
        '    # meaning "who typed it in", so it is nullable and must not cascade.\n'
        '    #\n'
        '    # With a global roster, ON DELETE CASCADE here would mean that\n'
        '    # removing one teacher\'s account deletes students every other\n'
        '    # teacher depends on - and test_papers.student_id would go SET NULL\n'
        '    # across the system, silently unlinking graded papers from the people\n'
        '    # who sat them.\n'
        '    created_by     = Column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)',
    ),
    (
        '    students        = relationship("Student", back_populates="creator", cascade="all, delete")   # NEW 2026-11-12',

        '    # CHANGED 2026-11-17: NO cascade. The database FK is ON DELETE SET\n'
        '    # NULL as of migrations/2026-11-17_global_students.sql; leaving\n'
        '    # cascade="all, delete" here would have SQLAlchemy delete the rows in\n'
        '    # Python anyway, re-creating in the ORM exactly the hazard the\n'
        '    # migration removed from the schema.\n'
        '    students        = relationship("Student", back_populates="creator")   # NEW 2026-11-12',
    ),
]

SERVICE = [
    (
        'async def by_number(\n'
        '    db: AsyncSession, owner_id: int, student_number: str,\n'
        ') -> Optional[Student]:\n'
        '    """This teacher\'s student with that number, or None.',

        'async def by_number(\n'
        '    db: AsyncSession, owner_id: int, student_number: str,\n'
        ') -> Optional[Student]:\n'
        '    """THE student with that number, or None. GLOBAL as of 2026-11-17.\n'
        '\n'
        '    `owner_id` is KEPT in the signature and deliberately unused, so that\n'
        '    every call site stays valid and this change is one function rather\n'
        '    than nine. It is not a leftover.\n'
        '\n'
        '    WHY IT HAD TO STOP FILTERING. student_number is UNIQUE GLOBALLY as of\n'
        '    migrations/2026-11-17_global_students.sql. A per-owner lookup cannot\n'
        '    see a number the admin holds, so create_student found no duplicate,\n'
        '    inserted, and died on ux_students_number as an unhandled\n'
        '    IntegrityError - a 500 where the teacher should have been told who\n'
        '    already has that number. A duplicate check must be exactly as wide as\n'
        '    the constraint it is reporting on.',
    ),
    (
        '    key = norm_number(student_number)\n'
        '    if not key:\n'
        '        return None\n'
        '    return (await db.execute(\n'
        '        select(Student).where(\n'
        '            Student.created_by == owner_id,\n'
        '            func.lower(func.trim(Student.student_number)) == key,\n'
        '        ).limit(1)\n'
        '    )).scalars().first()',

        '    key = norm_number(student_number)\n'
        '    if not key:\n'
        '        return None\n'
        '    del owner_id          # global as of 2026-11-17 - see the docstring\n'
        '    return (await db.execute(\n'
        '        select(Student).where(\n'
        '            func.lower(func.trim(Student.student_number)) == key,\n'
        '        ).limit(1)\n'
        '    )).scalars().first()',
    ),
    (
        'class DuplicateStudent(Exception):\n'
        '    """This teacher already has a student with that number."""',

        'class DuplicateStudent(Exception):\n'
        '    """That student number is already on the roster.\n'
        '\n'
        '    CHANGED 2026-11-17: it used to say "this teacher already has". The\n'
        '    roster is global now, so the holder may be another teacher or the\n'
        '    administrator - and the message already names them, which is why it\n'
        '    needs no change.\n'
        '    """',
    ),
]

FILES = {
    "models.py": ("class Student(Base):", MODELS),
    "student_service.py": ("async def by_number(", SERVICE),
}


def selfcheck(name, text):
    if name == "models.py":
        if 'Index("ux_students_owner_number"' in text:
            return "the per-teacher unique index survived."
        if 'ondelete="CASCADE"), nullable=False)\n    # varchar' in text:
            return "created_by is still NOT NULL / CASCADE."
        if 'back_populates="creator", cascade="all, delete"' in text:
            return "User.students still cascades."
    if name == "student_service.py":
        if "            Student.created_by == owner_id,\n            func.lower" in text:
            return "by_number still filters by owner."
    for o, c in (("(", ")"), ("{", "}"), ("[", "]")):
        if text.count(o) != text.count(c):
            return f"unbalanced {o}{c} ({text.count(o)} vs {text.count(c)})."
    return None


def patch(path: Path, dry: bool) -> int:
    name = path.name
    if name not in FILES:
        print(f"  REFUSED  {path}\n           not one of: {', '.join(FILES)}")
        return 2
    fingerprint, rules = FILES[name]

    raw = path.read_bytes()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        print(f"  REFUSED  {path}\n           not UTF-8")
        return 2
    crlf = b"\r\n" in raw
    work = text.replace("\r\n", "\n") if crlf else text

    if fingerprint not in work:
        print(f"  REFUSED  {path}\n           no {fingerprint!r} - this is not "
              f"the file this patch was written against.\n           Nothing was written.")
        return 2

    if MARKER in work or "global as of 2026-11-17" in work:
        print(f"  ok       {path}\n           already carries the {STAMP} ORM "
              f"change - nothing written.")
        return 1

    for old, new in rules:
        n = work.count(old)
        if n != 1:
            print(f"  REFUSED  {path}")
            print(f"           an anchor was found {n} times, expected 1:")
            print(f"             {old.strip().splitlines()[0][:66]}")
            print("           Nothing was written.")
            return 2
        work = work.replace(old, new, 1)

    problem = selfcheck(name, work)
    if problem:
        print(f"  REFUSED  {path}\n           {problem}\n           Nothing was written.")
        return 2

    out = work.replace("\n", "\r\n") if crlf else work
    if dry:
        print(f"  WOULD PATCH  {path}   ({len(rules)} edits"
              f"{', CRLF preserved' if crlf else ''})")
    else:
        backup = path.with_suffix(path.suffix + f".bak-{STAMP}-orm")
        shutil.copy2(path, backup)
        path.write_bytes(out.encode("utf-8"))
        print(f"  patched  {path}   ({len(rules)} edits, backup: {backup.name})")
    return 0


def main(argv):
    dry = "--dry-run" in argv
    paths = [Path(a) for a in argv[1:] if not a.startswith("--")]
    if not paths:
        print(__doc__)
        return 2
    print(f"LearnLens global-students ORM {STAMP}"
          f"{'   (DRY RUN - nothing will be written)' if dry else ''}\n")
    codes = []
    for p in paths:
        if not p.exists():
            print(f"  REFUSED  {p}\n           no such file")
            codes.append(2)
            continue
        codes.append(patch(p, dry))
    print(f"\n  {codes.count(0)} patched, {codes.count(1)} already done, "
          f"{codes.count(2)} refused")
    if 0 in codes and not dry:
        print("\nBoth files must go together. Then rebuild the BACKEND:\n"
              "    docker compose up -d --build backend\n")
    return 1 if 2 in codes else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
