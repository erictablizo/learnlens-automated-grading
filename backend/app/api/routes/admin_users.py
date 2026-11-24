"""
app/api/routes/admin_users.py
=============================
NEW 2026-11-24 — Manage Users.  Ms. Melanie, Recommendations page 19.

    requirement 1  "Admin can create accounts, edit and delete"
    requirement 3  "For ADMIN access, insert additional Option 'Manage Users'
                    in the Side Bar."
    requirement 4  a pop-window: "Create New Account" / "List of Users"
    requirement 5  the list, with Edit and Delete and a Status of Active or
                   Resigned

REGISTER IT. One line in `backend/app/api/routes/__init__.py`, beside the
others — NOT in main.py, which names no individual router
(ROUTER-WIRING-2026-11-11.md).

THE FOURTH ADMIN ROUTER, and the reasoning is not new
------------------------------------------------------
admin.py (2026-11-13) is read-only and says so of itself. admin_reference.py
(2026-11-14) and admin_students.py (2026-11-17) each added writes in their
OWN file rather than editing it, and each wrote down why:

    "Adding the first write endpoints to it would quietly retire a documented
     guarantee inside a file nobody re-reads."

    "`_admin` IS IMPORTED, NOT RE-DECLARED ... a second copy of that logic
     here is a second thing to get wrong, and the 2026-11-12 authz regression
     came from exactly that kind of duplication."

Both hold here. `_admin` is imported. `/admin*` stays the complete, greppable
list of every place one user reaches another's data.

403, NOT 404 — `_admin` already answers that way, for the reason admin.py
gives: the endpoint's existence is not a secret.

WHY POST EXISTS AT ALL, when /api/auth/register already creates accounts
-------------------------------------------------------------------------
Because that one issues a token. `useAuth.register()` calls `setAuth()` with
it, so an administrator using the public endpoint is signed out and becomes
the teacher they just created. This endpoint creates the account and returns
no token, so the administrator keeps their session.

409 IS THE INTERESTING ANSWER on DELETE. See admin_user_service's header:
deleting a teacher who owns exams would cascade through their answer keys,
papers, pages and scores. The service refuses and names the count; this
route passes that sentence through unchanged, because the service is where
the decision is made and wording it twice is how two wordings drift.
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import User
from app.schemas.admin_user import (
    AdminUserCreate, AdminUserDeleteResponse, AdminUserRow, AdminUserUpdate,
)
from app.services import admin_user_service as svc
# The SINGLE definition of "is this caller an administrator", from the router
# that owns the question. admin.py imports nothing from here, so this cannot
# become a cycle.
from app.api.routes.admin import _admin

router = APIRouter(prefix="/admin/users", tags=["admin"])


@router.get("", response_model=List[AdminUserRow])
async def list_users(
    admin: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
):
    """Her List of Users, ordered by email.

    `exams` is on every row and is not one of her columns. It is what a
    Delete would destroy, and admin_reference.py's `in_use` makes the same
    argument: "showing the number BEFORE the click is the difference between
    a considered choice and an error message."
    """
    del admin          # the dependency IS the authorisation
    return await svc.list_users(db)


@router.post("", response_model=AdminUserRow, status_code=201)
async def create_user(
    data: AdminUserCreate,
    admin: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create a teacher account. No token is issued; the admin stays signed in."""
    del admin
    try:
        user = await svc.create_user(
            db,
            email=data.email,
            password=data.password,
            first_name=data.first_name,
            last_name=data.last_name,
        )
    except svc.DuplicateEmail as dup:
        raise HTTPException(status_code=409, detail=dup.message)

    # Read the row back the same way the list does, so the screen can drop it
    # straight into the table it came from rather than composing a second
    # shape that could disagree.
    rows = await svc.list_users(db)
    row = next((r for r in rows if r["user_id"] == user.user_id), None)
    if row is None:                       # pragma: no cover - cannot happen
        raise HTTPException(status_code=500,
                            detail="The account was created but could not be read back.")
    return row


@router.put("/{user_id}", response_model=AdminUserRow)
async def edit_user(
    user_id: int,
    data: AdminUserUpdate,
    admin: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
):
    """`exclude_unset`, so a request that sends only `status` does not blank
    the name — the 2026-11-03 year_level lesson, same as admin_reference.py."""
    try:
        user = await svc.update_user(
            db, user_id, admin.user_id,
            data.model_dump(exclude_unset=True, exclude_none=True))
    except svc.DuplicateEmail as dup:
        raise HTTPException(status_code=409, detail=dup.message)
    except svc.Refused as r:
        raise HTTPException(status_code=409, detail=r.message)
    if user is None:
        raise HTTPException(status_code=404, detail="Account not found")

    rows = await svc.list_users(db)
    row = next((r for r in rows if r["user_id"] == user_id), None)
    if row is None:                       # pragma: no cover
        raise HTTPException(status_code=404, detail="Account not found")
    return row


@router.delete("/{user_id}", response_model=AdminUserDeleteResponse)
async def remove_user(
    user_id: int,
    admin: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete an account that owns nothing. 409, with a sentence, otherwise.

    The 409 is the normal answer here, not the exceptional one: any teacher
    who has used the system owns exams, and deleting those is not what an
    administrator means by removing a person. The message says so and points
    at Resigned.
    """
    try:
        result = await svc.delete_user(db, user_id, admin.user_id)
    except svc.Refused as r:
        raise HTTPException(status_code=409, detail=r.message)
    if not result["success"]:
        raise HTTPException(status_code=404, detail=result["message"])
    return result