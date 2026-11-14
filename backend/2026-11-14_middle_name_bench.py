"""2026-11-14 — the middle name, measured against a real PostgreSQL 16.15."""
import asyncio, os, sys
SOCK = sys.argv[1]
os.environ["TEST_DSN"] = f"postgresql+asyncpg://postgres@/ll?host={SOCK}&port=55433"
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.pool import NullPool
from app.models import models as _m          # resolve FKs
from app.schemas._text import (compose_student_name, check_middle_name,
                               middle_initial)
from app.schemas.student import StudentCreate
from app.services import student_service as ss
from app.services import paper_service as ps
from app.services import batch_paper_service as bps

ok = fail = 0
def check(label, cond, detail=""):
    global ok, fail
    if cond: ok += 1;  print(f"  ok   {label}" + (f"   {detail}" if detail else ""))
    else:    fail += 1; print(f"  FAIL {label}   {detail}")

async def main():
    engine = create_async_engine(os.environ["TEST_DSN"], poolclass=NullPool)
    S = async_sessionmaker(engine, expire_on_commit=False)

    # SELF-CLEANING. The first version did not do this and its SECOND run died
    # on DuplicateStudent - a harness that passes once and then fails for its
    # own reasons is the 2026-10-12 "RUNS DIFFER while measuring nothing"
    # shape. Reproducibility is the whole point of shipping it.
    from sqlalchemy import text as _sql
    async with engine.begin() as c:
        await c.execute(_sql("TRUNCATE public.test_papers, public.students "
                             "RESTART IDENTITY CASCADE"))

    print("\n-- composing a name --")
    check("two parts are UNCHANGED",
          compose_student_name("Alcantara", "Ben") == "Alcantara, Ben",
          compose_student_name("Alcantara", "Ben"))
    check("a single letter gains a period",
          compose_student_name("Alcantara", "Ben", "R") == "Alcantara, Ben R.",
          compose_student_name("Alcantara", "Ben", "R"))
    check("a letter WITH a period is left alone",
          compose_student_name("Alcantara", "Ben", "R.") == "Alcantara, Ben R.")
    check("a full middle name is not abbreviated",
          compose_student_name("Alcantara", "Ben", "Reyes") == "Alcantara, Ben Reyes",
          compose_student_name("Alcantara", "Ben", "Reyes"))
    check("a two-word middle name survives",
          compose_student_name("Lim", "Ana", "Dela Cruz") == "Lim, Ana Dela Cruz")
    check("blank middle composes exactly as before",
          compose_student_name("Alcantara", "Ben", "   ") == "Alcantara, Ben")
    check("middle_initial('') is ''", middle_initial("") == "")

    print("\n-- the middle name rule --")
    check("blank -> None", check_middle_name("  ") is None)
    check("'R' -> 'R'", check_middle_name("R") == "R")
    check("'Dela Cruz' -> kept", check_middle_name(" Dela  Cruz ") == "Dela Cruz")
    for bad, why in [("R2", "a digit"), ("R, S", "a comma"), ("@", "a symbol")]:
        try:
            check_middle_name(bad); check(f"{why} refused", False, "accepted")
        except ValueError as e:
            check(f"{why} refused", True, str(e)[:52])
    try:
        check_middle_name("x" * 101); check("101 chars refused", False, "accepted")
    except ValueError as e:
        check("101 chars refused", "at most 100" in str(e), str(e)[:52])

    print("\n-- the schema stays backward compatible --")
    c = StudentCreate(student_number="1", last_name="Cruz", first_name="Ana")
    check("StudentCreate without middle_name still validates", c.middle_name is None)
    c2 = StudentCreate(student_number="1", last_name="Cruz", first_name="Ana", middle_name=" r ")
    check("and tidies one when given", c2.middle_name == "r", str(c2.middle_name))

    print("\n-- the roster --")
    async with S() as db:
        a = await ss.create_student(db, 1, "2021-00123", "Cruz", "Ana",
                                    middle_name="R", section="BSCS 3A")
        check("created with a middle name", a.middle_name == "R", str(a.middle_name))
        b = await ss.create_student(db, 1, "2021-00124", "Cruz", "Ana",
                                    section="BSCS 3A")
        check("and one without", b.middle_name is None, str(b.middle_name))
    async with S() as db:
        up = await ss.update_student(db, 1, a.student_id, "2021-00123", "Cruz", "Ana",
                                     middle_name="Reyes", section="BSCS 3A")
        check("update changes it", up.middle_name == "Reyes", str(up.middle_name))
    async with S() as db:
        hits = await ss.list_students(db, 1, query="reyes")
        check("search finds it by middle name", len(hits) == 1 and hits[0].student_id == a.student_id,
              f"{len(hits)} hit(s)")
        allhits = await ss.list_students(db, 1, query="cruz")
        check("AND a NULL middle name is not dropped from search",
              len(allhits) == 2, f"{len(allhits)} of 2")
    async with S() as db:
        res = await ss.bulk_create(db, 1, [
            {"student_number": "2021-00200", "last_name": "Santos",
             "first_name": "Jose", "middle_name": "P"},
            {"student_number": "2021-00201", "last_name": "Santos",
             "first_name": "Jose"},
        ], section="BSCS 3A")
        check("bulk takes a middle name column", len(res["created"]) == 2,
              res["message"])
        check("  first row kept it", res["created"][0].middle_name == "P")
        check("  second row is None", res["created"][1].middle_name is None)

    print("\n-- THE DUPLICATE ADVICE IS NOW TRUE --")
    async with S() as db:
        p1 = await ps.create_paper(db, 1, 1, last_name="Cruz", first_name="Ana",
                                   middle_name="R")
        check("paper 1: Cruz, Ana R.", p1.student_name == "Cruz, Ana R.", p1.student_name)
    async with S() as db:
        try:
            p2 = await ps.create_paper(db, 1, 1, last_name="Cruz", first_name="Ana",
                                       middle_name="S")
            check("a DIFFERENT middle initial is allowed",
                  p2.student_name == "Cruz, Ana S.", p2.student_name)
        except ps.DuplicatePaper as d:
            check("a DIFFERENT middle initial is allowed", False, d.message[:70])
    async with S() as db:
        try:
            await ps.create_paper(db, 1, 1, last_name="Cruz", first_name="Ana",
                                  middle_name="R")
            check("the SAME middle initial is still refused", False, "accepted")
        except ps.DuplicatePaper as d:
            check("the SAME middle initial is still refused", True, d.message[:58])
    async with S() as db:
        p3 = await ps.create_paper(db, 1, 1, last_name="Reyes", first_name="Mia")
        check("no middle name at all still works", p3.student_name == "Reyes, Mia",
              p3.student_name)
    async with S() as db:
        try:
            await ps.create_paper(db, 1, 1, last_name="Reyes", first_name="Mia")
            check("  and is still its own duplicate", False, "accepted")
        except ps.DuplicatePaper:
            check("  and is still its own duplicate", True)

    print("\n-- rename, and the roster path --")
    async with S() as db:
        r = await ps.rename_paper(db, p3.paper_id, 1, 1, last_name="Reyes",
                                  first_name="Mia", middle_name="L")
        check("rename adds a middle name", r.student_name == "Reyes, Mia L.", r.student_name)
        check("  and stores the part", r.middle_name == "L", str(r.middle_name))
    async with S() as db:
        st = await ss.by_number(db, 1, "2021-00200")
        bp = await bps.create_for_student(db, 1, 1, st)
        check("by-student copies the roster's middle name",
              bp.middle_name == "P" and bp.student_name == "Santos, Jose P.",
              bp.student_name)

    await engine.dispose()
    print(f"\n{ok} ok, {fail} FAIL")
    return 1 if fail else 0

sys.exit(asyncio.run(main()))
