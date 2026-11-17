#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
Stage 2a — the admin's global roster, and the teacher's lookup.   2026-11-17

    python apply_2026-11-17_admin_students.py --dry-run \
        backend/app/services/student_service.py \
        backend/app/api/routes/students.py \
        backend/app/api/routes/__init__.py

backend/app/api/routes/admin_students.py must be in place first - that file is
NEW and this one only wires it in.

RUN apply_2026-11-17_global_students_orm.py FIRST. This patch assumes
by_number() is already global; applied before it, the lookup endpoint would
answer "no such student" for a number the admin holds.

ADDITIVE ON PURPOSE. Not one existing endpoint changes behaviour, so the
teacher's roster screen keeps working exactly as it does today while stage 3
is built. What this adds:

  student_service.get_student(db, None, id)   owner_id may now be None,
                                              meaning "any" - the admin path
  student_service.all_students(db, q)         every student, ascending by
                                              lower(trim(student_number))
  GET /students/lookup?number=...             the teacher's auto-fill. READ
                                              ONLY, and it is the one place a
                                              teacher sees a student another
                                              teacher entered.
  the two new routers registered

WHY owner_id=None RATHER THAN A SECOND SET OF FUNCTIONS. update_student and
delete_student re-validate every field and raise the same DuplicateStudent;
admin copies of them would be a second place for those rules to drift, which
is what schemas/_text.py exists to prevent. One optional parameter, one
behaviour, two callers.
"""

import shutil
import sys
from pathlib import Path

STAMP = "2026-11-17"

SERVICE = [
    (
        'async def get_student(\n'
        '    db: AsyncSession, owner_id: int, student_id: int,\n'
        ') -> Optional[Student]:\n'
        '    """This teacher\'s student by row id, or None — the 404 shape.',

        'async def get_student(\n'
        '    db: AsyncSession, owner_id: Optional[int], student_id: int,\n'
        ') -> Optional[Student]:\n'
        '    """A student by row id, or None — the 404 shape.\n'
        '\n'
        '    CHANGED 2026-11-17: `owner_id=None` means ANY student, which is the\n'
        '    administrator path (routes/admin_students.py). A teacher still passes\n'
        '    their own id and still sees only their own rows, so no existing\n'
        '    caller changes behaviour.\n'
        '\n'
        '    One function rather than an admin copy, because update_student and\n'
        '    delete_student re-validate every field and raise the same\n'
        '    DuplicateStudent - a second copy is a second place for those rules to\n'
        '    drift, which is the whole reason schemas/_text.py exists.',
    ),
    (
        '    return (await db.execute(\n'
        '        select(Student).where(\n'
        '            Student.student_id == student_id,\n'
        '            Student.created_by == owner_id,\n'
        '        )\n'
        '    )).scalars().first()',

        '    stmt = select(Student).where(Student.student_id == student_id)\n'
        '    if owner_id is not None:\n'
        '        stmt = stmt.where(Student.created_by == owner_id)\n'
        '    return (await db.execute(stmt)).scalars().first()',
    ),
    (
        'async def create_student(\n'
        '    db: AsyncSession,\n'
        '    owner_id: int,',

        'async def all_students(\n'
        '    db: AsyncSession,\n'
        '    query: Optional[str] = None,\n'
        ') -> list[Student]:\n'
        '    """EVERY student, ascending by number. The administrator\'s view.\n'
        '\n'
        '    NEW 2026-11-17 - Recommendations page 6: "This list reflects the\n'
        '    Student Numbers for All students, arranged in ascending order."\n'
        '\n'
        '    Ordered by lower(trim(student_number)) and NOT by the raw column,\n'
        '    because that is exactly what ux_students_number indexes. The order an\n'
        '    administrator reads and the order the uniqueness rule uses are then\n'
        '    the same order, so "2021-A123" and "2021-a123" sit next to each other\n'
        '    rather than in two different halves of the list - which is where a\n'
        '    near-duplicate is noticed.\n'
        '\n'
        '    No `section` filter. The admin screen is the whole table; narrowing\n'
        '    it is the teacher\'s class list, which is a different screen.\n'
        '    """\n'
        '    stmt = select(Student)\n'
        '    if query:\n'
        '        q = f"%{\' \'.join(query.split()).lower()}%"\n'
        '        stmt = stmt.where(\n'
        '            func.lower(Student.last_name).like(q)\n'
        '            | func.lower(Student.first_name).like(q)\n'
        '            | func.lower(func.coalesce(Student.middle_name, "")).like(q)\n'
        '            | func.lower(Student.student_number).like(q)\n'
        '        )\n'
        '    stmt = stmt.order_by(\n'
        '        func.lower(func.trim(Student.student_number)),\n'
        '        Student.student_id,\n'
        '    )\n'
        '    return list((await db.execute(stmt)).scalars().all())\n'
        '\n'
        '\n'
        'async def create_student(\n'
        '    db: AsyncSession,\n'
        '    owner_id: int,',
    ),
    (
        'async def update_student(\n'
        '    db: AsyncSession,\n'
        '    owner_id: int,\n'
        '    student_id: int,',

        'async def update_student(\n'
        '    db: AsyncSession,\n'
        '    owner_id: Optional[int],      # None = any student (administrator)\n'
        '    student_id: int,',
    ),
    (
        'async def delete_student(db: AsyncSession, owner_id: int, student_id: int) -> bool:',

        'async def delete_student(db: AsyncSession, owner_id: Optional[int],\n'
        '                         student_id: int) -> bool:',
    ),
]

ROUTES = [
    (
        '@router.post("/bulk", response_model=StudentBulkResponse)',

        '@router.get("/lookup", response_model=StudentResponse)\n'
        'async def lookup_student(\n'
        '    number: str = Query(..., description="The student number to look up."),\n'
        '    uid: int = Depends(_uid),\n'
        '    db: AsyncSession = Depends(get_db),\n'
        '):\n'
        '    """NEW 2026-11-17 - Recommendations page 6, the teacher\'s auto-fill.\n'
        '\n'
        '        "Once you input the Student number, it will auto-populate the\n'
        '         Student Name Info (Last Name, First Name and Middle Name) and\n'
        '         Section Name from GLOBAL Database input of ADMIN ID."\n'
        '\n'
        '    READ ONLY, and deliberately the ONLY place a teacher sees a student\n'
        '    somebody else entered. It answers one question about one number the\n'
        '    teacher already typed; it cannot list, search or enumerate the table.\n'
        '    A teacher who guesses a number learns that the number exists and whose\n'
        '    it is - which is the same thing the duplicate message on Add Student\n'
        '    has told them since 2026-11-12, and is the point of a shared roster.\n'
        '\n'
        '    404 when there is no such student, NOT an empty 200: the screen has to\n'
        '    tell the difference between "nobody has that number" and "here is who\n'
        '    does", and a 200 with empty fields would quietly blank the boxes the\n'
        '    teacher had already filled in.\n'
        '\n'
        '    DECLARED BEFORE /{student_id} like the other literal paths - see the\n'
        '    note above.\n'
        '    """\n'
        '    del uid          # any signed-in user may look a number up\n'
        '    student = await student_service.by_number(db, None, number)\n'
        '    if not student:\n'
        '        raise HTTPException(\n'
        '            status_code=404,\n'
        '            detail=f"No student with number {number.strip()} has been added yet.")\n'
        '    return student\n'
        '\n'
        '\n'
        '@router.post("/bulk", response_model=StudentBulkResponse)',
    ),
]

INIT = [
    (
        'from app.api.routes.admin_reference import router as admin_reference_router    # NEW 2026-11-14',

        'from app.api.routes.admin_reference import router as admin_reference_router    # NEW 2026-11-14\n'
        'from app.api.routes.admin_students import router as admin_students_router    # NEW 2026-11-17',
    ),
    (
        'router.include_router(admin_reference_router)  # NEW 2026-11-14 — maintaining them, administrators only',

        'router.include_router(admin_reference_router)  # NEW 2026-11-14 — maintaining them, administrators only\n'
        'router.include_router(admin_students_router)   # NEW 2026-11-17 — the global student table, administrators only',
    ),
]

FILES = {
    "student_service.py": ("async def get_student(", SERVICE, "async def all_students("),
    "students.py":        ('@router.get("/sections"', ROUTES, '@router.get("/lookup"'),
    "__init__.py":        ("admin_reference_router", INIT, "admin_students_router"),
}


def selfcheck(name, text):
    if name == "student_service.py":
        if "Student.created_by == owner_id,\n        )\n    )).scalars().first()" in text:
            return "get_student still filters unconditionally."
        if text.count("async def all_students(") != 1:
            return "all_students did not land exactly once."
    if name == "students.py":
        if text.count('@router.get("/lookup"') != 1:
            return "the lookup route did not land exactly once."
        # it MUST be declared before the parameterised path
        if text.index('@router.get("/lookup"') > text.index('@router.get("/{student_id}"'):
            return "the lookup route is declared after /{student_id}."
    if name == "__init__.py":
        if text.count("admin_students_router") != 2:
            return "expected the new router imported once and included once."
    for o, c in (("(", ")"), ("{", "}"), ("[", "]")):
        if text.count(o) != text.count(c):
            return f"unbalanced {o}{c} ({text.count(o)} vs {text.count(c)})."
    return None


def patch(path: Path, dry: bool) -> int:
    name = path.name
    if name not in FILES:
        print(f"  REFUSED  {path}\n           not one of: {', '.join(FILES)}")
        return 2
    fingerprint, rules, marker = FILES[name]

    raw = path.read_bytes()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        print(f"  REFUSED  {path}\n           not UTF-8")
        return 2
    crlf = b"\r\n" in raw
    work = text.replace("\r\n", "\n") if crlf else text

    if fingerprint not in work:
        print(f"  REFUSED  {path}\n           no {fingerprint!r} - this is not the "
              f"file this patch was written against.\n           Nothing was written.")
        return 2
    if marker in work:
        print(f"  ok       {path}\n           already carries the {STAMP} stage-2a "
              f"change - nothing written.")
        return 1
    if name == "student_service.py" and "global as of 2026-11-17" not in work:
        print(f"  REFUSED  {path}")
        print("           by_number() is still per-owner. Run")
        print("           apply_2026-11-17_global_students_orm.py first, or the")
        print("           lookup will not find a number the admin holds.")
        print("           Nothing was written.")
        return 2

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
        backup = path.with_suffix(path.suffix + f".bak-{STAMP}-adminstudents")
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
    print(f"LearnLens admin students {STAMP}"
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
        print("\nadmin_students.py must be at backend/app/api/routes/ first.")
        print("Then:  docker compose up -d --build backend\n")
    return 1 if 2 in codes else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
