#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
measure/2026-11-27_exam_totals_mutations.py                       2026-11-27
============================================================================

Breaks backend/app/api/routes/analytics_export.py on purpose and requires
measure/2026-11-27_exam_totals.py to FAIL on each.

    python measure/2026-11-27_exam_totals_mutations.py

M5 IS THE BUG SHE REPORTED. It puts `exam.total_points` back where
`key_points` is, which is what produced "9 of 15 Points" and
"Score (out of 15)" on an exam worth 30. If that mutation ever survives,
page 23 requirement 2 has been undone and nothing would say so.

The others are the ways the arithmetic can be wrong while still returning a
plausible number - a dropped COALESCE, a COUNT where a SUM belongs, a
missing WHERE - none of which look wrong in a spreadsheet cell.
"""
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT   = Path(__file__).resolve().parent.parent
TARGET = ROOT / "backend/app/api/routes/analytics_export.py"
BENCH  = ROOT / "measure/2026-11-27_exam_totals.py"
BAK    = TARGET.with_suffix(TARGET.suffix + ".mutbak")

COUNT_RE = re.compile(r"(\d+) passed, (\d+) failed")

MUTATIONS = [
    ("the inner COALESCE goes, so a key with no points contributes NULL and "
     "SUM silently drops it - an unpriced exam becomes worth 0",
     "func.coalesce(func.sum(func.coalesce(AnswerKey.points, 1)), 0))",
     "func.coalesce(func.sum(AnswerKey.points), 0))"),

    ("the outer COALESCE goes, so an exam with no answer key yet returns "
     "NULL where a number is expected",
     "func.coalesce(func.sum(func.coalesce(AnswerKey.points, 1)), 0))",
     "func.sum(func.coalesce(AnswerKey.points, 1)))"),

    ("a COUNT where the SUM belongs, which is the original bug wearing a "
     "different hat: 15 again, for an exam worth 30",
     "func.coalesce(func.sum(func.coalesce(AnswerKey.points, 1)), 0))",
     "func.coalesce(func.count(func.coalesce(AnswerKey.points, 1)), 0))"),

    ("the WHERE goes, so every exam's answer keys are added together",
     "        .select_from(AnswerKey)\n        .where(AnswerKey.exam_id == exam_id))).one()",
     "        .select_from(AnswerKey))).one()"),

    ("THE REPORTED BUG, restored: exams.total_points is sent instead of the "
     "answer keys, so the file measures every mark against the item count",
     '"total_points": key_points or int(getattr(exam, "total_points", 0) or 0),',
     '"total_points": int(getattr(exam, "total_points", 0) or 0),'),

    ("the column is preferred over the keys, which is the same bug on any "
     "exam where the column happens to be set",
     '"total_points": key_points or int(getattr(exam, "total_points", 0) or 0),',
     '"total_points": int(getattr(exam, "total_points", 0) or 0) or key_points,'),

    ("the item count is taken from the points sum, so a 15-item exam worth "
     "30 reports 30 items",
     "    total_items = int(totals[0] or 0)",
     "    total_items = int(totals[1] or 0)"),
]


def run_bench():
    env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")
    r = subprocess.run([sys.executable, "-B", str(BENCH)],
                       capture_output=True, text=True, env=env, cwd=str(ROOT))
    m = None
    for line in r.stdout.splitlines():
        hit = COUNT_RE.search(line)
        if hit:
            m = hit
    if m is None:
        out = (r.stdout.strip().splitlines() or [""])[-1]
        err = (r.stderr.strip().splitlines() or ["no stderr"])[-1]
        # A bench that REFUSED to measure is not a bench that caught
        # something, and the two must not be confused.
        return "crashed", f"no count line; last line: {(out or err)[:110]}"
    npass, nfail = int(m.group(1)), int(m.group(2))
    named = [l.strip() for l in r.stdout.splitlines() if l.strip().startswith("FAIL")]
    if r.returncode == 0 and nfail == 0:
        return "clean", f"{npass} passed, 0 failed"
    if nfail == 0:
        return "crashed", f"{npass} passed, 0 failed but exit {r.returncode}"
    return "failed", f"{nfail} failed: {named[0][6:] if named else '(unnamed)'}"


def main():
    for f in (TARGET, BENCH):
        if not f.is_file():
            print(f"  MISSING: {f}")
            sys.exit(2)
    if BAK.is_file():
        print("  recovered a .mutbak left by an earlier run")
        shutil.copy2(BAK, TARGET)
        BAK.unlink()

    original = TARGET.read_bytes()
    src = original.decode("utf-8")

    verdict, detail = run_bench()
    if verdict != "clean":
        print(f"REFUSING TO RUN: the bench {verdict} on the unmutated route.")
        print(f"  {detail}")
        sys.exit(2)
    print(f"  baseline clean  ({detail})")
    print(f"  {len(MUTATIONS)} mutations")

    shutil.copy2(TARGET, BAK)
    survived, crashed = [], []
    try:
        for why, old, new in MUTATIONS:
            label = " ".join(why.split())
            # The route may be CRLF: match on LF and write back in kind.
            text = src.replace("\r\n", "\n")
            if text.count(old) != 1:
                survived.append(f"{label}\n      [DID NOT APPLY: anchor found "
                                f"{text.count(old)} times]")
                continue
            mutated = text.replace(old, new, 1)
            if "\r\n" in src:
                mutated = mutated.replace("\n", "\r\n")
            TARGET.write_bytes(mutated.encode("utf-8"))
            verdict, detail = run_bench()
            if verdict == "failed":
                print(f"  caught: {label}\n            -> {detail[:150]}")
            elif verdict == "crashed":
                crashed.append(f"{label}\n      [CRASHED: {detail}]")
            else:
                survived.append(f"{label}\n      [SURVIVED: {detail}]")
            TARGET.write_bytes(original)
    finally:
        TARGET.write_bytes(original)
        if BAK.is_file():
            BAK.unlink()

    print("\n=== restored ===")
    verdict, detail = run_bench()
    print(f"  {detail}")
    if verdict != "clean":
        print("  THE RESTORE DID NOT TAKE. Do not trust the tree.")
        sys.exit(1)
    for title, rows in (("CRASHED THE BENCH", crashed),
                        ("THE BENCH DID NOT CATCH", survived)):
        if rows:
            print(f"\n{len(rows)} MUTATION(S) {title}:")
            for s in rows:
                print(f"  - {s}")
    if survived or crashed:
        sys.exit(1)
    print(f"\n  all {len(MUTATIONS)} mutations caught; route restored and verified")


if __name__ == "__main__":
    main()
