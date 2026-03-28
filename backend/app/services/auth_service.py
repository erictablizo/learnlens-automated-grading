from datetime import datetime, timedelta, timezone
from typing import Optional
import secrets
 
from passlib.context import CryptContext
from jose import jwt, JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
 
from app.core.config import settings
from app.models.models import User, PasswordReset
 
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
 
 
def hash_password(password: str) -> str:
    return pwd_context.hash(password)
 
 
def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)
 
 
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode["exp"] = expire
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
 
 
def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None
 
 
async def register_user(db: AsyncSession, email: str, password: str) -> User:
    result = await db.execute(select(User).where(User.email == email))
    if result.scalar_one_or_none():
        raise ValueError("Email already registered")
    user = User(email=email, password_hash=hash_password(password))
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user
 
 
async def authenticate_user(db: AsyncSession, email: str, password: str) -> Optional[User]:
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(password, user.password_hash):
        return None
    return user
 
 
async def get_current_user(db: AsyncSession, token: str) -> Optional[User]:
    payload = decode_token(token)
    if not payload:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    result = await db.execute(select(User).where(User.user_id == int(user_id)))
    return result.scalar_one_or_none()
 
 
async def create_password_reset_token(db: AsyncSession, email: str) -> Optional[str]:
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user:
        return None
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
    reset = PasswordReset(user_id=user.user_id, token=token, expires_at=expires_at)
    db.add(reset)
    await db.commit()
    return token
 
 
async def reset_password(db: AsyncSession, token: str, new_password: str) -> bool:
    result = await db.execute(
        select(PasswordReset).where(
            PasswordReset.token == token,
            PasswordReset.used == False,  # noqa: E712
        )
    )
    reset = result.scalar_one_or_none()
    if not reset:
        return False
    # expires_at is timezone-aware from DB
    now = datetime.now(timezone.utc)
    expires = reset.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < now:
        return False
    user_result = await db.execute(select(User).where(User.user_id == reset.user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        return False
    user.password_hash = hash_password(new_password)
    reset.used = True
    await db.commit()
    return True
