#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
measure/2026-11-27_majority_mutations.py                          2026-11-27
============================================================================

Breaks the majority rule on purpose and requires
measure/2026-11-27_majority_twins.mjs to FAIL on each.

    python measure/2026-11-27_majority_mutations.py

IT MUTATES BOTH SIDES, which is the point of a twins bench. Drift is
directional: a rule changed in the Python and not the TypeScript is a wrong
Excel next to a right screen, and the other way round is a wrong screen next
to a right file. A harness that only ever mutated one file would prove the
bench notices half the ways these two can part company.

THE MUTATIONS ARE THE MISTAKES SOMEONE WOULD ACTUALLY MAKE:
`>=` for `>`; round() for floor(x + 0.5); a whole percentage; str() instead
of the shared trimmer; sorting the rows; dropping the filter.
"""
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT  = Path(__file__).resolve().parent.parent
PY    = ROOT / "backend/app/ml/majority_wrong.py"
TS    = ROOT / "frontend/src/lib/majorityWrong.ts"
BENCH = ROOT / "measure/2026-11-27_majority_twins.mjs"

COUNT_RE = re.compile(r"(\d+) passed, (\d+) failed")

# (target, why, old, new)
MUTATIONS = [
    (PY, "Python: exactly half becomes a majority (`>=` for `>`), so 2 of 4 "
         "is listed on a report that promises more than 50%",
     'return answered > 0 and as_count(it, "wrong") * 2 > answered',
     'return answered > 0 and as_count(it, "wrong") * 2 >= answered'),

    (TS, "TypeScript: the same `>=`, drifting the screen away from the file",
     "it.answered > 0 && it.wrong * 2 > it.answered",
     "it.answered > 0 && it.wrong * 2 >= it.answered"),

    (PY, "Python: round() instead of floor(x + 0.5), so a percentage landing "
         "exactly on .5 rounds DOWN - banker's rounding, which JavaScript "
         "does not do",
     "    p = floor((wrong / answered) * 1000 + 0.5) / 10",
     "    p = round((wrong / answered) * 1000) / 10"),

    (PY, "Python: a whole percentage, so 51 of 101 prints 50% under a "
         "heading promising more than 50%",
     "    p = floor((wrong / answered) * 1000 + 0.5) / 10",
     "    p = floor((wrong / answered) * 100 + 0.5)"),

    (TS, "TypeScript: the same whole percentage on the screen",
     "  const p = Math.round((wrong / answered) * 1000) / 10;",
     "  const p = Math.round((wrong / answered) * 100);"),

    (PY, "Python: str(p) instead of the shared trimmer, so a whole "
         "percentage prints '75.0%' where the screen prints '75%'",
     'return f"{_trim(p)}%"', 'return f"{p}%"'),

    (PY, "Python: the rows are sorted by question number, which hides it if "
         "analytics_service ever stops ordering them",
     "    return [it for it in items if is_majority_wrong(it)]",
     "    return sorted((it for it in items if is_majority_wrong(it)),\n"
     '                  key=lambda it: it.get("question_number") or 0)'),

    (PY, "Python: the filter is dropped, so every item is a majority",
     "    return [it for it in items if is_majority_wrong(it)]",
     "    return list(items)"),

    (PY, "Python: the `answered > 0` guard goes, so a row claiming wrong "
         "answers with nobody having answered counts as a majority",
     'return answered > 0 and as_count(it, "wrong") * 2 > answered',
     'return as_count(it, "wrong") * 2 > answered'),

    (TS, "TypeScript: the same guard, the other direction",
     "it.answered > 0 && it.wrong * 2 > it.answered",
     "it.wrong * 2 > it.answered"),
]


def run_bench():
    """clean / failed / crashed - and they are three different things.

    A mutation that stops the bench RUNNING has not been caught by it, so it
    is reported separately rather than counted as a success.
    """
    env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")
    r = subprocess.run(["node", str(BENCH)], capture_output=True, text=True,
                       env=env, cwd=str(ROOT))
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
    for f in (PY, TS, BENCH):
        if not f.is_file():
            print(f"  MISSING: {f}")
            sys.exit(2)

    # Recover anything an interrupted run left behind BEFORE reading the
    # originals, or the mutant becomes the baseline.
    for t in (PY, TS):
        bak = t.with_suffix(t.suffix + ".mutbak")
        if bak.is_file():
            print(f"  recovered a .mutbak left by an earlier run: {t.name}")
            shutil.copy2(bak, t)
            bak.unlink()

    # ── BYTECODE IS A MEASUREMENT HAZARD HERE ────────────────────────────
    # Measured 2026-11-27: every mutation "crashed" because the twins bench
    # refuses to run against a .pyc older than its source, and the bench's
    # own driver had written one. The driver now runs with -B (note that -I
    # implies -E, so PYTHONDONTWRITEBYTECODE in the environment is ignored),
    # and anything left by an earlier run goes before the baseline.
    for d in (ROOT / "backend").rglob("__pycache__"):
        shutil.rmtree(d, ignore_errors=True)

    original = {t: t.read_bytes() for t in (PY, TS)}

    verdict, detail = run_bench()
    if verdict != "clean":
        print(f"REFUSING TO RUN: the bench {verdict} on the unmutated files.")
        print(f"  {detail}")
        sys.exit(2)
    print(f"  baseline clean  ({detail})")
    print(f"  {len(MUTATIONS)} mutations across 2 files")

    survived, crashed = [], []
    try:
        for target, why, old, new in MUTATIONS:
            label = f"{target.name}: " + " ".join(why.split())
            src = original[target].decode("utf-8")
            if src.count(old) != 1:
                survived.append(f"{label}\n      [DID NOT APPLY: anchor found "
                                f"{src.count(old)} times]")
                continue
            target.write_bytes(src.replace(old, new, 1).encode("utf-8"))
            verdict, detail = run_bench()
            if verdict == "failed":
                print(f"  caught: {label}\n            -> {detail[:140]}")
            elif verdict == "crashed":
                crashed.append(f"{label}\n      [CRASHED: {detail}]")
            else:
                survived.append(f"{label}\n      [SURVIVED: {detail}]")
            target.write_bytes(original[target])
    finally:
        for t in (PY, TS):
            t.write_bytes(original[t])

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
    print(f"\n  all {len(MUTATIONS)} mutations caught; both files restored "
          f"and verified")


if __name__ == "__main__":
    main()
