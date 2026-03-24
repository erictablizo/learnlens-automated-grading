"""
auth_service.py
---------------
Business logic for authentication.
Uses SQLAlchemy ORM models (User, PasswordReset) instead of raw SQL,
keeping the service layer consistent with the rest of the app.
"""
 
from datetime import datetime, timedelta, timezone
from typing import Optional
import secrets
 
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
 
from app.core.config import settings
from app.models import User, PasswordReset
 
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
 
 
# ── Password helpers ───────────────────────────────────────────────────────
 
def hash_password(password: str) -> str:
    return pwd_context.hash(password)
 
 
def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)
 
 
# ── JWT helpers ────────────────────────────────────────────────────────────
 
def create_access_token(
    data: dict,
    expires_delta: Optional[timedelta] = None,
) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta
        or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
 
 
def decode_access_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
    except JWTError:
        return None
 
 
# ── User queries ───────────────────────────────────────────────────────────
 
async def get_user_by_email(db: AsyncSession, email: str) -> Optional[User]:
    result = await db.execute(
        select(User).where(User.email == email)
    )
    return result.scalar_one_or_none()
 
 
async def get_user_by_id(db: AsyncSession, user_id: int) -> Optional[User]:
    result = await db.execute(
        select(User).where(User.user_id == user_id)
    )
    return result.scalar_one_or_none()
 
 
async def create_user(db: AsyncSession, email: str, password: str) -> User:
    user = User(
        email=email,
        password_hash=hash_password(password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user
 
 
async def authenticate_user(
    db: AsyncSession, email: str, password: str
) -> Optional[User]:
    user = await get_user_by_email(db, email)
    if not user or not verify_password(password, user.password_hash):
        return None
    return user
 
 
# ── Password reset ─────────────────────────────────────────────────────────
 
async def create_password_reset_token(
    db: AsyncSession, email: str
) -> Optional[str]:
    user = await get_user_by_email(db, email)
    if not user:
        # Return None silently — caller always responds with success
        # (HCI: error prevention — prevents email enumeration)
        return None
 
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
 
    reset = PasswordReset(
        user_id=user.user_id,
        token=token,
        expires_at=expires_at,
    )
    db.add(reset)
    await db.commit()
    return token
 
 
async def reset_password_with_token(
    db: AsyncSession, token: str, new_password: str
) -> bool:
    now = datetime.now(timezone.utc)
 
    result = await db.execute(
        select(PasswordReset).where(
            PasswordReset.token == token,
            PasswordReset.used == False,       # noqa: E712
            PasswordReset.expires_at > now,
        )
    )
    reset = result.scalar_one_or_none()
    if not reset:
        return False
 
    # Update user password
    user = await get_user_by_id(db, reset.user_id)
    if not user:
        return False
 
    user.password_hash = hash_password(new_password)
    reset.used = True
 
    await db.commit()
    return True