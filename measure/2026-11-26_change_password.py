#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
measure/2026-11-26_change_password.py                             2026-11-26
============================================================================

Proves auth_service.change_password() - Ms. Melanie, Recommendations page 20,
requirements 2 and 3.

    python measure/2026-11-26_change_password.py

THIS ENDPOINT TAKES NO TOKEN. Anyone on the internet can post to it, and the
old password is the only thing authenticating the caller. So the properties
below are mostly about what it REFUSES and what it GIVES AWAY, not about the
happy path:

  * three different failures must be indistinguishable from outside, or the
    form becomes an address checker;
  * a resigned account must not be able to set a new password - that would
    be a fifth way in, beside the four closed on 2026-11-24, and the only one
    that hands over a working credential;
  * nothing it says may contain either password. That property was added to
    the schema bench on 2026-11-25 after a validator put a teacher's password
    on screen in a red box, and it belongs here for the same reason;
  * and every refusal must leave the stored hash untouched. A refusal that
    has already written is not a refusal.

Real bcrypt, real python-jose, and the REAL _validate_password from
measure/excerpt/user_password_excerpt.py - not a stub, because a stub of
that function is what produced the 2026-11-25 bug.
"""
import asyncio
import importlib.util
import sys
import types
from pathlib import Path

from sqlalchemy import (Boolean, Column, DateTime, ForeignKey, Integer,
                        String, event, func, select)
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import declarative_base

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
SERVICE = ROOT / "backend/app/services/auth_service.py"
EXCERPT = ROOT / "measure/excerpt/user_password_excerpt.py"

passed = 0
failed = []
def check(label, cond, detail=""):
    global passed
    if cond: passed += 1
    else: failed.append(f"{label}: {detail}" if detail else label)

Base = declarative_base()
ACTIVE, RESIGNED = "active", "resigned"


class User(Base):
    __tablename__ = "users"
    user_id       = Column(Integer, primary_key=True, autoincrement=True)
    email         = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role          = Column(String(16), nullable=False, server_default="teacher")
    status        = Column(String(20), nullable=False, server_default="active")


class PasswordReset(Base):
    __tablename__ = "password_resets"
    reset_id   = Column(Integer, primary_key=True, autoincrement=True)
    user_id    = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"),
                        nullable=False)
    token      = Column(String(255), unique=True, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used       = Column(Boolean, nullable=False, default=False)


def install():
    for f in (SERVICE, EXCERPT):
        if not f.is_file():
            print(f"  MISSING: {f}")
            sys.exit(2)
    for name in ("app", "app.core", "app.models", "app.services", "app.schemas"):
        sys.modules.setdefault(name, types.ModuleType(name))

    cfg = types.ModuleType("app.core.config")
    class _S:
        SECRET_KEY = "bench-only-not-a-real-key"
        ALGORITHM = "HS256"
        ACCESS_TOKEN_EXPIRE_MINUTES = 60
        RESET_TOKEN_EXPIRE_MINUTES = 30
    cfg.settings = _S()
    sys.modules["app.core.config"] = cfg

    m = types.ModuleType("app.models.models")
    m.User, m.PasswordReset = User, PasswordReset
    sys.modules["app.models.models"] = m

    # THE REAL password rules, loaded AS app.schemas.user so the function's
    # own deferred import resolves to them.
    us = importlib.util.spec_from_file_location("app.schemas.user", EXCERPT)
    um = importlib.util.module_from_spec(us)
    sys.modules["app.schemas.user"] = um
    us.loader.exec_module(um)

    spec = importlib.util.spec_from_file_location("app.services.auth_service", SERVICE)
    svc = importlib.util.module_from_spec(spec)
    sys.modules["app.services.auth_service"] = svc
    spec.loader.exec_module(svc)
    return svc


async def main():
    svc = install()
    if not hasattr(svc, "change_password"):
        print("  MISSING: auth_service.change_password is not defined.")
        print("  Run apply_2026-11-26_change_password_service.py first.")
        sys.exit(2)

    engine = create_async_engine("sqlite+aiosqlite:///:memory:")

    @event.listens_for(engine.sync_engine, "connect")
    def _fk(c, _r):
        c.execute("PRAGMA foreign_keys=ON")

    async with engine.begin() as c:
        await c.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    OLD, NEW = "Sekret!23", "Brand!New9"

    async def hash_of(db, uid):
        return (await db.execute(
            select(User.password_hash).where(User.user_id == uid))).scalar_one()

    async with Session() as db:
        act = User(email="active@dlsau.edu.ph", password_hash=svc.hash_password(OLD),
                   role="teacher", status=ACTIVE)
        res = User(email="resigned@dlsau.edu.ph", password_hash=svc.hash_password(OLD),
                   role="teacher", status=RESIGNED)
        db.add_all([act, res]); await db.commit()

        # ── CONTROL ───────────────────────────────────────────────────────
        before = await hash_of(db, act.user_id)
        check("CONTROL: the fixture's old password verifies",
              svc.verify_password(OLD, before))
        if not svc.verify_password(OLD, before):
            print("\n  ABORTED: the fixture is broken; nothing below means anything.")
            print(f"\n  {passed} passed, {len(failed) + 1} failed")
            sys.exit(1)

        # ── 1. THE HAPPY PATH ─────────────────────────────────────────────
        err = await svc.change_password(db, "active@dlsau.edu.ph", OLD, NEW)
        check("an active teacher can change their password", err is None, str(err))
        after = await hash_of(db, act.user_id)
        check("  ...the new password verifies", svc.verify_password(NEW, after))
        check("  ...and the old one no longer does",
              not svc.verify_password(OLD, after))
        u = await svc.authenticate_user(db, "active@dlsau.edu.ph", NEW)
        check("  ...and sign-in works with the new password", u is not None)
        u = await svc.authenticate_user(db, "active@dlsau.edu.ph", OLD)
        check("  ...and fails with the old one", u is None)

        # put it back, so the refusals below start from a known password
        await svc.change_password(db, "active@dlsau.edu.ph", NEW, OLD)

        # ── 2. EVERY REFUSAL LEAVES THE HASH ALONE ────────────────────────
        REFUSALS = [
            ("the wrong old password", "active@dlsau.edu.ph", "WrongPw!1", NEW),
            ("an address with no account", "nobody@dlsau.edu.ph", OLD, NEW),
            ("a new password with no uppercase", "active@dlsau.edu.ph", OLD, "brand!new9"),
            ("a new password that is too short", "active@dlsau.edu.ph", OLD, "Ab!1"),
            ("a new password equal to the old one", "active@dlsau.edu.ph", OLD, OLD),
        ]
        for why, email, old, new in REFUSALS:
            h0 = await hash_of(db, act.user_id)
            err = await svc.change_password(db, email, old, new)
            h1 = await hash_of(db, act.user_id)
            check(f"refuses {why}", err is not None, "it succeeded")
            check(f"  ...and leaves the stored password untouched", h0 == h1,
                  "THE HASH CHANGED ON A REFUSAL")

        # ── 3. THE RESIGNED GATE ──────────────────────────────────────────
        # With the CORRECT old password. This is the whole point: the four
        # gates closed on 2026-11-24 would all be undone by an endpoint that
        # let a revoked account choose a new credential.
        h0 = await hash_of(db, res.user_id)
        err = await svc.change_password(db, "resigned@dlsau.edu.ph", OLD, NEW)
        h1 = await hash_of(db, res.user_id)
        check("a RESIGNED account cannot change its password, even with the "
              "right old one", err is not None, "it changed")
        check("  ...and its stored password is untouched", h0 == h1)
        check("  ...nor can it by typing the address differently",
              await svc.change_password(db, "RESIGNED@DLSAU.edu.ph", OLD, NEW)
              is not None)

        # ── 4. NO ENUMERATION ─────────────────────────────────────────────
        a = await svc.change_password(db, "nobody@dlsau.edu.ph", OLD, NEW)
        b = await svc.change_password(db, "active@dlsau.edu.ph", "WrongPw!1", NEW)
        c = await svc.change_password(db, "resigned@dlsau.edu.ph", OLD, NEW)
        check("an unknown address and a wrong password say the SAME thing",
              a == b, f"{a!r} vs {b!r}")
        check("  ...and so does a resigned account", b == c, f"{b!r} vs {c!r}")

        # ── 5. NO MESSAGE MAY CONTAIN EITHER PASSWORD ─────────────────────
        # The 2026-11-25 lesson, applied where it belongs the second time.
        PROBES = [
            ("active@dlsau.edu.ph", "WrongPw!1", NEW),
            ("active@dlsau.edu.ph", OLD, "brand!new9"),
            ("active@dlsau.edu.ph", OLD, "Ab!1"),
            ("active@dlsau.edu.ph", OLD, OLD),
            ("nobody@dlsau.edu.ph", OLD, NEW),
        ]
        for email, old, new in PROBES:
            msg = await svc.change_password(db, email, old, new) or ""
            check(f"the refusal does not quote the old password",
                  old not in msg, "THE OLD PASSWORD IS IN THE MESSAGE")
            check(f"  ...nor the new one", new not in msg,
                  "THE NEW PASSWORD IS IN THE MESSAGE")

        # ── 6. CASE-INSENSITIVE, LIKE EVERY OTHER LOOKUP SINCE 2026-11-11 ─
        err = await svc.change_password(db, "ACTIVE@DLSAU.edu.ph", OLD, NEW)
        check("the address is matched without regard to capitalisation",
              err is None, str(err))
        await svc.change_password(db, "active@dlsau.edu.ph", NEW, OLD)

        # ── 7. OUTSTANDING RESET LINKS ARE CANCELLED ──────────────────────
        issued = await svc.create_password_reset_token(db, "active@dlsau.edu.ph")
        check("CONTROL: a reset link can be issued", issued is not None)
        link = issued[1] if issued else ""
        check("CONTROL: and it works before the change",
              await svc.verify_reset_token(db, link) is not None)
        err = await svc.change_password(db, "active@dlsau.edu.ph", OLD, NEW)
        check("CONTROL: the change itself succeeded", err is None, str(err))
        check("a reset link issued earlier stops working after a change",
              await svc.verify_reset_token(db, link) is None,
              "a link in the mailbox could still set a different password")

    await engine.dispose()

    print()
    print(f"  {passed} passed, {len(failed)} failed")
    if failed:
        print()
        for f in failed:
            print("  FAIL  " + f)
    print()
    print("  the real auth_service.py loaded from the tree by path, real")
    print("  bcrypt, and the real _validate_password - not a stub.")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    asyncio.run(main())
