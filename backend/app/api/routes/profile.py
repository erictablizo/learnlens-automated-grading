from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
 
from app.core.database import get_db
from app.schemas.profile import ProfileSetup, ProfileResponse
from app.services.profile_service import get_or_create_profile, update_profile, upload_avatar
from app.services.auth_service import get_current_user
 
router = APIRouter(prefix="/profile", tags=["profile"])
bearer = HTTPBearer()
 
 
async def _uid(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> int:
    user = await get_current_user(db, credentials.credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user.user_id
 
 
@router.get("", response_model=ProfileResponse)
async def get_profile(uid: int = Depends(_uid), db: AsyncSession = Depends(get_db)):
    return await get_or_create_profile(db, uid)
 
 
@router.put("", response_model=ProfileResponse)
async def save_profile(
    data: ProfileSetup,
    uid: int = Depends(_uid),
    db: AsyncSession = Depends(get_db),
):
    return await update_profile(
        db, uid,
        first_name = data.first_name,
        last_name  = data.last_name,
        college    = data.college,
        course     = data.course,
        position   = data.position,
        # FIX 2026-11-03: ProfileSetup has declared and validated year_level
        # since 2026-10-04 and update_profile has accepted it since the same
        # day, but the route never forwarded it — so /setup collected a Year
        # Level, validated it, and dropped it one line before the database.
        year_level = data.year_level,
    )
 
 
@router.post("/avatar", response_model=ProfileResponse)
async def upload_avatar_route(
    file: UploadFile = File(...),
    uid: int = Depends(_uid),
    db: AsyncSession = Depends(get_db),
):
    allowed = {"image/jpeg", "image/png", "image/webp"}
    if file.content_type not in allowed:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, or WebP images are allowed.")
    return await upload_avatar(db, uid, file)