from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
 
from app.core.database import get_db
from app.schemas.user import (
    UserCreate, UserLogin, UserResponse, Token,
    ForgotPasswordRequest, ForgotPasswordResponse, MessageResponse
)
from app.services.auth_service import AuthService, create_access_token
 
router = APIRouter(prefix="/auth", tags=["auth"])
security = HTTPBearer()
 
 
@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register(data: UserCreate, db: AsyncSession = Depends(get_db)):
    service = AuthService(db)
    try:
        user = await service.register(data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
 
    access_token = create_access_token({"sub": str(user.user_id)})
    return Token(access_token=access_token, user=UserResponse.model_validate(user))
 
 
@router.post("/login", response_model=Token)
async def login(data: UserLogin, db: AsyncSession = Depends(get_db)):
    service = AuthService(db)
    user = await service.login(data.email, data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
 
    access_token = create_access_token({"sub": str(user.user_id)})
    return Token(access_token=access_token, user=UserResponse.model_validate(user))
 
 
@router.post("/forgot-password", response_model=ForgotPasswordResponse)
async def forgot_password(data: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    service = AuthService(db)
    await service.create_password_reset_token(data.email)
    # Always return success to prevent email enumeration
    return ForgotPasswordResponse(
        message="If that email is registered, a reset link has been sent."
    )
 
 
@router.get("/me", response_model=UserResponse)
async def get_me(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
):
    service = AuthService(db)
    user = await service.get_current_user(credentials.credentials)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    return UserResponse.model_validate(user)