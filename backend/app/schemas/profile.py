from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from enum import Enum
 
 
class CollegeEnum(str, Enum):
    CVMAS = "CVMAS"
    CBMA  = "CBMA"
    CoEd  = "CoEd"
    CAST  = "CAST"
 
COLLEGE_LABELS = {
    "CVMAS": "College of Veterinary Medicine and Agricultural Sciences (CVMAS)",
    "CBMA":  "College of Business, Management, and Accountancy (CBMA)",
    "CoEd":  "College of Education (CoEd)",
    "CAST":  "College of Arts, Sciences and Technology (CAST)",
}
 
 
class ProfileSetup(BaseModel):
    first_name: Optional[str] = None
    last_name:  Optional[str] = None
    college:    Optional[CollegeEnum] = None
    department: Optional[str] = None
    position:   Optional[str] = None
 
 
class ProfileResponse(BaseModel):
    profile_id:       int
    user_id:          int
    first_name:       Optional[str] = None
    last_name:        Optional[str] = None
    college:          Optional[str] = None
    department:       Optional[str] = None
    position:         Optional[str] = None
    avatar_path:      Optional[str] = None
    profile_complete: bool
    created_at:       datetime
 
    model_config = {"from_attributes": True}