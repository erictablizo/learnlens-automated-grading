from pydantic import BaseModel, field_validator
from datetime import datetime
from typing import Optional
 
 
COLLEGES = {
    "CVMAS": [
        "Department of Veterinary Medicine",
        "Department of Agriculture",
        "Department of Agricultural Sciences",
        "Department of Animal Science",
        "Department of Crop Science",
    ],
    "CBMA": [
        "Department of Business Administration",
        "Department of Accountancy",
        "Department of Management",
        "Department of Marketing",
        "Department of Finance",
    ],
    "CoEd": [
        "Department of Teacher Education",
        "Department of Early Childhood Education",
        "Department of Special Education",
        "Department of Physical Education",
        "Department of Educational Administration",
    ],
    "CAST": [
        "Department of Information Technology",
        "Department of Computer Science",
        "Department of Mathematics",
        "Department of Natural Sciences",
        "Department of Social Sciences",
        "Department of Technology",
        "Department of Arts and Humanities",
    ],
}
 
POSITIONS = [
    "Instructor",
    "Assistant Professor",
    "Associate Professor",
    "Professor",
    "Department Chair",
    "Dean",
]
 
 
class ProfileCreate(BaseModel):
    full_name:  str
    college:    str
    department: str
    position:   str
 
    @field_validator("full_name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Full name is required")
        return v.strip()
 
    @field_validator("college")
    @classmethod
    def valid_college(cls, v: str) -> str:
        if v not in COLLEGES:
            raise ValueError(f"College must be one of: {', '.join(COLLEGES.keys())}")
        return v
 
    @field_validator("position")
    @classmethod
    def valid_position(cls, v: str) -> str:
        if v not in POSITIONS:
            raise ValueError(f"Position must be one of: {', '.join(POSITIONS)}")
        return v
 
 
class ProfileUpdate(BaseModel):
    full_name:  Optional[str] = None
    college:    Optional[str] = None
    department: Optional[str] = None
    position:   Optional[str] = None
 
 
class ProfileResponse(BaseModel):
    profile_id: int
    user_id:    int
    full_name:  str
    college:    str
    department: str
    position:   str
    created_at: datetime
 
    model_config = {"from_attributes": True}
 
 
class CollegesResponse(BaseModel):
    colleges: dict[str, list[str]]
    positions: list[str]