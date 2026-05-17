from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
 
from app.core.database import get_db
from app.schemas.user import UserCreate, UserLogin, Token, UserResponse, ForgotPasswordRequest, ResetPasswordRequest
from app.services.auth_service import (
    register_user, authenticate_user, create_access_token,
    get_current_user, create_password_reset_token, reset_password
)
from app.models.profile import UserProfile
 
router = APIRouter(prefix="/auth", tags=["auth"])
bearer = HTTPBearer()
 
 
async def _profile_complete(db: AsyncSession, user_id: int) -> bool:
    result = await db.execute(select(UserProfile).where(UserProfile.user_id == user_id))
    profile = result.scalar_one_or_none()
    return bool(profile and profile.profile_complete)
 
 
@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register(data: UserCreate, db: AsyncSession = Depends(get_db)):
    try:
        user = await register_user(db, data.email, data.password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    token = create_access_token({"sub": str(user.user_id)})
    return Token(
        access_token=token,
        user=UserResponse.model_validate(user),
        profile_complete=False,
    )
 
 
@router.post("/login", response_model=Token)
async def login(data: UserLogin, db: AsyncSession = Depends(get_db)):
    user = await authenticate_user(db, data.email, data.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token({"sub": str(user.user_id)})
    complete = await _profile_complete(db, user.user_id)
    return Token(
        access_token=token,
        user=UserResponse.model_validate(user),
        profile_complete=complete,
    )
 
 
@router.post("/forgot-password")
async def forgot_password(data: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    await create_password_reset_token(db, data.email)
    return {"message": "If that email exists, a reset link has been sent."}
 
 
@router.post("/reset-password")
async def reset_pwd(data: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    success = await reset_password(db, data.token, data.new_password)
    if not success:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    return {"message": "Password reset successfully"}
 
 
@router.get("/me", response_model=UserResponse)
async def me(credentials: HTTPAuthorizationCredentials = Depends(bearer), db: AsyncSession = Depends(get_db)):
    user = await get_current_user(db, credentials.credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    return UserResponse.model_validate(user)