"""
app/schemas/reference.py
========================
NEW 2026-11-14 — the three maintainable dropdown lists.

Two shapes per list, and the split is deliberate:

  * the READ shapes (`CollegeOut`, `CourseOut`, `YearLevelOut`) are what every
    signed-in teacher gets from /reference, to fill the Edit Profile and Setup
    dropdowns;
  * the WRITE shapes (`...In`) are what an administrator sends to
    /admin/reference, and they exist ONLY there.

`active` is writable; nothing here can delete. Deletion is a separate endpoint
that refuses a row anything references - see reference_service.
"""
from typing import List, Optional

from pydantic import BaseModel, field_validator

# Matches user_profiles.college, which is varchar(20). A longer code would be
# refused at save time on the teacher's screen rather than here, which is the
# wrong place to find out.
MAX_CODE_LENGTH = 20
MAX_NAME_LENGTH = 255
MAX_LABEL_LENGTH = 32
MIN_YEAR_LEVEL = 1
MAX_YEAR_LEVEL = 6


def _clean(v: str, label: str, cap: int) -> str:
    """Trim, collapse inner runs of whitespace, and refuse blank.

    The same rule the profile text fields got on 2026-11-10: a value of only
    spaces is not a name, and a stored "CAST " that looks identical to "CAST"
    on screen would never match a profile's saved code.
    """
    s = " ".join((v or "").split())
    if not s:
        raise ValueError(f"{label} cannot be blank.")
    if len(s) > cap:
        raise ValueError(f"{label} must be at most {cap} characters.")
    return s


class CollegeOut(BaseModel):
    college_id: int
    code:       str
    name:       str
    badge_bg:   str
    badge_color: str
    sort_order: int
    active:     bool
    # Only ever filled in on the ADMIN listing, where an administrator needs to
    # know what a row is holding up before switching it off. The teacher-facing
    # /reference listing leaves it None - a teacher has no business knowing how
    # many colleagues are in each college.
    in_use: Optional[int] = None

    model_config = {"from_attributes": True}


class CollegeIn(BaseModel):
    code:        str
    name:        str
    badge_bg:    Optional[str] = None
    badge_color: Optional[str] = None
    sort_order:  Optional[int] = None
    active:      Optional[bool] = None

    @field_validator("code")
    @classmethod
    def _code(cls, v: str) -> str:
        # Spaces are stripped rather than rejected, because the code is typed
        # into a narrow box and a trailing space is invisible. It is NOT
        # upper-cased: "CoEd" is the real code of a real college here, and
        # forcing case would rename it to "COED" and orphan every profile.
        return _clean(v, "Code", MAX_CODE_LENGTH)

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        return _clean(v, "Name", MAX_NAME_LENGTH)


class CourseOut(BaseModel):
    course_id:  int
    college_id: int
    name:       str
    sort_order: int
    active:     bool
    in_use:     Optional[int] = None

    model_config = {"from_attributes": True}


class CourseIn(BaseModel):
    name:       str
    sort_order: Optional[int] = None
    active:     Optional[bool] = None

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        return _clean(v, "Course name", MAX_NAME_LENGTH)


class YearLevelOut(BaseModel):
    year_level_id: int
    college_id:    int
    level:         int
    label:         str
    active:        bool
    in_use:        Optional[int] = None

    model_config = {"from_attributes": True}


class YearLevelIn(BaseModel):
    level:  int
    label:  str
    active: Optional[bool] = None

    @field_validator("level")
    @classmethod
    def _level(cls, v: int) -> int:
        # The same 1..6 bound user_profiles_year_level_check carries. A level
        # outside it could be stored here and then refused by the profile
        # table, so it is refused here first, with a sentence rather than a
        # constraint violation.
        if not MIN_YEAR_LEVEL <= v <= MAX_YEAR_LEVEL:
            raise ValueError(
                f"Year level must be between {MIN_YEAR_LEVEL} and {MAX_YEAR_LEVEL}.")
        return v

    @field_validator("label")
    @classmethod
    def _label(cls, v: str) -> str:
        return _clean(v, "Label", MAX_LABEL_LENGTH)


class CollegeLists(CollegeOut):
    """One college with both of its lists, for the teacher-facing endpoint.

    ONE REQUEST, not three. The Edit Profile and Setup screens need every
    college, every course and every year level to drive two dependent
    dropdowns, and fetching courses on each college change would put a request
    between the teacher's click and the list appearing. Everything is a handful
    of rows, so it all comes down at once and the dropdowns are instant.

    Inactive rows are NOT included here. A teacher is offered what they may
    choose today; the administrator listing is the one that shows the rest.
    """
    courses:     List["CourseOut"] = []
    year_levels: List["YearLevelOut"] = []