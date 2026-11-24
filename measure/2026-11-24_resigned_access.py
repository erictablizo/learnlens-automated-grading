#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
measure/2026-11-24_resigned_access.py                             2026-11-24
============================================================================

Asks one question of the REAL backend/app/services/auth_service.py:

    does Status = Resigned actually stop the account being used?

It matters because admin_user_service.delete_user() refuses to delete a
teacher who owns exams and tells the administrator, on screen:

    "Set Status to Resigned instead - the account can no longer be used
     and all of its work is kept."

That sentence is a CLAIM ABOUT THE SYSTEM, made to the person deciding
whether a teacher keeps access. If sign-in ignores `status`, the claim is
false, the administrator believes access was revoked, and the teacher can
still log in. A claim gets checked, and a claim shown to a user gets checked
hardest.

    python measure/2026-11-24_resigned_access.py

Loads auth_service.py from the tree by path. app.core.config and
app.models.models are stubbed - settings and the ORM, not the logic under
test. bcrypt and python-jose are the real libraries, so hash_password and
create_access_token are the real ones.

CAVEAT RECORDED: User/PasswordReset here are MIRRORED from models.py plus the
2026-11-24 status column. A divergence between the mirror and models.py is a
divergence this harness cannot see.
"""
import asyncio
import importlib.util
import sys
import types
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import (Boolean, Column, DateTime, Integer, String, ForeignKey,
                        CheckConstraint, event, func, select)
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import declarative_base

# ── BYTECODE IS A MEASUREMENT HAZARD IN THIS BENCH ─────────────────────────
# See measure/2026-11-24_admin_users.py for the measurement that produced this
# block: a module loaded by path is byte-compiled, and a same-length mutation
# plus an mtime-preserving restore makes CPython reuse bytecode that does not
# match the source in front of it.
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

ROOT = Path(__file__).resolve().parent.parent
SERVICE = ROOT / "backend/app/services/auth_service.py"

passed = 0
failed = []
def check(label, cond, detail=""):
    global passed
    if cond: passed += 1
    else: failed.append(f"{label}: {detail}" if detail else label)

Base = declarative_base()

ACTIVE, RESIGNED = "active", "resigned"


class User(Base):
    """Mirrors models.py User, plus the 2026-11-24 status column."""
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('teacher', 'admin')", name="users_role_check"),
        CheckConstraint("status IN ('active', 'resigned')", name="ck_users_status"),
    )
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


def install_stubs():
    if not SERVICE.is_file():
        print(f"  MISSING: {SERVICE}")
        sys.exit(2)

    for name in ("app", "app.core", "app.models", "app.services"):
        sys.modules.setdefault(name, types.ModuleType(name))

    cfg = types.ModuleType("app.core.config")
    class _Settings:
        SECRET_KEY = "bench-only-not-a-real-key"
        ALGORITHM = "HS256"
        ACCESS_TOKEN_EXPIRE_MINUTES = 60
        RESET_TOKEN_EXPIRE_MINUTES = 30
    cfg.settings = _Settings()
    sys.modules["app.core.config"] = cfg

    m = types.ModuleType("app.models.models")
    m.User, m.PasswordReset = User, PasswordReset
    sys.modules["app.models.models"] = m

    spec = importlib.util.spec_from_file_location(
        "app.services.auth_service", SERVICE)
    svc = importlib.util.module_from_spec(spec)
    sys.modules["app.services.auth_service"] = svc
    spec.loader.exec_module(svc)
    return svc


async def main():
    svc = install_stubs()

    engine = create_async_engine("sqlite+aiosqlite:///:memory:")

    @event.listens_for(engine.sync_engine, "connect")
    def _fk(dbapi_conn, _rec):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    async with engine.begin() as c:
        await c.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    PW = "Sekret!23"

    async with Session() as db:
        act = User(email="active@dlsau.edu.ph",
                   password_hash=svc.hash_password(PW),
                   role="teacher", status=ACTIVE)
        res = User(email="resigned@dlsau.edu.ph",
                   password_hash=svc.hash_password(PW),
                   role="teacher", status=RESIGNED)
        adm = User(email="resigned.admin@dlsau.edu.ph",
                   password_hash=svc.hash_password(PW),
                   role="admin", status=RESIGNED)
        db.add_all([act, res, adm]); await db.commit()

        # ── CONTROLS FIRST. If an ACTIVE teacher cannot sign in, every
        #    refusal below would be measuring a broken fixture, not a guard.
        u = await svc.authenticate_user(db, "active@dlsau.edu.ph", PW)
        check("CONTROL: an ACTIVE teacher signs in", u is not None,
              "the fixture itself is broken; nothing below means anything")
        if u is None:
            print(f"\n  {passed} passed, {len(failed)} failed")
            for f in failed:
                print("  FAIL  " + f)
            sys.exit(1)

        u = await svc.authenticate_user(db, "active@dlsau.edu.ph", "WrongPw!1")
        check("CONTROL: the wrong password is still refused", u is None,
              "authentication is not checking the password at all")

        # ── 1. THE CLAIM ON SCREEN ────────────────────────────────────────
        u = await svc.authenticate_user(db, "resigned@dlsau.edu.ph", PW)
        check("a RESIGNED teacher cannot sign in", u is None,
              "signed in as a resigned account - so the sentence "
              "admin_user_service shows the administrator "
              "('the account can no longer be used') is FALSE")

        u = await svc.authenticate_user(db, "RESIGNED@DLSAU.edu.ph", PW)
        check("  ...nor by typing the address differently", u is None,
              "the case-insensitive lookup found the resigned account "
              "and let it in")

        u = await svc.authenticate_user(db, "resigned.admin@dlsau.edu.ph", PW)
        check("a RESIGNED administrator cannot sign in", u is None,
              "a resigned admin signed in, so _active_admins' premise that "
              "'a resigned administrator is not one who can administer' "
              "is FALSE")

        # ── 2. THE TOKEN ALREADY IN THEIR BROWSER ─────────────────────────
        # Resigning is revocation. A token issued before it stays valid for
        # ACCESS_TOKEN_EXPIRE_MINUTES, so without this the teacher keeps full
        # access for up to an hour after the administrator believes it ended.
        tok_res = svc.create_access_token({"sub": str(res.user_id)})
        u = await svc.get_current_user(db, tok_res)
        check("a token issued BEFORE resigning stops working", u is None,
              "the resigned teacher's existing session still resolves, so "
              "revocation does not take effect until the token expires")

        tok_act = svc.create_access_token({"sub": str(act.user_id)})
        u = await svc.get_current_user(db, tok_act)
        check("CONTROL: an ACTIVE teacher's token still resolves",
              u is not None and u.user_id == act.user_id,
              "the status check rejected an active account too")

        # ── 3. FORGOT PASSWORD ────────────────────────────────────────────
        # Without this, a resigned teacher can set a new password. They still
        # cannot sign in once (1) holds, so this is defence in depth rather
        # than the main gate - but issuing a working reset link to a revoked
        # account is a sentence the Forgot Password screen should not be
        # saying either.
        out = await svc.create_password_reset_token(db, "resigned@dlsau.edu.ph")
        check("a RESIGNED teacher gets no password-reset link", out is None,
              "a reset link was issued to a revoked account")

        out = await svc.create_password_reset_token(db, "active@dlsau.edu.ph")
        check("CONTROL: an ACTIVE teacher still gets one",
              out is not None and out[1],
              "Forgot Password is now broken for everybody")

        # ── 4. THE LINK ALREADY IN THEIR MAILBOX ──────────────────────────
        # The order matters: the link is issued while the account is still
        # active, and only then is it resigned. create_password_reset_token
        # cannot retract a link it has already sent, so refusing to issue new
        # ones does not close this on its own.
        later = User(email="quits.later@dlsau.edu.ph",
                     password_hash=svc.hash_password(PW),
                     role="teacher", status=ACTIVE)
        db.add(later); await db.commit()

        issued = await svc.create_password_reset_token(db, "quits.later@dlsau.edu.ph")
        check("CONTROL: the link is issued while still active",
              issued is not None, "the fixture for section 4 is broken")
        link = issued[1] if issued else ""

        ok = await svc.verify_reset_token(db, link)
        check("CONTROL: and the link works while still active", bool(ok), str(ok))

        later.status = RESIGNED
        await db.commit()

        done = await svc.reset_password(db, link, "BrandNew!42")
        check("a link issued BEFORE resigning cannot set a new password",
              done is False,
              "the resigned teacher set a new password with a link that was "
              "already in their mailbox")

        # and the password must be unchanged, not merely the call refused
        fresh = (await db.execute(select(User).where(
            User.user_id == later.user_id))).scalar_one()
        check("  ...and the stored password is untouched",
              svc.verify_password(PW, fresh.password_hash),
              "reset_password returned False but had already written the hash")

    await engine.dispose()

    # ── 5. THE CLAIM AND ITS ENFORCEMENT MUST SHIP TOGETHER ───────────────
    # admin_user_service.py promises the administrator, in a sentence shown on
    # screen, that a resigned account "can no longer be used". auth_service.py
    # is what makes that true. They are two files, and nothing stops a later
    # edit from removing the gates while leaving the promise on the screen -
    # which is precisely the state this bench was written to catch, because it
    # was the state the system was in. So the promise is checked against its
    # enforcement, not just the enforcement.
    admin_svc = ROOT / "backend/app/services/admin_user_service.py"
    if admin_svc.is_file():
        promise = admin_svc.read_text(encoding="utf-8")
        claims = "can no longer be used" in promise
        enforced = SERVICE.read_text(encoding="utf-8")
        gates = enforced.count("status != ACTIVE") + enforced.count("User.status == ACTIVE")
        check("the on-screen promise is backed by gates in auth_service",
              (not claims) or gates >= 4,
              f'admin_user_service tells the administrator the account "can no '
              f'longer be used", but auth_service has only {gates} status '
              f'gate(s) - the sentence on the screen is not true')
    else:
        check("the on-screen promise is backed by gates in auth_service", True)

    print()
    print(f"  {passed} passed, {len(failed)} failed")
    if failed:
        print()
        for f in failed:
            print("  FAIL  " + f)
    print()
    print("  the real auth_service.py, loaded from the tree by path;")
    print("  real bcrypt and python-jose; models mirrored from models.py.")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    asyncio.run(main())
