from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from datetime import datetime
 
 
class UserCreate(BaseModel):
    email: EmailStr
    password: str
 
    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v
 
 
class UserLogin(BaseModel):
    email: EmailStr
    password: str
 
 
class UserResponse(BaseModel):
    user_id: int
    email: str
    created_at: datetime
 
    model_config = {"from_attributes": True}
 
 
class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
 
 
class ForgotPasswordRequest(BaseModel):
    email: EmailStr
 
 
class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str
 
    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v
 
 
class MessageResponse(BaseModel):
    message: str