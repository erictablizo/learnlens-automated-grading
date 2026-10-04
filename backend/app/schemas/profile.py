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