#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
measure/2026-11-25_admin_user_schema.py                           2026-11-25
============================================================================

Proves backend/app/schemas/admin_user.py - the request bodies behind Manage
Users - against THE REAL _validate_password from schemas/user.py.

    python measure/2026-11-25_admin_user_schema.py

WHY THIS FILE EXISTS. Shipped to production 2026-11-25, this validator read

    msg = _validate_password(v)
    if msg:
        raise ValueError(msg)
    return v

on the belief that _validate_password returns an error message. It does not.
It RAISES ValueError on a bad password and RETURNS THE PASSWORD on a good
one. So a valid password was truthy, the branch fired, and the account was
refused with THE PASSWORD ITSELF as the message - which the Manage Users
dialog printed on screen in plaintext.

Two failures from one wrong assumption: no account could be created at all,
and the only error it produced disclosed the credential.

Nothing caught it. measure/2026-11-24_admin_users.py exercises the SERVICE,
which takes an already-validated password; no bench loaded this schema. The
import was flagged unverified on 2026-11-24 and schemas/user.py was read on
2026-11-25 - the NAME was confirmed, the CONTRACT was not.

So the properties below are about the contract, and the sharpest of them is
property 3: NO ERROR MESSAGE MAY CONTAIN THE PASSWORD. That one does not care
how the validator is written or which library raises; it only cares that a
credential never reaches a screen.

THE REAL FUNCTION, not a stub - a stub would have encoded the same wrong
belief and agreed with the bug. measure/excerpt/user_password_excerpt.py is a
verbatim copy of the rules from her schemas/user.py; see its header. It is
deliberately NOT at backend/app/schemas/user.py, because a file shipped at
that path is one slip from overwriting the real one.
"""
import importlib.util
import sys
import types
from pathlib import Path

# ── BYTECODE IS A MEASUREMENT HAZARD IN THIS BENCH ─────────────────────────
# See measure/2026-11-24_admin_users.py for the measurement behind this.
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

ROOT   = Path(__file__).resolve().parent.parent
SCHEMA = ROOT / "backend/app/schemas/admin_user.py"
# NOT backend/app/schemas/user.py. The excerpt lives under measure/ on
# purpose: a file at that path in a delivery is one slip from being saved
# over the real schemas/user.py, which also holds UserCreate, UserLogin,
# Token and the reset-password schemas. It is loaded AS "app.schemas.user"
# below, so admin_user.py's import resolves to it unchanged.
USER   = ROOT / "measure/excerpt/user_password_excerpt.py"

passed = 0
failed = []
def check(label, cond, detail=""):
    global passed
    if cond: passed += 1
    else: failed.append(f"{label}: {detail}" if detail else label)


def load():
    for f in (SCHEMA, USER):
        if not f.is_file():
            print(f"  MISSING: {f}")
            sys.exit(2)
    for name in ("app", "app.schemas"):
        sys.modules.setdefault(name, types.ModuleType(name))

    uspec = importlib.util.spec_from_file_location("app.schemas.user", USER)
    user = importlib.util.module_from_spec(uspec)
    sys.modules["app.schemas.user"] = user
    uspec.loader.exec_module(user)

    spec = importlib.util.spec_from_file_location("app.schemas.admin_user", SCHEMA)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["app.schemas.admin_user"] = mod
    spec.loader.exec_module(mod)
    return mod, user


def main():
    mod, user = load()
    from pydantic import ValidationError

    # The real contract, asserted before anything is built on it.
    GOOD = "Sekret!23"
    check("CONTROL: _validate_password RETURNS the password it was given",
          user._validate_password(GOOD) == GOOD,
          repr(user._validate_password(GOOD)))
    try:
        user._validate_password("short")
        check("CONTROL: ...and RAISES on a bad one", False, "it returned")
    except ValueError as e:
        check("CONTROL: ...and RAISES on a bad one", True)
        check("  ...with a sentence, not the password",
              "at least 8" in str(e), str(e))

    # ── 1. A VALID PASSWORD IS ACCEPTED ───────────────────────────────────
    # The headline failure: before the fix, every valid password was refused.
    ok = None
    try:
        ok = mod.AdminUserCreate(email="new.teacher@x.ph", password=GOOD,
                                 last_name="Santos", first_name="Maria")
        check("a VALID password is accepted", True)
    except ValidationError as e:
        check("a VALID password is accepted", False,
              f"refused a good password: {e.errors()[0].get('msg')}")
    if ok is not None:
        check("  ...and the password is carried through unchanged",
              ok.password == GOOD)
        check("  ...with the names kept", ok.last_name == "Santos")

    # ── 2. EACH RULE STILL REFUSES ────────────────────────────────────────
    CASES = [
        ("too short",              "Ab!1",            "at least 8"),
        ("no uppercase",           "sekret!23",       "UPPERCASE"),
        ("no lowercase",           "SEKRET!23",       "lowercase"),
        ("no special character",   "Sekret123",       "special character"),
        ("nothing but spaces",     "         ",       "blank"),
        ("longer than bcrypt keeps", "Aa!" + "x" * 80, "too long"),
    ]
    for why, pw, needle in CASES:
        try:
            mod.AdminUserCreate(email="a@b.ph", password=pw,
                                last_name="X", first_name="Y")
            check(f"refuses a password that is {why}", False, "it was accepted")
        except ValidationError as e:
            msg = " ".join(str(x.get("msg", "")) for x in e.errors())
            check(f"refuses a password that is {why}", needle.lower() in msg.lower(),
                  f"refused, but said: {msg}")

    # ── 3. NO MESSAGE MAY EVER CONTAIN THE PASSWORD ───────────────────────
    # The property that catches this class of bug whatever shape it takes.
    # lib/api.ts shows `detail` verbatim and the dialog prints it, so any
    # message carrying the credential puts it on screen.
    SECRETS = [GOOD, "Ab!1", "sekret!23", "SEKRET!23", "Sekret123",
               "Aa!" + "x" * 80]
    for pw in SECRETS:
        try:
            mod.AdminUserCreate(email="a@b.ph", password=pw,
                                last_name="X", first_name="Y")
            continue                       # accepted: no message to leak
        except ValidationError as e:
            msg = " ".join(str(x.get("msg", "")) for x in e.errors())
            check(f"the refusal of a {len(pw)}-character password does not "
                  f"contain it",
                  pw not in msg,
                  "THE PASSWORD IS IN THE ERROR MESSAGE, and the dialog "
                  "prints that message on screen")

    # ── 4. THE OTHER FIELDS ───────────────────────────────────────────────
    for why, kwargs in [
        ("a blank surname",    dict(last_name="",  first_name="Y")),
        ("a blank first name", dict(last_name="X", first_name="")),
    ]:
        try:
            mod.AdminUserCreate(email="a@b.ph", password=GOOD, **kwargs)
            check(f"refuses {why}", False, "it was accepted")
        except ValidationError:
            check(f"refuses {why}", True)
    try:
        mod.AdminUserCreate(email="not-an-email", password=GOOD,
                            last_name="X", first_name="Y")
        check("refuses an address that is not one", False, "it was accepted")
    except ValidationError:
        check("refuses an address that is not one", True)

    # ── 5. THE EDIT BODY SENDS ONLY WHAT CHANGED ──────────────────────────
    # exclude_unset is what stops a status-only edit blanking the name, and
    # it only works if every field is genuinely optional.
    u = mod.AdminUserUpdate(status="resigned")
    sent = u.model_dump(exclude_unset=True)
    check("an edit carrying only status sends only status",
          sent == {"status": "resigned"}, str(sent))
    check("  ...so a name is never blanked by a status change",
          "last_name" not in sent and "first_name" not in sent, str(sent))
    try:
        mod.AdminUserUpdate(status="retired")
        check("refuses a status outside active/resigned", False, "accepted")
    except ValidationError:
        check("refuses a status outside active/resigned", True)
    # AdminUserUpdate must NOT carry a password: changing someone else's
    # password is a different operation with different consequences.
    check("the edit body has no password field",
          "password" not in mod.AdminUserUpdate.model_fields,
          str(list(mod.AdminUserUpdate.model_fields)))

    print()
    print(f"  {passed} passed, {len(failed)} failed")
    if failed:
        print()
        for f in failed:
            print("  FAIL  " + f)
    print()
    print("  the real admin_user.py schema, loaded from the tree by path,")
    print("  against the real _validate_password from schemas/user.py.")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
