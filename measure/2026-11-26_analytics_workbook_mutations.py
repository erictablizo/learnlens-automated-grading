#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
measure/2026-11-26_analytics_workbook_mutations.py                2026-11-26
============================================================================

Breaks backend/app/services/analytics_export_service.py on purpose and
requires measure/2026-11-26_analytics_workbook.py to FAIL on each.

    python measure/2026-11-26_analytics_workbook_mutations.py

M1-M3 are the ones worth having. Each puts a plausible, wrong set of papers
behind a number the teacher will read as fact, and none of them would look
wrong in the file: "Students: 3" is a perfectly sensible-looking cell.
"""
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT   = Path(__file__).resolve().parent.parent
TARGET = ROOT / "backend/app/services/analytics_export_service.py"
BENCH  = ROOT / "measure/2026-11-26_analytics_workbook.py"
BAK    = TARGET.with_suffix(TARGET.suffix + ".mutbak")

COUNT_RE = re.compile(r"(\d+) passed, (\d+) failed")

MUTATIONS = [
    ("Students counts only the checked papers, so the header disagrees with "
     "the class size",
     '("Students", len(papers)),', '("Students", len(final)),'),

    ("the statistics are taken over EVERY paper, so an unchecked floor is "
     "averaged in as though it were a result",
     "    final = _checked(papers)", "    final = list(papers)"),

    ("the Mode cell takes as_rows' value - the most common SCORE - so the "
     "file and the screen put different things under one label",
     '        if label == "Mode":', '        if False:'),

    ("the passed list is built from every paper rather than the checked "
     "ones, so an unchecked floor counts as a pass",
     "         [] if not total_points else [p for p in final if (_score(p) or 0) >= mark],",
     "         [] if not total_points else [p for p in papers if (_score(p) or 0) >= mark],"),

    ("the Section label reverts to Schedule, which page 18 requirement 8 "
     "renamed on every screen",
     '        ("Section",  exam.get("schedule") or DASH),',
     '        ("Schedule", exam.get("schedule") or DASH),'),

    ("an empty group prints nothing, so a heading sits above a blank gap and "
     "the file reads as truncated",
     '            ws.cell(row=r, column=1, value="No students in this group.") \\\n'
     '              .font = NOTE_FONT\n'
     '            r += 1',
     '            pass'),

    ("scores are written as the screen's '30 / 30' text, so the column "
     "cannot be sorted or averaged",
     '            ws.cell(row=r, column=4, value=_score(p))',
     '            ws.cell(row=r, column=4, value=f"{_score(p)} / {total_points}")'),

    ("the two Mode lines are joined into one sentence, which is how "
     "'item 7 item 2' happens",
     '            cell = ws.cell(row=r, column=2, value="\\n".join(mode_lines))',
     '            cell = ws.cell(row=r, column=2, value=" ".join(mode_lines))'),

    ("the caption is dropped, leaving three different denominators on one "
     "sheet with nothing explaining them",
     "    ws.cell(row=r, column=1, value=note).font = NOTE_FONT",
     "    pass"),
]


def run_bench():
    env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")
    r = subprocess.run([sys.executable, "-I", "-B", str(BENCH)],
                       capture_output=True, text=True, env=env, cwd=str(ROOT))
    m = None
    for line in r.stdout.splitlines():
        hit = COUNT_RE.search(line)
        if hit:
            m = hit
    if m is None:
        err = (r.stderr.strip().splitlines() or ["no stderr"])[-1]
        return "crashed", f"no count line; last stderr: {err[:110]}"
    npass, nfail = int(m.group(1)), int(m.group(2))
    named = [l.strip() for l in r.stdout.splitlines() if l.strip().startswith("FAIL")]
    if r.returncode == 0 and nfail == 0:
        return "clean", f"{npass} passed, 0 failed"
    if nfail == 0:
        return "crashed", f"{npass} passed, 0 failed but exit {r.returncode}"
    return "failed", f"{nfail} failed: {named[0][6:] if named else '(unnamed)'}"


def main():
    if BAK.is_file():
        print("  recovered a .mutbak left by an earlier run")
        shutil.copy2(BAK, TARGET); BAK.unlink()
    original = TARGET.read_text(encoding="utf-8")

    verdict, detail = run_bench()
    if verdict != "clean":
        print(f"REFUSING TO RUN: the bench {verdict} on the unmutated builder.")
        print(f"  {detail}")
        sys.exit(2)
    print(f"  baseline clean  ({detail})")
    print(f"  {len(MUTATIONS)} mutations")

    shutil.copy2(TARGET, BAK)
    survived, crashed = [], []
    try:
        for why, old, new in MUTATIONS:
            label = " ".join(why.split())
            if original.count(old) != 1:
                survived.append(f"{label}\n      [DID NOT APPLY: anchor found "
                                f"{original.count(old)} times]")
                continue
            TARGET.write_text(original.replace(old, new, 1), encoding="utf-8")
            verdict, detail = run_bench()
            if verdict == "failed":
                print(f"  caught: {label}\n            -> {detail[:140]}")
            elif verdict == "crashed":
                crashed.append(f"{label}\n      [CRASHED: {detail}]")
            else:
                survived.append(f"{label}\n      [SURVIVED: {detail}]")
            TARGET.write_text(original, encoding="utf-8")
    finally:
        TARGET.write_text(original, encoding="utf-8")
        if BAK.is_file():
            BAK.unlink()

    print("\n=== restored ===")
    verdict, detail = run_bench()
    print(f"  {detail}")
    if verdict != "clean":
        print("  THE RESTORE DID NOT TAKE. Do not trust the tree.")
        sys.exit(1)
    for title, items in (("CRASHED THE BENCH", crashed),
                         ("THE BENCH DID NOT CATCH", survived)):
        if items:
            print(f"\n{len(items)} MUTATION(S) {title}:")
            for s in items:
                print(f"  - {s}")
    if survived or crashed:
        sys.exit(1)
    print(f"\n  all {len(MUTATIONS)} mutations caught; tree restored and verified")


if __name__ == "__main__":
    main()
