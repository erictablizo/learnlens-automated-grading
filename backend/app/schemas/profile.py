import re
import unicodedata
from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import datetime
from enum import Enum
 
 
class CollegeEnum(str, Enum):
    CVMAS = "CVMAS"
    CBMA  = "CBMA"
    CoEd  = "CoEd"
    CAST  = "CAST"


# Added on 2026-10-04 — only 1st..6th year exist. CVMAS reaches 6th year
# (Doctor of Veterinary Medicine); the other colleges reach 3rd. The
# per-college limit is enforced in the UI, which knows the college; here we
# only reject values that are not a year level at all.
MIN_YEAR_LEVEL = 1
MAX_YEAR_LEVEL = 6


def _check_year_level(v: Optional[int]) -> Optional[int]:
    if v is None:
        return None
    if not MIN_YEAR_LEVEL <= v <= MAX_YEAR_LEVEL:
        raise ValueError(f"Year level must be between {MIN_YEAR_LEVEL} and {MAX_YEAR_LEVEL}.")
    return v


# ── Added on 2026-10-22 (Doc Rubrica, after the demo) ───────────────────────
# "case sensitive (UPPERCASE, LOWERCASE, and Special Characters like not
#  letters and not numbers.  Not for just password but when you're Setting up
#  your profile)"
#
# Until today ProfileSetup had exactly one validator - _year, added on 4 Oct -
# and NOTHING on the three text fields. first_name="123", first_name="   " and
# position="!!!!" were all accepted, stored, and then rendered in the sidebar
# on every screen of the system. This is the same "strip before you test for
# blank" rule schemas/exam.py and schemas/paper.py got on 1 Oct, plus the
# character classes she named.
#
# The caps are from learnlens_schema.sql, not from taste:
#     user_profiles.first_name   character varying(100)
#     user_profiles.last_name    character varying(100)
#     user_profiles."position"   character varying(255)
#
# frontend/src/lib/personName.ts carries the same rules in the same order and
# the same words. Change one, change the other.
MAX_NAME_LENGTH = 100
MAX_POSITION_LENGTH = 255

# str.isalpha() is True for letters in ANY alphabet - "N", "Ñ", "e", "é" -
# and False for "1" and "@". A NAME may also hold the four marks that appear in
# real names: O'Brien, Dela Cruz-Santos, Ben R., "Tablizo, Eric". Digits are
# NOT allowed in a name. A POSITION may also hold digits, because Philippine
# academic ranks are written both ways ("Instructor II", "Teacher 1"), plus
# & / ( ) for "Dean & Professor" and "Professor (Part-time)".
_NAME_MARKS = " '’.,-"
_POSITION_MARKS = " '’.,&/()-"


def _tidy(v: str) -> str:
    """Collapse runs of whitespace and trim.  NFC so an accent typed as a
    combining mark counts as one character - the same thing tidyName() does in
    personName.ts."""
    return unicodedata.normalize("NFC", re.sub(r"\s+", " ", v or "")).strip()


def _check_chars(v: str, label: str, marks: str, digits_ok: bool, cap: int) -> Optional[str]:
    """Shared by the name and position rules so they cannot drift apart.

    A BLANK value is NOT an error - it means "not filled in yet", which
    "Skip for now" on /setup relies on. It becomes None instead of being
    stored as "   ". Required-ness stays where it already is: the two forms,
    and profile_complete."""
    v = _tidy(v)
    if not v:
        return None
    if len(v) > cap:
        raise ValueError(f"{label} must be at most {cap} characters.")
    if not any(c.isalpha() for c in v):
        raise ValueError(f"{label} must contain at least one letter.")
    ok = (lambda c: c.isalnum()) if digits_ok else (lambda c: c.isalpha())
    bad = sorted({c for c in v if not ok(c) and c not in marks})
    if bad:
        allowed = ("letters, numbers, spaces, and ' - . , & / ( ) only."
                   if digits_ok else "letters, spaces, and ' - . , only.")
        shown = ", ".join(f'"{c}"' for c in bad)
        raise ValueError(f"{label} cannot contain {shown}. Use {allowed}")
    return v


def _check_person_name(v: Optional[str], label: str) -> Optional[str]:
    return None if v is None else _check_chars(v, label, _NAME_MARKS, False,
                                               MAX_NAME_LENGTH)


def _check_position(v: Optional[str]) -> Optional[str]:
    return None if v is None else _check_chars(v, "Position", _POSITION_MARKS,
                                               True, MAX_POSITION_LENGTH)
 
 
class ProfileSetup(BaseModel):
    first_name: Optional[str] = None
    last_name:  Optional[str] = None
    college:    Optional[CollegeEnum] = None
    course:     Optional[str] = None     # ← new
    position:   Optional[str] = None
    year_level: Optional[int] = None     # Added on 2026-10-04

    @field_validator("year_level")
    @classmethod
    def _year(cls, v: Optional[int]) -> Optional[int]:
        return _check_year_level(v)

    # Added on 2026-10-22 — the first rules these three fields have ever had.
    @field_validator("first_name")
    @classmethod
    def _first(cls, v: Optional[str]) -> Optional[str]:
        return _check_person_name(v, "First name")

    @field_validator("last_name")
    @classmethod
    def _last(cls, v: Optional[str]) -> Optional[str]:
        return _check_person_name(v, "Last name")

    @field_validator("position")
    @classmethod
    def _position(cls, v: Optional[str]) -> Optional[str]:
        return _check_position(v)
 
 
class ProfileResponse(BaseModel):
    profile_id:       int
    user_id:          int
    first_name:       Optional[str] = None
    last_name:        Optional[str] = None
    college:          Optional[str] = None
    course:           Optional[str] = None    # ← new
    position:         Optional[str] = None
    year_level:       Optional[int] = None    # Added on 2026-10-04
    avatar_path:      Optional[str] = None
    profile_complete: bool
    created_at:       datetime
    # Added on 2026-10-01 (Edit Profile): the avatar file is always saved under
    # the SAME name (user_<id>.jpg), so after changing the photo the browser
    # would keep showing the cached old one. The frontend appends this as a
    # cache-busting query (?v=…), which changes whenever the profile is saved.
    updated_at:       Optional[datetime] = None
 
    model_config = {"from_attributes": True}