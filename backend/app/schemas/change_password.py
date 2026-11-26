# -*- coding: utf-8 -*-
"""
backend/app/schemas/change_password.py                           2026-11-26
============================================================================

Ms. Melanie, Recommendations page 20, requirement 2: the Change a password
pop-up - Email, Old Password, New Password, Confirm Password - with "the
same validation criteria for New Password (similar with Password Setting)".

THE SAME VALIDATION means the same function, not the same wording copied
across. _validate_password is the one place those rules live; the 2026-10-22
note on lib/password.ts records what happened when three copies of the
8-character rule drifted apart.

NOTE THE CONTRACT, because getting it wrong shipped a bug on 2026-11-25:
_validate_password RAISES ValueError on a bad password and RETURNS THE
PASSWORD on a good one. It does not return a message. So the validator below
returns its result directly, exactly as UserCreate._pw does.

CONFIRM PASSWORD IS NOT IN THIS BODY, and that is deliberate. It exists on
the screen so a teacher cannot mistype a password they cannot see, which is
a question the browser can answer the instant they finish typing. Sending
the credential twice to have the server compare it tells nobody anything new
and puts it on the wire a second time.
"""
from pydantic import BaseModel, EmailStr, field_validator

from app.schemas.user import _validate_password


class ChangePasswordRequest(BaseModel):
    email:        EmailStr
    old_password: str
    new_password: str

    # NO RULE ON old_password, on purpose - the same decision UserLogin
    # records: "The rules govern CHOOSING a password, not checking one."
    # A teacher whose existing password predates the rules must still be
    # able to type it in order to replace it.
    @field_validator("new_password")
    @classmethod
    def _new(cls, v: str) -> str:
        return _validate_password(v)


class ChangePasswordResponse(BaseModel):
    # Her requirement 3, word for word: "It will display an informational
    # message stating, 'Password has been successfully changed.'" The
    # sentence lives on the server so one place decides what success says.
    message: str = "Password has been successfully changed."