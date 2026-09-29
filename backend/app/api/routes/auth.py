from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
# Commented on 2026-09-20:
# from app.schemas.user import UserCreate, UserLogin, Token, UserResponse, ForgotPasswordRequest, ResetPasswordRequest
from app.schemas.user import (
    UserCreate, UserLogin, Token, UserResponse, ForgotPasswordRequest, ResetPasswordRequest,
    ForgotPasswordResponse,
)
# Commented on 2026-09-20: 
# from app.services.auth_service import (
#     register_user, authenticate_user, create_access_token,
#     get_current_user, create_password_reset_token, reset_password
# )
from app.services.auth_service import (
    register_user, authenticate_user, create_access_token,
    get_current_user, create_password_reset_token, reset_password, verify_reset_token,
)
from app.services.email_service import send_password_reset_email, EmailSendError
from app.models.profile import UserProfile
from app.core.config import settings
 
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
 
# Commented on 2026-09-20 
@router.post("/forgot-password", response_model=ForgotPasswordResponse)
async def forgot_password(data: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    created = await create_password_reset_token(db, data.email)
    if not created:
        raise HTTPException(status_code=404, detail="No LearnLens account is registered with that email address.")
    user, token = created
    # FIX 2026-09-23: the link now opens the Forgot Password page itself
    # (/login/forgot_password?token=…), which shows the "new password" form.
    # The separate /reset_password route is no longer needed → no 404.
    reset_url = f"{settings.FRONTEND_URL.rstrip('/')}/login/forgot_password?token={quote(token)}"
    try:
        sent = await send_password_reset_email(user.email, reset_url)
    except EmailSendError as e:
        raise HTTPException(status_code=503, detail=str(e))

    # NEW 2026-09-29: hand the link back so the "Check your email!" screen can
    # show it, instead of asking you to copy it from the uvicorn terminal.
    #
    # `sent` is False only when SMTP is not configured — the SMTP failure paths
    # raise above — so this is exactly DEV MODE. It is still a one-use
    # password-reset token travelling in an HTTP response, so it is gated on
    # SHOW_DEV_RESET_LINK as well (see the warning in core/config.py). With
    # SMTP configured, `sent` is True and the link is never returned.
    dev_url = None if sent else (reset_url if settings.SHOW_DEV_RESET_LINK else None)

    if sent:
        message = "A password reset link has been sent to your email."
    elif dev_url:
        message = "DEV MODE: email is not configured — use the reset link shown on screen."
    else:
        message = "DEV MODE: email is not configured — the reset link was printed in the backend terminal."

    return ForgotPasswordResponse(
        message=message,
        email_sent=sent,
        dev_reset_url=dev_url,
    )

#  Added on 2026-09-22: 
@router.get("/reset-password/validate")
async def validate_reset_token(token: str = Query(...), db: AsyncSession = Depends(get_db)):
    email = await verify_reset_token(db, token)
    if not email:
        raise HTTPException(status_code=400, detail="This reset link is invalid or has expired. Please request a new one.")
    return {"valid": True, "email": email}
 
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