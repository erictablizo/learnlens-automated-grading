from datetime import datetime, timedelta, timezone
from typing import Optional
import secrets
 
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
 
from app.core.config import settings
from app.models.models import User, PasswordReset
from app.schemas.user import UserCreate, TokenData
 
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
 
 
def hash_password(password: str) -> str:
    return pwd_context.hash(password)
 
 
def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)
 
 
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
 
 
def decode_access_token(token: str) -> Optional[TokenData]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: int = payload.get("sub")
        if user_id is None:
            return None
        return TokenData(user_id=int(user_id))
    except JWTError:
        return None
 
 
class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db
 
    async def get_user_by_email(self, email: str) -> Optional[User]:
        result = await self.db.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()
 
    async def get_user_by_id(self, user_id: int) -> Optional[User]:
        result = await self.db.execute(select(User).where(User.user_id == user_id))
        return result.scalar_one_or_none()
 
    async def register(self, data: UserCreate) -> User:
        existing = await self.get_user_by_email(data.email)
        if existing:
            raise ValueError("Email already registered")
 
        user = User(
            email=data.email,
            password_hash=hash_password(data.password),
        )
        self.db.add(user)
        await self.db.flush()
        await self.db.refresh(user)
        return user
 
    async def login(self, email: str, password: str) -> Optional[User]:
        user = await self.get_user_by_email(email)
        if not user:
            return None
        if not verify_password(password, user.password_hash):
            return None
        return user
 
    async def create_password_reset_token(self, email: str) -> Optional[str]:
        user = await self.get_user_by_email(email)
        if not user:
            # Don't reveal whether email exists
            return None
 
        token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
 
        reset = PasswordReset(
            user_id=user.user_id,
            token=token,
            expires_at=expires_at,
        )
        self.db.add(reset)
        await self.db.flush()
        return token
 
    async def get_current_user(self, token: str) -> Optional[User]:
        token_data = decode_access_token(token)
        if not token_data:
            return None
        return await self.get_user_by_id(token_data.user_id)