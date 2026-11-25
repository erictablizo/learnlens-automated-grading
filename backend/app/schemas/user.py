from pydantic import BaseModel, EmailStr, field_validator
from datetime import datetime
from typing import Optional


"""
backend/app/schemas/user.py  -  PARTIAL, FOR MEASUREMENT ONLY

NOT the whole file. This is a VERBATIM excerpt of the password rules from
Grace's real backend/app/schemas/user.py, read 2026-11-25, kept here so that
measure/2026-11-25_admin_user_schema.py can exercise THE REAL FUNCTION rather
than a stub of it.

A stub is exactly what went wrong: admin_user.py was written against a
believed contract - "returns a message" - when the real one raises on failure
and returns the password on success. A harness built on the same belief would
have agreed with the bug.

Her file is the authority. The classes it also contains (UserCreate,
UserLogin, Token, the reset-password schemas) are NOT here, because nothing
under test imports them. If the rules below diverge from hers, this harness
cannot see it - the same caveat the model mirrors carry.
"""

BCRYPT_MAX_PASSWORD_BYTES = 72
MIN_PASSWORD_LENGTH = 8
REQUIRE_DIGIT = False


def _validate_password(v: str) -> str:
    """VERBATIM from her file. Note the contract, which is the whole point:
    it RAISES ValueError on a bad password and RETURNS THE PASSWORD on a
    good one. It never returns a message."""
    if not v.strip():
        raise ValueError("Password cannot be blank.")
    if len(v) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters.")
    if len(v.encode("utf-8")) > BCRYPT_MAX_PASSWORD_BYTES:
        raise ValueError(
            f"Password is too long to store securely. Please use a shorter one - "
            f"up to {BCRYPT_MAX_PASSWORD_BYTES} plain letters or digits, and fewer "
            f"if it contains accented characters or emoji (those count as several "
            f"each)."
        )
    if not any(c.islower() for c in v):
        raise ValueError("Password must contain at least one lowercase letter (a-z).")
    if not any(c.isupper() for c in v):
        raise ValueError("Password must contain at least one UPPERCASE letter (A-Z).")
    if not any((not c.isalnum()) and (not c.isspace()) for c in v):
        raise ValueError(
            "Password must contain at least one special character - anything "
            "that is not a letter or a number, such as ! ? @ # $ % & * - _ . "
            "A space does not count."
        )
    if REQUIRE_DIGIT and not any(c.isdigit() for c in v):
        raise ValueError("Password must contain at least one number (0-9).")
    return v


class UserCreate(BaseModel):
    email: EmailStr
    password: str

    # FIX 2026-10-22: Register had NO password rule at all, so {"password":"ab"}
    # returned 201 and then logged in, while ResetPasswordRequest below rejected
    # anything under 8 characters "same rule as Register". Same rule, same
    # wording, one function, both paths.
    @field_validator("password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return _validate_password(v)


class UserLogin(BaseModel):
    email: EmailStr
    password: str
    # NOTE: there is deliberately NO validator here and there never should be.
    # The rules govern CHOOSING a password, not checking one. Every existing
    # account keeps working; those users just cannot SET an unacceptable
    # password again.


class UserResponse(BaseModel):
    user_id: int
    email: str
    created_at: datetime

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token:     str
    token_type:       str = "bearer"
    user:             UserResponse
    profile_complete: bool = False   # ← tells frontend whether to redirect to /setup


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


#  Recently added on 2026-09-22:
class ForgotPasswordResponse(BaseModel):          # NEW 2026-09-22
    message: str
    email_sent: bool                              # False = DEV MODE (SMTP not configured)
    # Added on 2026-09-29: in DEV MODE only, the reset link itself, so the
    # "Check your email!" screen can show it instead of telling you to copy it
    # out of the uvicorn terminal. None whenever the email really was sent, and
    # whenever SHOW_DEV_RESET_LINK is False. See the warning in core/config.py.
    dev_reset_url: Optional[str] = None


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    # CHANGED 2026-10-22: this used to be an 8-character check of its own,
    # named _min_len, with a comment claiming it was the "same rule as
    # Register" - which was not true, because Register had no rule. It now
    # calls the one shared function above, so the two can no longer disagree.
    @field_validator("new_password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return _validate_password(v)