#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
measure/2026-11-27_exam_totals.py                                 2026-11-27
============================================================================

Ms. Melanie, Recommendations page 23 requirement 2:

    "In the Passing mark row, please correct this 9 of 15 Points ... Should
     be '18 of 30 Points'"
    "Please correct 15 ... in 'Score (out of 15)' and '30/15' ...
     Should be '30'"

THAT WAS NOT A BUILDER BUG. measure/2026-11-26_analytics_workbook.py was
green throughout, and still is, because its fixture passes total_points = 30
EXPLICITLY. The route handed the builder `exam.total_points`, which is 0 or
absent on her exams, so the builder fell back to the item count - 15 - and
every mark in the file was measured against the wrong denominator. A bench
whose fixture supplies the value by hand can never see that.

SO THIS BENCH RUNS THE ROUTE'S OWN SQL. It does not re-type the query: it
extracts the expression from backend/app/api/routes/analytics_export.py and
evaluates it against a real database, with a throwaway table of the same
shape standing in for the AnswerKey model.

    python measure/2026-11-27_exam_totals.py

WHY A STAND-IN MODEL IS HONEST HERE, when a stand-in usually is not. The
thing being measured is the ARITHMETIC - that COALESCE(points, 1) treats an
unpriced key as one mark, that SUM over no rows is 0 rather than NULL, and
that another exam's keys are excluded. Those are properties of the
expression, not of the model, and the expression under test is the real one,
character for character. What this CANNOT prove is that the real AnswerKey
has an `exam_id` and a `points` column - so that is asserted against
exams.py, which writes both, and the endpoint still has to be run once
against the real database.

sqlite via SQLAlchemy's built-in driver: no new dependency, nothing to
install on a laptop, and the COALESCE/SUM semantics being measured are
ANSI rather than PostgreSQL-specific.
"""
import re
import sys
from pathlib import Path

ROOT  = Path(__file__).resolve().parent.parent
ROUTE = ROOT / "backend/app/api/routes/analytics_export.py"
EXAMS = ROOT / "backend/app/api/routes/exams.py"

try:
    from sqlalchemy import (Column, Integer, String, create_engine, func,
                            insert, select)
    from sqlalchemy.orm import declarative_base
except ImportError:                                          # pragma: no cover
    print("  MISSING: sqlalchemy. Activate the backend venv and run again.")
    sys.exit(2)

passed = 0
failed = []


def check(label, cond, detail=""):
    global passed
    if cond:
        passed += 1
    else:
        failed.append(f"{label}: {detail}" if detail else label)


def bail(why):
    """A guard holding the fixture together gets a named abort, not a
    traceback. If the expression cannot be found there is nothing below to
    measure, and a stack trace would read as the bench being broken."""
    print(f"\n  CANNOT MEASURE: {why}")
    print("  Nothing below was checked.")
    sys.exit(2)


for f in (ROUTE,):
    if not f.is_file():
        bail(f"{f} is not in this tree")

src = ROUTE.read_text(encoding="utf-8").replace("\r\n", "\n")

# ── the route's own expression, lifted out ────────────────────────────────
m = re.search(r"totals = \(await db\.execute\(\n(.*?)\)\)\.one\(\)",
              src, re.S)
if not m:
    bail("analytics_export.py no longer has a `totals = (await db.execute(`\n"
     "  ... `)).one()` statement, so its query could not be extracted.\n"
     "  If the query moved, point this bench at its new home rather than\n"
     "  re-typing it here - a copy would pass while the route was wrong.")
# Wrapped in parentheses before evaluating: the statement is indented inside
# the route's function and spans four lines, and inside brackets Python stops
# caring about either. The text itself is untouched.
expr_src = "(" + m.group(1).strip() + ")"

Base = declarative_base()


class AnswerKey(Base):
    """The two columns the expression touches, and nothing else.

    exams.py writes both: `.values(points=DEFAULT_POINTS)` and
    `.values(points=band.points)`, filtered on AnswerKey.question_number -
    and the count query this bench extends has been reading
    AnswerKey.exam_id in production since 2026-11-26.
    """
    __tablename__ = "answer_keys"
    answer_key_id = Column(Integer, primary_key=True)
    exam_id = Column(Integer, nullable=False)
    question_number = Column(Integer)
    points = Column(Integer)                 # NULLABLE - hence `?? 1`
    correct_answer = Column(String)


engine = create_engine("sqlite://")
Base.metadata.create_all(engine)


def totals_for(exam_id, keys):
    """Run THE ROUTE'S expression over `keys`, in a clean table."""
    with engine.begin() as cx:
        cx.execute(AnswerKey.__table__.delete())
        if keys:
            cx.execute(insert(AnswerKey), keys)
        try:
            stmt = eval(expr_src, {"select": select, "func": func,
                                   "AnswerKey": AnswerKey},
                        {"exam_id": exam_id})
        except Exception as e:                               # noqa: BLE001
            bail(f"the extracted expression did not evaluate: "
                 f"{type(e).__name__}: {e}")
        row = cx.execute(stmt).one()
    return int(row[0] or 0), int(row[1] or 0)


def keys(exam_id, specs):
    return [{"exam_id": exam_id, "question_number": i + 1, "points": p}
            for i, p in enumerate(specs)]


# ── 1. HER EXAM. 15 items worth 2 marks each ──────────────────────────────
items, points = totals_for(7, keys(7, [2] * 15))
check("15 items worth 2 marks each are 15 items", items == 15, str(items))
check("  ...and 30 points, which is the figure she asked for",
      points == 30, f"{points} - the file said 15, and so said '9 of 15'")

# ── 2. an unpriced key is worth ONE mark, not nothing ─────────────────────
items, points = totals_for(7, keys(7, [None] * 15))
check("an exam whose keys have no points is still 15 items", items == 15)
check("  ...and 15 points - COALESCE(points, 1) is the screen's `?? 1`",
      points == 15, str(points))

# ── 3. mixed bands, which is what the points_range dropdowns produce ──────
items, points = totals_for(7, keys(7, [1] * 10 + [5] * 5))
check("mixed point bands sum rather than count", (items, points) == (15, 35),
      f"{items} items, {points} points - 10x1 + 5x5")

items, points = totals_for(7, keys(7, [1] * 10 + [None] * 2 + [5] * 3))
check("  ...with an unpriced key in the middle",
      (items, points) == (15, 27), f"{items} items, {points} points")

# ── 4. no keys at all: 0, NOT None ────────────────────────────────────────
# SUM over no rows is NULL in SQL. Without the outer COALESCE this returns
# None, int(None or 0) saves it here - but a bare int(None) would be a 500
# on an exam whose answer key has not been generated yet.
items, points = totals_for(7, [])
check("an exam with no answer keys is 0 items and 0 points",
      (items, points) == (0, 0), f"{items}, {points}")
with engine.begin() as cx:
    cx.execute(AnswerKey.__table__.delete())
    raw = cx.execute(eval(expr_src, {"select": select, "func": func,
                                     "AnswerKey": AnswerKey},
                          {"exam_id": 7})).one()
check("  ...and the SUM is 0 rather than NULL, before any Python coercion",
      raw[1] == 0, f"{raw[1]!r} - SUM over no rows is NULL without COALESCE")

# ── 5. another exam's keys are not counted ────────────────────────────────
mixed = keys(7, [2] * 15) + keys(9, [3] * 20)
items, points = totals_for(7, mixed)
check("another exam's answer keys are excluded", (items, points) == (15, 30),
      f"{items} items, {points} points with exam 9 in the table too")
items9, points9 = totals_for(9, mixed)
check("  ...and that exam gets its own figures",
      (items9, points9) == (20, 60), f"{items9}, {points9}")

# ── 6. the route must PREFER the keys over the column ─────────────────────
# The arithmetic above is right and could still be thrown away one line
# later, which is exactly what the bug was.
check("the sum is what reaches the builder",
      re.search(r'"total_points":\s*key_points\b', src) is not None,
      "total_points must start from the answer keys, not exams.total_points")
check("  ...and exams.total_points is at most a fallback behind it",
      re.search(r'"total_points":\s*int\(getattr\(exam, "total_points"',
                src) is None,
      "this is the line that produced '9 of 15 Points'")
check("the item count still comes from the same read",
      re.search(r"total_items\s*=\s*int\(totals\[0\]", src) is not None,
      "two queries for one fact is two things to keep in step")

# ── 7. the columns the stand-in assumes are real ──────────────────────────
if EXAMS.is_file():
    exams_src = EXAMS.read_text(encoding="utf-8")
    check("AnswerKey.points is a real column, written by exams.py",
          ".values(points=" in exams_src,
          "the stand-in table would otherwise be measuring nothing")
    check("  ...and AnswerKey rows are filtered by exam elsewhere in the route",
          "AnswerKey.exam_id == exam_id" in src)
else:
    failed.append("exams.py is not in this tree, so the two checks that the "
                  "stand-in's columns are real could not run")

print()
print(f"  {passed} passed, {len(failed)} failed")
if failed:
    print()
    for f in failed:
        print("  FAIL  " + f)
print()
print("  the route's own SQL, run against a real database.")
sys.exit(1 if failed else 0)
