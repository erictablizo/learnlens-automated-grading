import secrets
import smtplib
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional
 
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
 
from app.core.config import settings
from app.models.models import PasswordReset, User
from app.schemas.user import UserCreate
 
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
 
 
class AuthService:
    # ── Password helpers ────────────────────────────────────────────────
    @staticmethod
    def hash_password(password: str) -> str:
        return pwd_context.hash(password)
 
    @staticmethod
    def verify_password(plain: str, hashed: str) -> bool:
        return pwd_context.verify(plain, hashed)
 
    # ── JWT ─────────────────────────────────────────────────────────────
    @staticmethod
    def create_access_token(data: dict) -> str:
        payload = data.copy()
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
        payload.update({"exp": expire})
        return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
 
    @staticmethod
    def decode_token(token: str) -> Optional[dict]:
        try:
            return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        except JWTError:
            return None
 
    # ── User CRUD ────────────────────────────────────────────────────────
    @staticmethod
    async def get_user_by_email(db: AsyncSession, email: str) -> Optional[User]:
        result = await db.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()
 
    @staticmethod
    async def get_user_by_id(db: AsyncSession, user_id: int) -> Optional[User]:
        result = await db.execute(select(User).where(User.user_id == user_id))
        return result.scalar_one_or_none()
 
    @staticmethod
    async def create_user(db: AsyncSession, data: UserCreate) -> User:
        user = User(
            email=data.email,
            password_hash=AuthService.hash_password(data.password),
        )
        db.add(user)
        await db.flush()
        await db.refresh(user)
        return user
 
    @staticmethod
    async def authenticate_user(
        db: AsyncSession, email: str, password: str
    ) -> Optional[User]:
        user = await AuthService.get_user_by_email(db, email)
        if not user:
            return None
        if not AuthService.verify_password(password, user.password_hash):
            return None
        return user
 
    # ── Password Reset ───────────────────────────────────────────────────
    @staticmethod
    async def create_password_reset_token(db: AsyncSession, user: User) -> str:
        token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(
            hours=settings.PASSWORD_RESET_TOKEN_EXPIRE_HOURS
        )
        reset = PasswordReset(
            user_id=user.user_id,
            token=token,
            expires_at=expires_at,
        )
        db.add(reset)
        await db.flush()
        return token
 
    @staticmethod
    async def get_valid_reset_token(
        db: AsyncSession, token: str
    ) -> Optional[PasswordReset]:
        result = await db.execute(
            select(PasswordReset).where(
                PasswordReset.token == token,
                PasswordReset.used == False,  # noqa: E712
                PasswordReset.expires_at > datetime.now(timezone.utc),
            )
        )
        return result.scalar_one_or_none()
 
    @staticmethod
    async def reset_password(
        db: AsyncSession, reset_record: PasswordReset, new_password: str
    ) -> None:
        user = await AuthService.get_user_by_id(db, reset_record.user_id)
        if user:
            user.password_hash = AuthService.hash_password(new_password)
            user.updated_at = datetime.now(timezone.utc)
        reset_record.used = True
        await db.flush()
 
    # ── Email ────────────────────────────────────────────────────────────
    @staticmethod
    async def send_password_reset_email(email: str, token: str) -> None:
        """Send a password-reset link. Falls back to console log when SMTP is not configured."""
        reset_link = f"{settings.FRONTEND_URL}/login/forgot_password/reset?token={token}"
 
        if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
            # Dev fallback — print the link instead of sending
            print(f"\n[DEV] Password reset link for {email}:\n{reset_link}\n")
            return
 
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"{settings.APP_NAME} – Reset your password"
        msg["From"] = settings.EMAIL_FROM
        msg["To"] = email
 
        html_body = f"""
        <html><body style="font-family:sans-serif;color:#1e3a5f">
          <h2>Reset your LearnLens password</h2>
          <p>Click the button below within 1 hour to reset your password.</p>
          <a href="{reset_link}"
             style="display:inline-block;padding:12px 24px;background:#f59e0b;
                    color:#fff;border-radius:8px;text-decoration:none;font-weight:bold">
            Reset Password
          </a>
          <p style="margin-top:24px;font-size:12px;color:#666">
            If you did not request this, you can safely ignore this email.
          </p>
        </body></html>
        """
        msg.attach(MIMEText(html_body, "html"))
 
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.EMAIL_FROM, email, msg.as_string())