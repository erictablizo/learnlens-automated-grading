from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
 
from app.core.database import get_db
from app.schemas.user import (
    ForgotPasswordRequest,
    MessageResponse,
    ResetPasswordRequest,
    Token,
    UserCreate,
    UserLogin,
    UserOut,
)
from app.services.auth_service import AuthService
 
router = APIRouter()
 
 
@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(data: UserCreate, db: AsyncSession = Depends(get_db)):
    existing = await AuthService.get_user_by_email(db, data.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )
    user = await AuthService.create_user(db, data)
    return user
 
 
@router.post("/login", response_model=Token)
async def login(data: UserLogin, db: AsyncSession = Depends(get_db)):
    user = await AuthService.authenticate_user(db, data.email, data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = AuthService.create_access_token({"sub": str(user.user_id)})
    return Token(access_token=access_token, user=UserOut.model_validate(user))
 
 
@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(
    data: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)
):
    """Always returns 200 to prevent email enumeration."""
    user = await AuthService.get_user_by_email(db, data.email)
    if user:
        token = await AuthService.create_password_reset_token(db, user)
        await AuthService.send_password_reset_email(data.email, token)
    return MessageResponse(
        message="If an account with that email exists, a password reset link has been sent."
    )
 
 
@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(
    data: ResetPasswordRequest, db: AsyncSession = Depends(get_db)
):
    reset_record = await AuthService.get_valid_reset_token(db, data.token)
    if not reset_record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This reset link is invalid or has expired.",
        )
    await AuthService.reset_password(db, reset_record, data.new_password)
    return MessageResponse(message="Your password has been reset successfully.")
 
 
@router.get("/me", response_model=UserOut)
async def get_me(db: AsyncSession = Depends(get_db)):
    """Placeholder – wire up with a real JWT dependency for production."""
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED)