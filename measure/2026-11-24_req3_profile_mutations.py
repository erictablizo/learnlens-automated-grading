#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
measure/2026-11-24_req3_profile_mutations.py                      2026-11-24
============================================================================

Breaks apply_2026-11-24_req3_profile.py on purpose, one change at a time, and
requires measure/2026-11-24_req3_profile_patch.py to FAIL on each.  A bench
that has never been seen to fail is a bench that has not been tested, and two
of these mutations are mistakes that were actually made on the way here.

    python measure/2026-11-24_req3_profile_mutations.py

RECOVERY FIRST.  A killed run leaves .mutbak behind - a `finally` does not run
on SIGTERM - so this restores any it finds before it starts, as the student
record and analytics harnesses do.
"""
import shutil
import subprocess
import sys
from pathlib import Path

ROOT  = Path(__file__).resolve().parent.parent
TOOL  = ROOT / "apply_2026-11-24_req3_profile.py"
BENCH = ROOT / "measure/2026-11-24_req3_profile_patch.py"
BAK   = TOOL.with_suffix(TOOL.suffix + ".mutbak")

MUTATIONS = [
    ("the Enter walk is not scoped to the card",
     'advanceOnEnter(e, cardRef.current, ".form-input")',
     "advanceOnEnter(e, document)"),
    ("the selector is dropped, so Enter can land in the file picker",
     'advanceOnEnter(e, cardRef.current, ".form-input")',
     "advanceOnEnter(e, cardRef.current)"),
    ("autoFocus is never inserted",
     "'{i}  autoFocus\\n'", "''"),
    ("autoFocus goes on the LAST box instead of the first",
     'FIRST_RE = re.compile(r\'^([ \\t]*)<input id="first-name"\', re.M)',
     'FIRST_RE = re.compile(r\'^([ \\t]*)<input id="position"\', re.M)'),
    ("the card never gets its ref",
     "'{i}  ref={{cardRef}}\\n'", "''"),
    ("the import is never added",
     'import {{ advanceOnEnter }} from "@/lib/formNav";',
     "// no import"),
    ("the fingerprint is dropped, so it would patch the setup screen too",
     'FINGERPRINT_MUST_NOT = ("Set up your profile",)',
     "FINGERPRINT_MUST_NOT = ()"),
    ("anchors no longer have to be unique",
     "if len(ms) != 1:", "if len(ms) < 1:"),
    ("the already-patched guard is removed",
     "if MARKER in text:", "if False:"),
]


def bench_fails():
    r = subprocess.run([sys.executable, "-I", str(BENCH)],
                       capture_output=True, text=True)
    return r.returncode != 0, r.stdout.strip().splitlines()


def main():
    if BAK.is_file():
        print("  recovered a .mutbak left by an earlier run")
        shutil.copy2(BAK, TOOL); BAK.unlink()

    ok, lines = bench_fails()
    if ok:
        print("REFUSING TO RUN: the bench already fails on the unmutated tool.")
        print("\n".join(lines[-12:]))
        sys.exit(2)
    print(f"  baseline clean  ({lines[-1].strip() if lines else ''})")

    original = TOOL.read_text(encoding="utf-8")
    shutil.copy2(TOOL, BAK)
    survived = []
    try:
        for why, old, new in MUTATIONS:
            if original.count(old) < 1:
                survived.append(f"{why}  [MUTATION DID NOT APPLY: {old[:50]!r} not in the tool]")
                continue
            TOOL.write_text(original.replace(old, new), encoding="utf-8")
            caught, lines = bench_fails()
            print(f"  {'caught ' if caught else 'SURVIVED'}  {why}")
            if not caught:
                survived.append(why)
    finally:
        shutil.copy2(BAK, TOOL); BAK.unlink()

    ok, lines = bench_fails()
    if ok:
        print("\n  WARNING: the tool did not come back clean after recovery.")
        sys.exit(2)

    print()
    if survived:
        print(f"  {len(survived)} mutation(s) SURVIVED — the bench cannot see them:")
        for s in survived:
            print("    " + s)
        sys.exit(1)
    print(f"  all {len(MUTATIONS)} mutations caught")


if __name__ == "__main__":
    main()