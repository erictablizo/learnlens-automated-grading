from pydantic import BaseModel, EmailStr
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
 
 
class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str