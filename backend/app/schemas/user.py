from pydantic import BaseModel, EmailStr, field_validator
from datetime import datetime
from typing import Optional


# ── Password rules ──────────────────────────────────────────────────────────
# FIX 2026-10-22 (Doc Rubrica, after the demo): "case sensitive (UPPERCASE,
# LOWERCASE, and Special Characters like not letters and not numbers)".
#
# Before this file was changed there was NO password rule on Register at all -
# UserCreate was two bare fields - and the only rule anywhere was an 8-character
# minimum on ResetPasswordRequest, whose comment said "same rule as Register"
# when Register had none. So {"email": "...", "password": "ab"} returned 201 and
# then logged in.
#
# bcrypt hashes AT MOST THE FIRST 72 BYTES of a password and throws the rest
# away without a word, so a 100-character passphrase logs in with just its
# first 72 characters. The honest fix for a system that already has bcrypt
# hashes in the database is to refuse a password we cannot store in full,
# rather than pre-hashing (which would invalidate every existing password) or
# silently truncating. The limit is in BYTES, not characters, because that is
# what bcrypt counts: an accented letter costs 2 and an emoji 4.
BCRYPT_MAX_PASSWORD_BYTES = 72

# Both rules live here so Register and Reset Password can never drift apart.
MIN_PASSWORD_LENGTH = 8

# She asked for uppercase, lowercase and a special character - NOT a digit.
# This is here so the decision is visible and reversible in one place rather
# than argued about later. Flip it here AND in frontend/src/lib/password.ts;
# nothing else needs to know.
REQUIRE_DIGIT = False


def _validate_password(v: str) -> str:
    # A password of nothing but spaces passes a length test ("        " is 8
    # characters). Every other text field in LearnLens strips before it tests
    # for blank; this one must too. The password itself is NOT stripped - that
    # would change what existing users have to type - it is only refused when
    # there is nothing but whitespace in it.
    if not v.strip():
        raise ValueError("Password cannot be blank.")
    if len(v) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters.")
    if len(v.encode("utf-8")) > BCRYPT_MAX_PASSWORD_BYTES:
        # The limit is counted in BYTES (above) but the message must not say
        # "72 characters": a 19-character password of emoji is 76 bytes, and a
        # teacher who can see 19 characters on screen should not be told they
        # typed more than 72.
        raise ValueError(
            f"Password is too long to store securely. Please use a shorter one - "
            f"up to {BCRYPT_MAX_PASSWORD_BYTES} plain letters or digits, and fewer "
            f"if it contains accented characters or emoji (those count as several "
            f"each)."
        )

    # The three character classes. These run AFTER the structural limits above,
    # so a teacher is told "too long" before being told "needs a capital".
    # .islower() / .isupper() / .isalnum() are Unicode-aware, so a password in
    # Filipino or with accents is judged the same way: "Ñ" is an uppercase
    # letter, "ñ" a lowercase one. Whitespace is NOT a special character - a
    # space is invisible to the person typing it.
    #
    # frontend/src/lib/password.ts carries the same rules in the same order and
    # the same words. Change one, change the other.
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