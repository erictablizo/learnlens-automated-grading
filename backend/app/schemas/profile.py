from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from enum import Enum
 
 
class CollegeEnum(str, Enum):
    CVMAS = "CVMAS"
    CBMA  = "CBMA"
    CoEd  = "CoEd"
    CAST  = "CAST"
 
 
class ProfileSetup(BaseModel):
    first_name: Optional[str] = None
    last_name:  Optional[str] = None
    college:    Optional[CollegeEnum] = None
    course:     Optional[str] = None     # ← new
    position:   Optional[str] = None
 
 
class ProfileResponse(BaseModel):
    profile_id:       int
    user_id:          int
    first_name:       Optional[str] = None
    last_name:        Optional[str] = None
    college:          Optional[str] = None
    course:           Optional[str] = None    # ← new
    position:         Optional[str] = None
    avatar_path:      Optional[str] = None
    profile_complete: bool
    created_at:       datetime
 
    model_config = {"from_attributes": True}