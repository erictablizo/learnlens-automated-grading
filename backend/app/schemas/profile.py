# NO `import re` and NO `import unicodedata` as of 2026-11-16: both were
# only ever used by this file's own four character sets and its own
# whitespace-collapsing helper, all three of which are gone. tidy_text()
# in schemas/_text.py does the normalising now and imports them there.
from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import datetime

# NEW 2026-11-16. The character rule for a person's name now has exactly ONE
# definition in the backend, and this file borrows it instead of spelling out
# a second one. See _check_person_name() below.
from app.schemas._text import check_name_part, tidy_text


# The cap below is user_profiles.college's own varchar(20).
MAX_COLLEGE_CODE_LENGTH = 20

# REMOVED 2026-11-16: class CollegeEnum.
#
# It stopped being the gate on 2026-11-14, when the colleges became a table
# validated by reference_service.validate_selection(). It was kept that day
# only in case another module still imported the name. MEASURED 2026-11-15:
#
#     grep -rn "CollegeEnum" backend/app
#
# found three hits and all three were inside this file - the class itself and
# two comments. Nothing imported it, so it is gone rather than left as a
# frozen list of four colleges for someone to reintroduce as a type.


# Added on 2026-10-04 — only 1st..6th year exist. CVMAS reaches 6th year
# (Doctor of Veterinary Medicine); the other colleges reach 3rd. The
# per-college limit is enforced against the database by
# reference_service.validate_selection(); here we only reject values that are
# not a year level at all.
MIN_YEAR_LEVEL = 1
MAX_YEAR_LEVEL = 6


def _check_year_level(v: Optional[int]) -> Optional[int]:
    if v is None:
        return None
    if not MIN_YEAR_LEVEL <= v <= MAX_YEAR_LEVEL:
        raise ValueError(f"Year level must be between {MIN_YEAR_LEVEL} and {MAX_YEAR_LEVEL}.")
    return v


# ── Added 2026-10-22 (Doc Rubrica, after the demo), REWRITTEN 2026-11-16 ────
#
# "case sensitive (UPPERCASE, LOWERCASE, and Special Characters like not
#  letters and not numbers. Not for just password but when you're Setting up
#  your profile)"
#
# Until 2026-10-22 ProfileSetup had exactly one validator - _year - and
# NOTHING on the three text fields. first_name="123", first_name="   " and
# position="!!!!" were all accepted, stored, and rendered in the sidebar on
# every screen.
#
# WHAT 2026-11-16 CHANGED, and it is a deletion rather than an addition.
#
# This file used to carry four character sets of its own -
# _STRICT_NAME_MARKS, _STRICT_POSITION_MARKS and two relaxed variants - plus a
# shared _check_chars() to apply them, and frontend/src/lib/personName.ts
# carried four more. Eight hand-maintained definitions for one idea, which is
# how the profile set drifted away from the student set without anyone
# noticing.
#
# All three fields now delegate to check_name_part() in schemas/_text.py - the
# rule every STUDENT name already uses, and already the browser/server parity
# pair. Two consequences, both deliberate:
#
#   NOW ACCEPTED. The old profile set was " ." - letters, space, period.
#   MEASURED 2026-11-04 over 28 realistic Filipino names it refused 7,
#   including EVERY hyphenated surname: Dela Cruz-Santos, Reyes-Ramos,
#   Villanueva-Lim, Anne-Marie, O'Brien. A teacher with one of those names
#   could not complete Setup at all. "Asst. Prof." is a legal Position now too.
#
#   NOW REFUSED. The old position set allowed DIGITS, with the reason written
#   down: "Philippine academic ranks are written both ways ('Instructor II',
#   'Teacher 1')". Grace chose the narrower reading on 2026-11-16 - no special
#   characters AND no numbers - so "Teacher 1" is refused. "Instructor II" is
#   unaffected; Roman numerals are letters.
#
# THE CAPS STAY HERE. They are the one thing about these fields that is not
# shared: check_name_part's own cap is 255, the student column, while
#     user_profiles.first_name   character varying(100)
#     user_profiles.last_name    character varying(100)
#     user_profiles."position"   character varying(255)
#
# frontend/src/lib/personName.ts carries the same rules in the same order and
# the same words. Change one, change the other.
MAX_NAME_LENGTH = 100
MAX_POSITION_LENGTH = 255


def _tidy(v: str) -> str:
    """Kept as an alias, not a second implementation - it is tidy_text() from
    schemas/_text.py, which personName.ts mirrors as tidyText()."""
    return tidy_text(v)


def _check_person_name(v: Optional[str], label: str,
                       required: bool = False) -> Optional[str]:
    """One name part of a TEACHER's own name.

    `required` is NEW 2026-11-16. It is NOT used by ProfileSetup - see the
    note on that class - and exists so the rule and its sentence have one
    home when a caller does want it.
    """
    if v is None:
        return None if not required else _raise_required(label)
    s = _tidy(v)
    if not s:
        return None if not required else _raise_required(label)
    # The CAP IS CHECKED FIRST and locally: check_name_part's own cap is 255.
    if len(s) > MAX_NAME_LENGTH:
        raise ValueError(f"{label} must be at most {MAX_NAME_LENGTH} characters.")
    return check_name_part(s, label)


def _check_position(v: Optional[str], required: bool = False) -> Optional[str]:
    if v is None:
        return None if not required else _raise_required("Position")
    s = _tidy(v)
    if not s:
        return None if not required else _raise_required("Position")
    if len(s) > MAX_POSITION_LENGTH:
        raise ValueError(f"Position must be at most {MAX_POSITION_LENGTH} characters.")
    # comma_hint=False: a comma is still REFUSED here, but with the general
    # sentence. The name hint talks about surname/first-name boxes, which do
    # not exist on this field.
    return check_name_part(s, "Position", comma_hint=False)


def _raise_required(label: str):
    raise ValueError(f"{label} is required.")


class ProfileSetup(BaseModel):
    """The PUT /profile body.

    EVERY FIELD STAYS OPTIONAL HERE, and that is not an oversight in a change
    whose brief was "validation for all fields if blank".

    Grace's words were "for setup and edit" - the two FORMS - and those two
    screens now refuse to submit a blank field, with the asterisks to say so.
    Making the model itself required would be a stronger rule, but it would
    also break any PUT that sends a subset, and update_profile() is written
    to leave an omitted field alone. Changing both at once, three weeks before
    a defence, on a model whose service I have not read, is the trade I am
    not making.

    HONEST LIMIT, recorded rather than hidden: a request made outside those
    two screens can still store a blank name. The CHARACTER rules below are
    enforced here for everyone; the required-ness is enforced by the forms.
    """

    first_name: Optional[str] = None
    last_name:  Optional[str] = None
    # CHANGED 2026-11-14 - was Optional[CollegeEnum].
    #
    # The colleges are a TABLE now (migrations/2026-11-14_reference_lists.sql),
    # maintained by an administrator on the Admin page. An enum frozen in
    # September cannot express that: a college added this morning would be
    # refused here, by pydantic, with a 422 - before any of the new code ran.
    #
    # The real check has not gone away, it has MOVED. update_profile() calls
    # reference_service.validate_selection(), which asks the database whether
    # this college exists and is active, and does the same for the course and
    # the year level. That is strictly stronger than the enum: it also catches
    # a course that is not listed under the chosen college.
    college:    Optional[str] = None
    course:     Optional[str] = None
    position:   Optional[str] = None
    year_level: Optional[int] = None     # Added on 2026-10-04

    @field_validator("year_level")
    @classmethod
    def _year(cls, v: Optional[int]) -> Optional[int]:
        return _check_year_level(v)

    # NEW 2026-11-14. Shape only - "is this a plausible code at all" - not
    # membership, which needs the database and happens in update_profile().
    #
    # The cap is 20 because user_profiles.college is varchar(20). Without it a
    # longer code reaches PostgreSQL and comes back as a driver error instead
    # of a sentence a teacher can read.
    @field_validator("college")
    @classmethod
    def _college(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = " ".join(str(v).split())
        if not s:
            return None
        if len(s) > MAX_COLLEGE_CODE_LENGTH:
            raise ValueError(
                f"College code must be at most {MAX_COLLEGE_CODE_LENGTH} characters.")
        return s

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
    course:           Optional[str] = None
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