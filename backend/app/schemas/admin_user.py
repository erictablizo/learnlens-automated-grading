"""
app/schemas/admin_user.py
=========================
NEW 2026-11-24 — Manage Users.

    Ms. Melanie, Recommendations page 19:
      requirement 1  "Admin can create accounts, edit and delete"
      requirement 4  a pop-window: "Create New Account" / "List of Users"
      requirement 5  "It will show the list of Users with the following info
                      below.  Note: Default Status value is <Active>
                      Two Options the side: 'Edit' and 'Delete' Buttons
                      Status: Active / Resigned"
      her columns    No. | Email Add | Name | College | Course/Program | Status

ITS OWN FILE, not added to schemas/admin.py, for the reason that file gives
for itself: "READ-ONLY, deliberately ... Widening that is a separate
decision, taken on purpose, not a side effect of adding a list screen."
admin_reference.py and admin_students.py each took that route on 2026-11-14
and 2026-11-17 with their own schema modules. This is the third.

WHAT THE CREATE FORM COLLECTS, and why it stops there
------------------------------------------------------
Email, password, first and last name. NOT college, course or year level.

Her list has a Name column, and an administrator's list of accounts reading
"grtablizo@gmail.com | — | — | —" is useless on the one screen she asked for.
Name is also the field an administrator actually knows at creation.

College and Course are left to the teacher at /setup because they CASCADE —
the course options depend on the college, both come from the reference lists
an administrator maintains on /admin, and rebuilding that pair here would be
a third copy of a dropdown that /setup and Edit Profile already have. Writing
only the names also leaves `profile_complete` false, so the new teacher still
lands on /setup and finishes college, course, year level and position
themselves, which is where those four already belong.

So the list shows a dash under College and Course until that teacher signs in
once. That is honest, and visibly different from a fault.
"""
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

# THE ONE NAME THIS FILE DOES NOT KNOW. The password rule lives in the
# existing auth path and must not be written a second time here — the
# 2026-10-22 note on lib/password.ts records what happened when three copies
# of the 8-character rule drifted apart. If this symbol is called something
# else, THIS IS THE SINGLE LINE TO CHANGE:
from app.schemas.user import _validate_password

ACTIVE   = "active"
RESIGNED = "resigned"
STATUSES = (ACTIVE, RESIGNED)


class AdminUserRow(BaseModel):
    """One row of her List of Users.

    `name`, `college` and `course` are Optional because an account created by
    an administrator has no profile until that teacher completes /setup. The
    screen renders a dash; it does not render "None".
    """
    user_id:  int
    email:    str
    name:     Optional[str] = None
    college:  Optional[str] = None
    course:   Optional[str] = None
    status:   str
    # Not in her column list, and included anyway: an administrator deciding
    # whether to resign an account needs to know whether it is the last
    # administrator. The screen can show it quietly.
    role:     str
    # What a Delete would destroy. Read BEFORE the click, for the same reason
    # admin_reference.py computes `in_use` per row: "showing the number
    # BEFORE the click is the difference between a considered choice and an
    # error message."
    exams:    int


class AdminUserCreate(BaseModel):
    email:      EmailStr
    password:   str
    last_name:  str = Field(min_length=1, max_length=255)
    first_name: str = Field(min_length=1, max_length=255)

    @field_validator("password")
    @classmethod
    def _password(cls, v: str) -> str:
        msg = _validate_password(v)
        if msg:
            raise ValueError(msg)
        return v


class AdminUserUpdate(BaseModel):
    """Everything optional — `exclude_unset` at the call site.

    The 2026-11-03 year_level note is the reason: a request that sends only
    `status` must not blank the name.
    """
    email:      Optional[EmailStr] = None
    last_name:  Optional[str] = Field(default=None, min_length=1, max_length=255)
    first_name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    status:     Optional[str] = None

    @field_validator("status")
    @classmethod
    def _status(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        s = v.strip().lower()
        if s not in STATUSES:
            raise ValueError(f"Status must be one of: {', '.join(STATUSES)}.")
        return s


class AdminUserDeleteResponse(BaseModel):
    success: bool
    user_id: int
    message: str