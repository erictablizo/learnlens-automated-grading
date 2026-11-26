#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
measure/2026-11-26_item_extremes_mutations.py                     2026-11-26
============================================================================

Breaks backend/app/ml/item_extremes.py on purpose and requires
measure/2026-11-26_item_extremes_twins.mjs to FAIL on each.

    python measure/2026-11-26_item_extremes_mutations.py

A twins bench can pass for the wrong reason: if the fixtures never reach a
decision, both sides agree about nothing in particular. Each mutation below
changes ONE of the decisions the TypeScript makes, so a surviving mutation
means the fixtures do not cover it.
"""
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT   = Path(__file__).resolve().parent.parent
TARGET = ROOT / "backend/app/ml/item_extremes.py"
BENCH  = ROOT / "measure/2026-11-26_item_extremes_twins.mjs"
BAK    = TARGET.with_suffix(TARGET.suffix + ".mutbak")

COUNT_RE = re.compile(r"(\d+) passed, (\d+) failed")

MUTATIONS = [
    ("an item nobody reached is counted, so an unanswered item looks like "
     "one the whole class got wrong",
     'return [i for i in items or [] if int(i.get("answered") or 0) > 0]',
     "return list(items or [])"),

    ("the denominator becomes the HIGHEST answered count, overstating how "
     "many papers the claim covers",
     "        return min(int(i.get(\"answered\") or 0) for i in xs\n"
     "                   if int(i[\"question_number\"]) in nums)",
     "        return max(int(i.get(\"answered\") or 0) for i in xs\n"
     "                   if int(i[\"question_number\"]) in nums)"),

    ("tied items are no longer sorted, so the list comes out in row order",
     "        return sorted(int(i[\"question_number\"]) for i in xs\n"
     "                      if int(i.get(key) or 0) == n)",
     "        return [int(i[\"question_number\"]) for i in xs\n"
     "                if int(i.get(key) or 0) == n]"),

    ("only the first tied item is named, so 'items 7, 10, 11' becomes "
     "'item 7' and two real answers vanish",
     "    wrong_items = pick(top_wrong, \"wrong\")",
     "    wrong_items = pick(top_wrong, \"wrong\")[:1]"),

    # ANCHORED WITHOUT THE EM DASH. The first version spelled it \u2014,
    # the escape as written in the source; the file on disk holds the real
    # character, so the anchor matched nothing and the mutation was reported
    # as "DID NOT APPLY" rather than as a gap. Measured 2026-11-26.
    ("the zero case loses its own sentence, so a class that got everything "
     "right reads 'Most missed: item 1 - 0 of 6 wrong'",
     "        if x.wrong_count > 0\n",
     "        if True\n"),

    ("the em dash becomes a hyphen, so the file and the screen print "
     "different characters",
     "f\"Most correct: {_list(x.most_right)} \u2014 {x.right_count} of \"",
     "f\"Most correct: {_list(x.most_right)} - {x.right_count} of \""),
]


def run_bench():
    r = subprocess.run(["node", str(BENCH)], capture_output=True, text=True,
                       cwd=str(ROOT), env=dict(os.environ))
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
        print(f"REFUSING TO RUN: the bench {verdict} on the unmutated twin.")
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
                print(f"  caught: {label}\n            -> {detail[:150]}")
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