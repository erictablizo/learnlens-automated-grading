from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
 
from app.core.database import get_db
from app.schemas.user import (
    UserCreate, UserLogin, TokenResponse, UserResponse,
    ForgotPasswordRequest, ResetPasswordRequest, MessageResponse,
)
from app.services.auth_service import (
    authenticate_user, create_user, create_access_token,
    decode_access_token, get_user_by_email, get_user_by_id,
    create_password_reset_token, reset_password_with_token,
)
 
router = APIRouter()
security = HTTPBearer()
 
 
@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: UserCreate, db: AsyncSession = Depends(get_db)):
    existing = await get_user_by_email(db, payload.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )
    user = await create_user(db, payload.email, payload.password)
    token = create_access_token({"sub": str(user.user_id)})
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            user_id=user.user_id,
            email=user.email,
            created_at=user.created_at,
        ),
    )
 
 
@router.post("/login", response_model=TokenResponse)
async def login(payload: UserLogin, db: AsyncSession = Depends(get_db)):
    user = await authenticate_user(db, payload.email, payload.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    token = create_access_token({"sub": str(user.user_id)})
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            user_id=user.user_id,
            email=user.email,
            created_at=user.created_at,
        ),
    )
 
 
@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(payload: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    await create_password_reset_token(db, payload.email)
    # Always return success to prevent email enumeration (HCI: error prevention)
    return MessageResponse(message="If that email exists, a reset link has been sent.")
 
 
@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(payload: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    success = await reset_password_with_token(db, payload.token, payload.new_password)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )
    return MessageResponse(message="Password reset successfully")
 
 
@router.get("/me", response_model=UserResponse)
async def get_me(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
):
    payload = decode_access_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user = await get_user_by_id(db, int(payload["sub"]))
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return UserResponse(
        user_id=user.user_id,
        email=user.email,
        created_at=user.created_at,
    )