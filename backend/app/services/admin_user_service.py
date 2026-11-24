"""
app/services/admin_user_service.py
==================================
NEW 2026-11-24 — Manage Users.  Ms. Melanie, Recommendations page 19.

THE WHOLE POINT OF THIS FILE IS WHAT IT REFUSES
================================================
Her requirement 5 puts "Edit" and "Delete" beside every account. Traced
through models.py, DELETE on a user is not a tidy-up:

    users.user_id
      -> exams.created_by            ON DELETE CASCADE  + cascade="all, delete"
         -> answer_keys.exam_id      CASCADE
         -> exam_pages.exam_id       CASCADE
         -> test_papers.exam_id      CASCADE
            -> paper_scores.paper_id CASCADE
            -> paper_pages.paper_id  CASCADE
      -> class_lists.created_by      CASCADE -> class_list_students CASCADE
      -> user_profiles, password_resets

One click removes every exam that teacher built, every answer key, every
scanned page, every marked answer and every score — with no undo. That is
the exact hazard this codebase has written down twice and designed against
twice:

    models.py, TestPaper.student_id: "ON DELETE SET NULL, NEVER CASCADE ...
    A teacher tidying a roster would silently erase a graded exam."

    admin_students.py: "Their papers survive ... the same guarantee
    students.py gives, and the reason that FK was never a CASCADE."

SO DELETE IS REFUSED FOR ANY ACCOUNT THAT OWNS WORK, and the refusal names
the number and points at Resigned. That is not an invention: her own
requirement 5 asks for a Status of Active or Resigned ALONGSIDE Delete, and
this is what makes the pair coherent — Resigned is how a teacher leaves,
Delete is only for an account that never started.

The database is not changed to make this safe. Loosening those cascades
would be a schema change with its own blast radius, taken on purpose, not as
a side effect of adding a screen.

FOUR MORE REFUSALS, each a lock-out this screen could otherwise cause
---------------------------------------------------------------------
  * an administrator deleting their own account
  * an administrator resigning their own account
  * deleting or resigning the LAST active administrator
  * an email that already exists (409, as students.py answers for a
    duplicate number)

`_admin` is NOT re-implemented here; the router imports it from admin.py, as
admin_reference.py and admin_students.py both do.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import ClassList, Exam, User
from app.models.profile import UserProfile

# BORROWED FROM THE AUTH PATH ON PURPOSE, all four of them. Verified against
# the real auth_service.py on 2026-11-24.
#
#   hash_password   hashing must not be re-implemented here.
#   _user_by_email  the shared case-insensitive lookup. Private by name, but
#                   sharing it is the whole point: its docstring records that
#                   on 2026-11-11 register_user() and authenticate_user() each
#                   had their own `User.email ==` comparison, the 2026-09-22
#                   case-insensitivity fix landed on one of the three call
#                   sites, and the two screens then disagreed about what counts
#                   as the same account. A fourth private comparison in THIS
#                   file would be the same mistake a fourth time. It also
#                   matches the unique index on lower(email) from
#                   migrations/2026-11-11_email_case_insensitive.sql, which a
#                   lower(trim(email)) comparison of our own would not use.
#   ACTIVE/RESIGNED defined there because that is where they are enforced
#                   (apply_2026-11-24_resigned_lockout.py), and importing the
#                   other way round would be a circular import.
from app.services.auth_service import (ACTIVE, RESIGNED, _user_by_email,
                                       hash_password)

ADMIN    = "admin"
TEACHER  = "teacher"


class DuplicateEmail(Exception):
    def __init__(self, email: str):
        self.message = f"An account with the email {email} already exists."
        super().__init__(self.message)


class Refused(Exception):
    """Something the current state does not allow. The route answers 409.

    A separate type from DuplicateEmail so the route can answer 409 for both
    while the message stays the service's to write — the same split
    student_service uses for DuplicateStudent.
    """
    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


# ── reads ──────────────────────────────────────────────────────────────────

async def _exam_count(db: AsyncSession, user_id: int) -> int:
    return (await db.execute(
        select(func.count()).select_from(Exam).where(Exam.created_by == user_id)
    )).scalar_one()


async def _active_admins(db: AsyncSession, excluding: Optional[int] = None) -> int:
    """How many administrators could still sign in if `excluding` were gone.

    `status == ACTIVE` as well as the role, because a resigned administrator
    is not one who can administer. getattr-free: the column exists as of
    migrations/2026-11-24_user_status.sql, and a deploy before that migration
    is a deploy that should fail loudly rather than silently decide there are
    no administrators.
    """
    q = select(func.count()).select_from(User).where(
        User.role == ADMIN, User.status == ACTIVE)
    if excluding is not None:
        q = q.where(User.user_id != excluding)
    return (await db.execute(q)).scalar_one()


async def list_users(db: AsyncSession) -> list[dict]:
    """Her List of Users, ordered by email.

    A LEFT JOIN, not an inner one: an account created by an administrator has
    no user_profiles row until that teacher completes /setup, and the whole
    reason this screen exists is to show accounts that have done nothing yet.
    An inner join would hide exactly the rows an administrator is looking for
    — the same argument admin.py's `teachers` endpoint makes for correlated
    subqueries over GROUP BY.
    """
    n_exams = (select(func.count()).select_from(Exam)
               .where(Exam.created_by == User.user_id).scalar_subquery())

    rows = (await db.execute(
        select(User.user_id, User.email, User.role, User.status,
               UserProfile.first_name, UserProfile.last_name,
               UserProfile.college, UserProfile.course,
               n_exams.label("exams"))
        .outerjoin(UserProfile, UserProfile.user_id == User.user_id)
        .order_by(User.email)
    )).all()

    out = []
    for uid, email, role, status, first, last, college, course, exams in rows:
        name = " ".join(p for p in ((last or "").strip(), (first or "").strip()) if p)
        out.append({
            "user_id": uid,
            "email":   email,
            # None, not "" — the screen renders a dash for a profile that
            # does not exist yet, and "" would render as a blank cell that
            # looks like a fault.
            "name":    (f"{last}, {first}" if (last and first) else (name or None)),
            "college": college or None,
            "course":  course or None,
            "status":  status,
            "role":    role,
            "exams":   exams,
        })
    return out


# ── writes ─────────────────────────────────────────────────────────────────

async def create_user(db: AsyncSession, *, email: str, password: str,
                      first_name: str, last_name: str) -> User:
    """Create a teacher account. NO TOKEN IS ISSUED AND NO SESSION CHANGES.

    That is the entire reason this exists rather than reusing
    POST /api/auth/register: useAuth.register() calls setAuth() with the new
    account's token, so an administrator who used the public endpoint would
    be signed out and become the teacher they had just created.

    THE PROFILE ROW IS WRITTEN WITH NAMES ONLY, deliberately. College, course
    and year level stay unset, so `profile_complete` is false and the new
    teacher is sent to /setup on first sign-in to choose them from the
    reference lists — which is where that cascade already lives.
    """
    # STRIPPED BUT NOT LOWER-CASED, matching register_user() exactly. Its
    # comment is the reason: "Lower-casing would rewrite what the teacher
    # typed, and the unique index on lower(email) makes it unnecessary: the
    # stored spelling is hers, the matching is ours." This file used to
    # .lower() what it stored, so an account made by an administrator came out
    # spelled differently from the same account made on Register - a fifth
    # spelling rule in a system that had just been reduced to one.
    clean = (email or "").strip()
    if await _user_by_email(db, clean):
        raise DuplicateEmail(clean.lower())

    user = User(email=clean, password_hash=hash_password(password),
                role=TEACHER, status=ACTIVE)
    db.add(user)
    await db.flush()          # user_id, for the profile row below

    db.add(UserProfile(user_id=user.user_id,
                       first_name=first_name.strip(),
                       last_name=last_name.strip()))
    await db.commit()
    await db.refresh(user)
    return user


async def update_user(db: AsyncSession, user_id: int, actor_id: int,
                      changes: dict) -> Optional[User]:
    """Edit one account. Returns None when there is no such user.

    `changes` is already `model_dump(exclude_unset=True)` at the call site,
    so a request that sends only `status` does not blank the name.
    """
    user = (await db.execute(
        select(User).where(User.user_id == user_id))).scalar_one_or_none()
    if user is None:
        return None

    if "status" in changes and changes["status"] == RESIGNED:
        if user_id == actor_id:
            raise Refused(
                "You cannot resign your own account. Ask another "
                "administrator to do it.")
        if user.role == ADMIN and await _active_admins(db, excluding=user_id) == 0:
            raise Refused(
                "This is the last active administrator. Make another account "
                "an administrator first, or nobody will be able to manage "
                "users.")

    if "email" in changes and changes["email"]:
        # Same rule as create_user above and as register_user: the stored
        # spelling is the administrator's, the matching is ours. Re-casing an
        # address without changing it - "Melanie@..." to "melanie@..." - is
        # therefore a real edit that is allowed to go through, which is why
        # the comparison below is against the OTHER rows and not this one.
        clean = changes["email"].strip()
        other = await _user_by_email(db, clean)
        # ONE CONDITION, NOT TWO. This was wrapped in an outer
        # `if clean.lower() != user.email.lower():` as well, which read as
        # defensive and was in fact DEAD: _user_by_email matches on
        # lower(email), so any row it returns under that outer test is
        # necessarily a different row, and `other.user_id != user_id` could
        # never be false. Measured 2026-11-24 - deleting the exclusion changed
        # nothing the bench could see, which is how the dead branch was found.
        # Now the exclusion is the only thing standing between "this address
        # belongs to someone else" and "this is your own address, re-typed".
        if other is not None and other.user_id != user_id:
            raise DuplicateEmail(clean.lower())
        user.email = clean

    if "status" in changes and changes["status"]:
        user.status = changes["status"]

    names = {k: v for k, v in changes.items()
             if k in ("first_name", "last_name") and v}
    if names:
        profile = (await db.execute(
            select(UserProfile).where(UserProfile.user_id == user_id)
        )).scalar_one_or_none()
        if profile is None:
            # An account created before this screen existed, or one whose
            # teacher has never reached /setup. Writing the names is what the
            # administrator asked for; the rest of the profile stays unset so
            # /setup still collects it.
            profile = UserProfile(user_id=user_id)
            db.add(profile)
        for k, v in names.items():
            setattr(profile, k, v.strip())

    await db.commit()
    await db.refresh(user)
    return user


async def delete_user(db: AsyncSession, user_id: int, actor_id: int) -> dict:
    """Delete an account — ONLY when it owns nothing. See this file's header.

    Raises Refused with a sentence the screen can show as-is. The count is
    read BEFORE anything is deleted, because afterwards there is nothing left
    to count — the same ordering admin_students.py's delete uses, and for the
    same reason.
    """
    user = (await db.execute(
        select(User).where(User.user_id == user_id))).scalar_one_or_none()
    if user is None:
        return {"success": False, "user_id": user_id, "message": "No such account."}

    if user_id == actor_id:
        raise Refused("You cannot delete your own account.")

    if user.role == ADMIN and await _active_admins(db, excluding=user_id) == 0:
        raise Refused(
            "This is the last active administrator. Make another account an "
            "administrator first.")

    exams = await _exam_count(db, user_id)
    if exams:
        raise Refused(
            f"{user.email} owns {exams} exam(s). Deleting the account would "
            f"delete those exams and every answer key, test paper and score "
            f"on them, and that cannot be undone. Set Status to Resigned "
            f"instead — the account can no longer be used and all of its work "
            f"is kept.")

    lists = (await db.execute(
        select(func.count()).select_from(ClassList)
        .where(ClassList.created_by == user_id))).scalar_one()

    await db.delete(user)
    await db.commit()

    message = f"{user.email} was deleted."
    if lists:
        # Class lists are the teacher's own and mean nothing without them —
        # models.py says so — but an administrator should still be told what
        # went, rather than discovering it.
        message += (f" {lists} class list(s) went with it; no student was "
                    f"removed from the school roster.")
    return {"success": True, "user_id": user_id, "message": message}