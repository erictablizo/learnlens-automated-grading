#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
measure/2026-11-26_analytics_workbook.py                          2026-11-26
============================================================================

Proves backend/app/services/analytics_export_service.py - Ms. Melanie,
Recommendations page 22 requirement 3, "all the contents of the Data
Analytics Page ... and not the existing Download Excel Info".

    python measure/2026-11-26_analytics_workbook.py

IT BUILDS A REAL WORKBOOK AND READS IT BACK with openpyxl, rather than
inspecting the builder's intentions. A spreadsheet is the deliverable; what
matters is what is in the cells.

THE PROPERTY THIS BENCH EXISTS FOR is that the file and the screen agree
about WHICH PAPERS each number covers. The page is careful about it and the
file is easy to get wrong:

    Students        every paper on the exam
    Mean / Median   only CHECKED, scored papers
    the four lists  only CHECKED, scored papers
    the Mode lines  every GRADED paper, checked or not

The fixture is built so those four denominators are all DIFFERENT - 5
papers, 4 checked, one of them unscored - so a builder that used the wrong
set cannot coincidentally agree.

AND THAT "Mode" IS THE ITEM ROW, not the most common score. requirement 9
redefined that cell, as_rows still returns the score mode, and a file that
took as_rows' value would put a different number under the same label as
the screen. The fixture's most-common score is deliberately not any item
number, so the two cannot be confused.

EXTENDED 2026-11-27 - page 23 requirement 1 added a fifth section, "Items
incorrectly answered by the majority of the class", after the four lists.
Section 7 below measures it, and the main fixture's item 13 is answered
wrongly by EXACTLY half the class so that a rule written `>=` cannot pass.

Real openpyxl, the real statistics.py, item_extremes.py and
majority_wrong.py, and the real builder loaded from the tree by path. export_service's three helpers come
from measure/excerpt/ - see its header.
"""
import importlib.util
import sys
import types
from io import BytesIO
from pathlib import Path

from openpyxl import load_workbook

# ── BYTECODE IS A MEASUREMENT HAZARD IN THIS BENCH ─────────────────────────
def _no_stale_bytecode():
    import shutil as _sh, sys as _s
    from pathlib import Path as _P
    _s.dont_write_bytecode = True
    _root = _P(__file__).resolve().parent.parent
    for _sub in ("backend", "measure", "fixtures"):
        _base = _root / _sub
        if _base.is_dir():
            for _d in _base.rglob("__pycache__"):
                _sh.rmtree(_d, ignore_errors=True)


_no_stale_bytecode()

ROOT    = Path(__file__).resolve().parent.parent
BUILDER = ROOT / "backend/app/services/analytics_export_service.py"
STATS   = ROOT / "backend/app/ml/statistics.py"
EXTREME = ROOT / "backend/app/ml/item_extremes.py"
MAJORITY = ROOT / "backend/app/ml/majority_wrong.py"
HELPERS = ROOT / "measure/excerpt/export_service_helpers.py"

passed = 0
failed = []
def check(label, cond, detail=""):
    global passed
    if cond: passed += 1
    else: failed.append(f"{label}: {detail}" if detail else label)


def load():
    for f in (BUILDER, STATS, EXTREME, MAJORITY, HELPERS):
        if not f.is_file():
            print(f"  MISSING: {f}")
            sys.exit(2)
    for name in ("app", "app.ml", "app.services"):
        sys.modules.setdefault(name, types.ModuleType(name))

    def by_path(mod_name, path):
        spec = importlib.util.spec_from_file_location(mod_name, path)
        m = importlib.util.module_from_spec(spec)
        sys.modules[mod_name] = m
        spec.loader.exec_module(m)
        return m

    by_path("app.ml.statistics", STATS)
    by_path("app.ml.item_extremes", EXTREME)
    by_path("app.ml.majority_wrong", MAJORITY)
    by_path("app.services.export_service", HELPERS)
    return by_path("app.services.analytics_export_service", BUILDER)


def main():
    svc = load()

    # ── the fixture, built so every denominator differs ──────────────────
    #   5 papers on the exam                    -> "Students: 5"
    #   4 checked, 3 of them scored             -> stats over 3
    #   items answered by 6                     -> Mode lines say "of 6"
    exam = {"exam_name": "Midterm 1", "subject": "Software Engineering",
            "schedule": "BSCS1B", "total_items": 15, "total_points": 30}
    papers = [
        {"last_name": "Cabrera",  "first_name": "Stephanie", "total_score": 30, "checked": True},
        {"last_name": "Dominquez", "first_name": "Jasmine",  "total_score": 18, "checked": True},
        {"last_name": "Aquino",   "first_name": "Patricia",  "total_score": 0,  "checked": True},
        # checked but NOT scored - must be excluded from every count below
        {"last_name": "Reyes",    "first_name": "Mia",       "total_score": None, "checked": True},
        # scored but NOT checked - its score is a floor, not a result
        {"last_name": "Santos",   "first_name": "Maria",     "total_score": 29, "checked": False},
    ]
    items = [
        {"question_number": 13, "answered": 6, "correct": 3, "wrong": 3},
        {"question_number": 15, "answered": 6, "correct": 6, "wrong": 0},
        {"question_number": 2,  "answered": 6, "correct": 5, "wrong": 1},
    ]

    # THE BUILDER MAY RAISE, and that is a result, not an accident to die
    # with. Measured 2026-11-26: a mutation that fed every paper to the
    # statistics hit `max()` on a None score and the bench exited on a
    # TypeError with no count printed - which reads as a broken harness.
    # A real exam with an unscored paper would do the same, so this is the
    # case most worth naming rather than crashing on.
    def safe_build(label, *a, **kw):
        """A raise is a RESULT, not a broken harness.

        Measured 2026-11-26 on the first fixture and again 2026-11-27 on the
        majority one: a mutation that dropped the filter reached
        wrong_percent with answered = 0, the builder raised, and the bench
        died with no count printed - which reads as the bench being broken
        rather than as the mutation being caught. Every build goes through
        here now, and a builder that raises fails the named check instead.
        """
        try:
            return svc.build_analytics_workbook(*a, **kw)
        except Exception as e:                               # noqa: BLE001
            check(label, False, f"it raised {type(e).__name__}: {e}")
            return None

    blob = safe_build("the builder produces a workbook",
                      exam, papers, items, passing_pct=60.0)
    check("it produces bytes", isinstance(blob, (bytes, bytearray)) and len(blob or b"") > 0,
          f"{type(blob).__name__}, {len(blob or b'')} bytes")
    if not blob:
        print()
        print(f"  {passed} passed, {len(failed)} failed")
        for f in failed:
            print("  FAIL  " + f)
        print()
        print("  nothing was read back, so no property below was measured.")
        sys.exit(1)

    wb = load_workbook(BytesIO(blob))
    check("one sheet, named for the page", wb.sheetnames == ["Data Analytics"],
          str(wb.sheetnames))
    ws = wb["Data Analytics"]

    # Everything as a flat list of (A, B, C, D) so the assertions read like
    # the page rather than like cell coordinates.
    grid = [[c.value for c in row] for row in ws.iter_rows(min_col=1, max_col=4)]
    colA = [r[0] for r in grid]

    def value_beside(label):
        for r in grid:
            if r[0] == label:
                return r[1]
        return None

    # ── 1. the header line ───────────────────────────────────────────────
    check("Exam is named", value_beside("Exam") == "Midterm 1", str(value_beside("Exam")))
    check("Subject is named", value_beside("Subject") == "Software Engineering")
    check("Section, not Schedule, is the label",
          "Section" in colA and "Schedule" not in colA, str(colA[:12]))
    check("  ...carrying exams.schedule's value",
          value_beside("Section") == "BSCS1B", str(value_beside("Section")))
    # STUDENTS COUNTS EVERY PAPER. Not the checked ones, not the scored ones.
    check("Students counts every paper on the exam", value_beside("Students") == 5,
          f"{value_beside('Students')} (the fixture has 5 papers, 3 of them scored)")
    check("Items is the item count", value_beside("Items") == 15)
    check("the passing mark is shown as a percentage AND a score",
          value_beside("Passing mark") == "60%  (18 of 30 points)",
          str(value_beside("Passing mark")))

    # ── 2. the yellow circle ─────────────────────────────────────────────
    check("the Statistics table has its header",
          "Statistics (Measure)" in colA, str(colA[:14]))
    # Mean over the THREE scored-and-checked papers: (30 + 18 + 0) / 3 = 16
    check("Mean is over the checked, scored papers only",
          value_beside("Mean") == "16",
          f"{value_beside('Mean')} (30+18+0)/3=16; 29 is unchecked, Reyes unscored")
    check("Median likewise", value_beside("Median") == "18",
          str(value_beside("Median")))

    mode = value_beside("Mode") or ""
    # RELABELLED 2026-11-28 - Ms. Melanie: the line said "missed" over a
    # number counting wrong. "Most wrong" / "Most right" now, and the old
    # words must not come back.
    check("Mode holds the ITEM lines, not the most common score",
          "Most wrong" in mode and "Most right" in mode, repr(mode))
    check("  ...in the relabelled wording, not the old one",
          "Most missed" not in mode and "Most correct" not in mode, repr(mode))
    check("  ...both of them, on separate lines", mode.count("\n") == 1, repr(mode))
    check("  ...naming the most missed item", "item 13" in mode, repr(mode))
    check("  ...and the most correct", "item 15" in mode, repr(mode))
    check("  ...counted over every graded paper, so 'of 6'",
          "of 6 wrong" in mode and "of 6 right" in mode, repr(mode))

    note = next((v for v in colA if isinstance(v, str)
                 and v.startswith("Over the ")), "")
    check("the caption explains the differing denominators",
          "3 checked papers" in note and "every graded paper" in note, repr(note[:90]))

    # ── 3. the four lists ────────────────────────────────────────────────
    headings = [v for v in colA if isinstance(v, str) and (
        v.endswith("got the highest score") or v.endswith(" passed")
        or v.endswith(" failed") or v.endswith(" scored zero"))]
    check("all four sections are present", len(headings) == 4, str(headings))
    check("  ...in the screen's order",
          headings == ["1 got the highest score", "2 passed", "1 failed",
                       "1 scored zero"],
          str(headings))

    subs = {}
    for r in grid:
        if isinstance(r[0], str) and r[0] in headings:
            subs[r[0]] = r[1]
    check("the highest score says what it was",
          subs.get("1 got the highest score") == "the highest anyone scored is 30 / 30",
          str(subs.get("1 got the highest score")))
    check("passed says the threshold",
          subs.get("2 passed") == "scored 18 / 30 or more", str(subs.get("2 passed")))
    check("failed says it too", subs.get("1 failed") == "scored below 18 / 30",
          str(subs.get("1 failed")))
    check("zero warns that it is counted twice",
          "failed" in (subs.get("1 scored zero") or ""),
          str(subs.get("1 scored zero")))

    names = [(r[1], r[2], r[3]) for r in grid
             if isinstance(r[0], int) and r[1] is not None]
    check("the unchecked paper is in no list",
          not any(n[0] == "Santos" for n in names), str(names))
    check("the unscored paper is in no list",
          not any(n[0] == "Reyes" for n in names), str(names))
    check("the top scorer is listed under the highest score",
          ("Cabrera", "Stephanie", 30) in names, str(names))
    check("scores are written as NUMBERS, not as '30 / 30'",
          all(isinstance(n[2], (int, float)) for n in names), str(names))
    check("  ...with the denominator in the column heading",
          any(r[3] == "Score (out of 30)" for r in grid),
          str([r[3] for r in grid if r[3]]))

    # ── 4. an empty group says so rather than looking truncated ──────────
    empty = safe_build("a one-paper exam still builds",
                       exam, [{"last_name": "A", "first_name": "B",
                               "total_score": 30, "checked": True}],
                       items, passing_pct=60.0)
    colA2 = ([c.value for c in load_workbook(BytesIO(empty))["Data Analytics"]["A"]]
             if empty else [])
    check("a group with nobody in it says so",
          "No students in this group." in colA2,
          "an empty table under a heading reads as a truncated file")
    check("  ...and still shows 0 in its heading",
          "0 scored zero" in colA2, str([v for v in colA2 if isinstance(v, str)
                                         and "scored zero" in v]))

    # ── 5. no papers at all ──────────────────────────────────────────────
    none_yet = safe_build("an exam with no papers builds",
                          exam, [], [], passing_pct=60.0)
    ws3 = load_workbook(BytesIO(none_yet))["Data Analytics"] if none_yet else None
    colA3 = [c.value for c in ws3["A"]] if ws3 else []
    rowsB3 = ({r[0].value: r[1].value for r in ws3.iter_rows(min_col=1, max_col=2)
               if r[0].value} if ws3 else {})
    check("an exam with no papers still produces a file",
          "Data Analytics" in colA3)
    check("  ...with Students 0", rowsB3.get("Students") == 0,
          str(rowsB3.get("Students")))
    check("  ...a dash for Mean rather than a crash",
          rowsB3.get("Mean") == "—", repr(rowsB3.get("Mean")))
    check("  ...and the no-checked-papers wording on the highest score",
          any(isinstance(v, str) and v == "0 got the highest score" for v in colA3),
          str([v for v in colA3 if isinstance(v, str) and "highest" in v]))

    # ── 7. page 23 requirement 1: the majority section ───────────────────
    #
    #     "Please include also this info 'Items incorrectly answered by the
    #      majority of the class' ... to be included on this lowest portion
    #      (located after the 1 scored zero portion)."
    #
    # WHERE it is matters as much as that it exists: she asked for it after
    # the scored-zero list, so the row indexes are compared rather than just
    # testing that the heading is somewhere in the sheet.
    MAJ = "incorrectly answered by the majority of the class"
    zero_at = next((i for i, v in enumerate(colA)
                    if isinstance(v, str) and v.endswith("scored zero")), None)
    maj_at = next((i for i, v in enumerate(colA)
                   if isinstance(v, str) and MAJ in v), None)
    check("the majority section is present", maj_at is not None,
          str([v for v in colA if isinstance(v, str)][-6:]))
    check("  ...AFTER the scored-zero list, as she asked",
          zero_at is not None and maj_at is not None and maj_at > zero_at,
          f"scored zero at row {zero_at}, majority at row {maj_at}")

    # The main fixture's items are 3 of 6, 0 of 6 and 1 of 6 wrong. THREE OF
    # SIX IS EXACTLY HALF, which is not a majority - so the good-outcome
    # wording is the right answer here, and a rule written `>=` would list
    # item 13 and fail this.
    check("exactly half the class is NOT a majority",
          not any(isinstance(v, str) and v.startswith("1 item incorrectly")
                  for v in colA),
          str([v for v in colA if isinstance(v, str) and "incorrectly" in v]))
    check("  ...and the empty case reads as the good outcome, not a failure",
          any(isinstance(v, str)
              and v.startswith("No item was missed by more than half")
              and "All 3 items were" in v for v in colA),
          str([v for v in colA if isinstance(v, str) and "No item" in v]))

    # ── 7b. a fixture where the majority DID miss things ─────────────────
    maj_items = [
        # 5 of 6: a majority. First in the list, and it must stay first.
        {"question_number": 9, "answered": 6, "correct": 1, "wrong": 5,
         "blank": 2, "review": 0},
        # 3 of 6: exactly half. Excluded.
        {"question_number": 4, "answered": 6, "correct": 3, "wrong": 3,
         "blank": 0, "review": 0},
        # 2 of 3: a majority on its own, smaller denominator - and graded
        # against two answer keys, so it carries the screen's warning.
        {"question_number": 7, "answered": 3, "correct": 1, "wrong": 2,
         "blank": 1, "review": 2, "key_mismatch": True,
         "correct_answer": "TRUE"},
        # nobody reached it: a majority of nobody is not a majority.
        {"question_number": 11, "answered": 0, "correct": 0, "wrong": 0,
         "blank": 0, "review": 0},
    ]
    blob4 = safe_build("the majority fixture builds", exam, papers, maj_items,
                       passing_pct=60.0)
    grid4 = ([[c.value for c in row] for row in
              load_workbook(BytesIO(blob4))["Data Analytics"]
              .iter_rows(min_col=1, max_col=8)] if blob4 else [])
    colA4 = [r[0] for r in grid4]

    check("the heading counts the items, not the papers",
          any(isinstance(v, str) and v.startswith("2 items " + MAJ)
              for v in colA4),
          str([v for v in colA4 if isinstance(v, str) and MAJ in v]))
    check("  ...and says what majority means",
          any(isinstance(r[1], str) and "more than 50%" in r[1]
              for r in grid4 if isinstance(r[0], str) and MAJ in str(r[0])),
          "a heading promising a majority needs its own definition beside it")

    hdr = next((i for i, r in enumerate(grid4) if r[0] == "Item"), None)
    if hdr is None:
        check("the majority table has an Item header row", False,
              "nothing below could be read")
    check("the table has the screen's columns, each its own cell",
          hdr is not None and grid4[hdr][:8] == [
              "Item", "Answer", "Got it wrong", "Out of", "% wrong",
              "Correct", "Blank", "Under review"],
          str(grid4[hdr][:8]) if hdr is not None else "no Item header row")

    body = ([r for r in grid4[hdr + 1:] if isinstance(r[0], int)]
            if hdr is not None else [])
    check("only the majorities are listed", [r[0] for r in body] == [9, 7],
          str([r[0] for r in body]))
    check("  ...in the order they arrived, not sorted",
          [r[0] for r in body] == [9, 7],
          "analytics_service orders them; re-sorting here would hide it if "
          "that stopped being true")
    check("the counts are NUMBERS, so the column can be sorted",
          all(isinstance(r[2], int) and isinstance(r[3], int) for r in body),
          str([(r[2], r[3]) for r in body]))
    check("each row prints its own denominator",
          [(r[2], r[3]) for r in body] == [(5, 6), (2, 3)],
          str([(r[2], r[3]) for r in body]))
    check("  ...and the percentage the screen shows",
          [r[4] for r in body] == ["83.3%", "66.7%"], str([r[4] for r in body]))
    check("correct, blank and under review all travel",
          [(r[5], r[6], r[7]) for r in body] == [(1, 2, 0), (1, 1, 2)],
          str([(r[5], r[6], r[7]) for r in body]))
    check("a two-key item is marked, as it is on the screen",
          len(body) > 1 and body[1][1] == "TRUE ⚠",
          repr(body[1][1]) if len(body) > 1 else f"{len(body)} rows")
    check("  ...and an item with no answer key text gets a dash",
          len(body) > 0 and body[0][1] == "—",
          repr(body[0][1]) if body else "no rows")

    foot4 = next((v for v in colA4 if isinstance(v, str)
                  and v.startswith("2 of 4 items shown")), "")
    check("the footnote says how many items were NOT shown",
          "The other 2 were answered correctly" in foot4, repr(foot4[:80]))
    check("  ...that Blank is part of Wrong",
          "Blank is part of Wrong" in foot4, repr(foot4[:160]))
    check("  ...that an item under review can appear later",
          "under review counts as neither" in foot4, repr(foot4[-200:]))
    check("  ...and what the warning mark means",
          "more than one answer key" in foot4, repr(foot4[-200:]))

    # ── 7c. no graded papers: no per-item results, said plainly ──────────
    colA5 = colA3
    check("with nothing graded the section says why it is empty",
          any(isinstance(v, str) and "no per-item results" in v for v in colA5),
          str([v for v in colA5 if isinstance(v, str) and "per-item" in v]))
    check("  ...and does not print an empty table under the heading",
          not any(v == "Item" for v in colA5), str(colA5[-4:]))

    # ── 6. the filename ──────────────────────────────────────────────────
    name = svc.filename_for_analytics(exam)
    check("the filename names the exam", name == "Midterm-1-data-analytics.xlsx",
          name)
    check("  ...and is safe on Windows",
          not any(c in name for c in '\\/:*?"<>|'), name)
    check("  ...and cannot be mistaken for the other workbook",
          "data-analytics" in name, name)

    print()
    print(f"  {passed} passed, {len(failed)} failed")
    if failed:
        print()
        for f in failed:
            print("  FAIL  " + f)
    print()
    print("  a real .xlsx, built by the real service and read back with openpyxl.")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
