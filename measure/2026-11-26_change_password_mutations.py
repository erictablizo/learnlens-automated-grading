#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
measure/2026-11-26_change_password_mutations.py                   2026-11-26
============================================================================

Breaks change_password() on purpose and requires
measure/2026-11-26_change_password.py to FAIL on each.

    python measure/2026-11-26_change_password_mutations.py

M1 and M2 are the two that matter. M1 reopens the account to a resigned
teacher - the one way back in that the 2026-11-24 gates did not cover,
because it hands over a credential rather than a session. M2 turns an
unauthenticated endpoint into an address checker by giving a different
answer for an address that exists.

M7 is the 2026-11-25 bug wearing different clothes: a message that quotes
the password it refused.
"""
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT    = Path(__file__).resolve().parent.parent
SERVICE = ROOT / "backend/app/services/auth_service.py"
BENCH   = ROOT / "measure/2026-11-26_change_password.py"
BAK     = SERVICE.with_suffix(SERVICE.suffix + ".mutbak")

COUNT_RE = re.compile(r"(\d+) passed, (\d+) failed")

MUTATIONS = [
    ("a RESIGNED account may change its password - a fifth way back in, and "
     "the only one that hands over a working credential",
     "    if user.status != ACTIVE:\n        # A resigned account may not set",
     "    if False:\n        # A resigned account may not set"),

    ("an unknown address is told so, turning the form into an address checker",
     "    if not user or not verify_password(old_password, user.password_hash):\n"
     "        return WRONG_CREDENTIALS",
     "    if not user:\n"
     "        return \"No account uses that email address.\"\n"
     "    if not verify_password(old_password, user.password_hash):\n"
     "        return WRONG_CREDENTIALS"),

    ("the new password is written BEFORE it is checked, so a refusal has "
     "already changed the password",
     "    from app.schemas.user import _validate_password\n"
     "    try:\n"
     "        _validate_password(new_password)",
     "    user.password_hash = hash_password(new_password)\n"
     "    await db.commit()\n"
     "    from app.schemas.user import _validate_password\n"
     "    try:\n"
     "        _validate_password(new_password)"),

    ("the new password is not checked against the rules at all, so Change "
     "password accepts what Register would refuse",
     "        _validate_password(new_password)\n"
     "    except ValueError as e:\n"
     "        return str(e)",
     "        pass\n"
     "    except ValueError as e:\n"
     "        return str(e)"),

    ("the new password may equal the old one, so the form reports success "
     "and changes nothing",
     "    if verify_password(new_password, user.password_hash):",
     "    if False:"),

    ("reset links already in the mailbox survive the change",
     "    await db.execute(\n"
     "        update(PasswordReset)\n"
     "        .where(PasswordReset.user_id == user.user_id, PasswordReset.used == False)  # noqa: E712\n"
     "        .values(used=True)\n"
     "    )\n"
     "    await db.commit()\n"
     "    return None",
     "    await db.commit()\n"
     "    return None"),

    ("the refusal quotes the password it refused - the 2026-11-25 bug again",
     "    except ValueError as e:\n        return str(e)",
     "    except ValueError as e:\n        return f\"{new_password}: {e}\""),

    ("the lookup becomes case-sensitive, so a teacher who capitalises their "
     "address differently cannot change their password",
     "    user = await _user_by_email(db, email)\n\n    # Order matters only",
     "    user = (await db.execute(\n"
     "        select(User).where(User.email == email))).scalar_one_or_none()\n\n"
     "    # Order matters only"),
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
        shutil.copy2(BAK, SERVICE); BAK.unlink()
    original = SERVICE.read_text(encoding="utf-8")

    verdict, detail = run_bench()
    if verdict != "clean":
        print(f"REFUSING TO RUN: the bench {verdict} on the unmutated service.")
        print(f"  {detail}")
        sys.exit(2)
    print(f"  baseline clean  ({detail})")
    print(f"  {len(MUTATIONS)} mutations")

    shutil.copy2(SERVICE, BAK)
    survived, crashed = [], []
    try:
        for why, old, new in MUTATIONS:
            label = " ".join(why.split())
            if original.count(old) != 1:
                survived.append(f"{label}\n      [DID NOT APPLY: anchor found "
                                f"{original.count(old)} times]")
                continue
            SERVICE.write_text(original.replace(old, new, 1), encoding="utf-8")
            verdict, detail = run_bench()
            if verdict == "failed":
                print(f"  caught: {label}\n            -> {detail}")
            elif verdict == "crashed":
                crashed.append(f"{label}\n      [CRASHED: {detail}]")
            else:
                survived.append(f"{label}\n      [SURVIVED: {detail}]")
            SERVICE.write_text(original, encoding="utf-8")
    finally:
        SERVICE.write_text(original, encoding="utf-8")
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
