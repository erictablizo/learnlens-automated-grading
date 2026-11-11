import bcrypt
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple
import secrets

from jose import jwt, JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func

from app.core.config import settings
from app.models.models import User, PasswordReset


def hash_password(password: str) -> str:
    # Use direct bcrypt: works reliably across all bcrypt versions and handles UTF-8
    pw_bytes = password.encode("utf-8")[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pw_bytes, salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        pw_bytes = plain.encode("utf-8")[:72]
        hashed_bytes = hashed.encode("utf-8")
        return bcrypt.checkpw(pw_bytes, hashed_bytes)
    except Exception:
        return False


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

# Recently added on 2026-09-22: async def _user_by_email(db: AsyncSession, email: str) -> Optional[User]:
async def _user_by_email(db: AsyncSession, email: str) -> Optional[User]:
    """The account for this address, matched without regard to capitalisation.

    FIX 2026-09-22: case-insensitive, so "Grace@Gmail.com" finds "grace@gmail.com"

    CHANGED 2026-11-11 — not the body, the CALLERS. Until today this was used
    by create_password_reset_token() and NOWHERE ELSE, while register_user()
    and authenticate_user() each did their own `User.email == email`, which is
    case-sensitive. The 2026-09-22 fix landed on one of three call sites, so:

      * registering as "Grace@Gmail.com" and signing in as "grace@gmail.com"
        failed with "Invalid email or password", password correct;
      * register_user's duplicate check could not see the other spelling, so
        BOTH rows were created, and then this function - matching both - raised
        MultipleResultsFound on Forgot Password: a 500, not a 404.

    scalar_one_or_none() is KEPT here, deliberately, unlike
    paper_service.find_paper_by_name() where the same exception forced a
    .limit(1). The cases are not alike: two papers sharing a name are two
    different students and either may be shown, but two accounts sharing an
    address are an ambiguous IDENTITY, and picking one arbitrarily would mean
    authenticating as whichever row the database happened to return first.
    Failing loudly is correct. The unique index in
    migrations/2026-11-11_email_case_insensitive.sql makes the ambiguity
    impossible in the first place, which is why that migration runs BEFORE
    this file is deployed.
    """
    result = await db.execute(
        select(User).where(func.lower(User.email) == email.strip().lower())
    )
    return result.scalar_one_or_none()

async def register_user(db: AsyncSession, email: str, password: str) -> User:
    """Create an account. Raises ValueError when the address is already taken.

    CHANGED 2026-11-11: the duplicate check was `User.email == email`, which is
    case-sensitive, so "Grace@Gmail.com" registered happily alongside an
    existing "grace@gmail.com". It now uses _user_by_email() - the same lookup
    create_password_reset_token() has used since 2026-09-22 - so one address is
    one account however it is typed.

    The address is stored .strip()ed but NOT lower-cased. Lower-casing would
    rewrite what the teacher typed, and the unique index on lower(email) makes
    it unnecessary: the stored spelling is hers, the matching is ours.
    """
    if await _user_by_email(db, email):
        raise ValueError("Email already registered")
    user = User(email=email.strip(), password_hash=hash_password(password))
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def authenticate_user(db: AsyncSession, email: str, password: str) -> Optional[User]:
    """The account, if the password is right. None otherwise - never a reason.

    CHANGED 2026-11-11: was `User.email == email`, case-sensitive, so signing
    in with a different capitalisation than was used at registration failed
    with "Invalid email or password" even when the password was correct.
    Forgot Password had been case-insensitive since 2026-09-22, so the two
    screens disagreed about what counts as the same account.

    Still returns None for both "no such account" and "wrong password", which
    is what keeps /auth/login from confirming whether an address is registered.
    """
    user = await _user_by_email(db, email)
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

# Recently added on 2026-09-22:
def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)

# Commented on 2026-09-22: 
# async def create_password_reset_token(db: AsyncSession, email: str) -> Optional[str]:
#     result = await db.execute(select(User).where(User.email == email))
#     user = result.scalar_one_or_none()
#     if not user:
#         return None
#     token = secrets.token_urlsafe(32)
#     expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
#     reset = PasswordReset(user_id=user.user_id, token=token, expires_at=expires_at)
#     db.add(reset)
#     await db.commit()
#     return token

async def create_password_reset_token(db: AsyncSession, email: str) -> Optional[Tuple[User, str]]:
    """
    FIX 2026-09-22: now returns (user, token) so the route can email the user.
    Older unused links of this user are cancelled, so only the newest link works
    (important when the user presses "Resend email").
    """
    user = await _user_by_email(db, email)
    if not user:
        return None
    await db.execute(
        update(PasswordReset)
        .where(PasswordReset.user_id == user.user_id, PasswordReset.used == False)  # noqa: E712
        .values(used=True)
    )
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.RESET_TOKEN_EXPIRE_MINUTES)
    db.add(PasswordReset(user_id=user.user_id, token=token, expires_at=expires_at))
    await db.commit()
    return user, token

#  Recently added on 2026-09-22:
async def _valid_reset(db: AsyncSession, token: str) -> Optional[PasswordReset]:
    if not token:
        return None
    result = await db.execute(
        select(PasswordReset).where(PasswordReset.token == token, PasswordReset.used == False)  # noqa: E712
    )
    reset = result.scalar_one_or_none()
    if not reset or _aware(reset.expires_at) < datetime.now(timezone.utc):
        return None
    return reset


async def verify_reset_token(db: AsyncSession, token: str) -> Optional[str]:
    """NEW: used by the reset page to check the link before showing the form. Returns the email."""
    reset = await _valid_reset(db, token)
    if not reset:
        return None
    user = (await db.execute(select(User).where(User.user_id == reset.user_id))).scalar_one_or_none()
    return user.email if user else None

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