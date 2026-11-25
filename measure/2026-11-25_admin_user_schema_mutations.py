#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
measure/2026-11-25_admin_user_schema_mutations.py                 2026-11-25
============================================================================

M1 IS NOT HYPOTHETICAL. It is the exact code that shipped to learnlens.tech
and put a teacher's password on screen in a red box. Every other mutation
here is a guess at how this file could go wrong; that one is a record of how
it did.

    python measure/2026-11-25_admin_user_schema_mutations.py
"""
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT   = Path(__file__).resolve().parent.parent
SCHEMA = ROOT / "backend/app/schemas/admin_user.py"
BENCH  = ROOT / "measure/2026-11-25_admin_user_schema.py"
BAK    = SCHEMA.with_suffix(SCHEMA.suffix + ".mutbak")

COUNT_RE = re.compile(r"(\d+) passed, (\d+) failed")

MUTATIONS = [
    ("THE BUG THAT SHIPPED: treat _validate_password as though it returned a "
     "message, so a valid password is refused WITH THE PASSWORD as the error",
     "        return _validate_password(v)",
     "        msg = _validate_password(v)\n"
     "        if msg:\n"
     "            raise ValueError(msg)\n"
     "        return v"),

    ("the password rule is dropped entirely, so Manage Users can create an "
     "account the Register screen would refuse",
     "        return _validate_password(v)", "        return v"),

    ("the edit body gains a password field, making a silent password reset "
     "part of an ordinary name change",
     "class AdminUserUpdate(BaseModel):",
     "class AdminUserUpdate(BaseModel):\n    password: Optional[str] = None"),

    ("a blank surname is accepted, so the list shows a nameless row",
     '    last_name:  str = Field(min_length=1, max_length=255)',
     '    last_name:  str = ""'),
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
        shutil.copy2(BAK, SCHEMA); BAK.unlink()
    original = SCHEMA.read_text(encoding="utf-8")

    verdict, detail = run_bench()
    if verdict != "clean":
        print(f"REFUSING TO RUN: the bench {verdict} on the unmutated schema.")
        print(f"  {detail}")
        sys.exit(2)
    print(f"  baseline clean  ({detail})")

    shutil.copy2(SCHEMA, BAK)
    survived, crashed = [], []
    try:
        for why, old, new in MUTATIONS:
            label = " ".join(why.split())
            if original.count(old) != 1:
                survived.append(f"{label}\n      [DID NOT APPLY: anchor found "
                                f"{original.count(old)} times]")
                continue
            SCHEMA.write_text(original.replace(old, new, 1), encoding="utf-8")
            verdict, detail = run_bench()
            if verdict == "failed":
                print(f"  caught: {label}\n            -> {detail}")
            elif verdict == "crashed":
                crashed.append(f"{label}\n      [CRASHED: {detail}]")
            else:
                survived.append(f"{label}\n      [SURVIVED: {detail}]")
            SCHEMA.write_text(original, encoding="utf-8")
    finally:
        SCHEMA.write_text(original, encoding="utf-8")
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
