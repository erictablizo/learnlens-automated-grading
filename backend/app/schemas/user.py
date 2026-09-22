from pydantic import BaseModel, EmailStr, field_validator
from datetime import datetime
from typing import Optional
 
 
class UserCreate(BaseModel):
    email: EmailStr
    password: str
 
 
class UserLogin(BaseModel):
    email: EmailStr
    password: str
 
 
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
    email_sent: bool                              # False = DEV MODE (link printed in terminal)
 
class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str
    # Recently added on 2026-09-22: optional email field for logging/debugging:
    @field_validator("new_password")
    @classmethod
    def _min_len(cls, v: str) -> str:              # same rule as Register
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters.")
        return v