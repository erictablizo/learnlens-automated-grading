import os, shutil
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import UploadFile
 
from app.models.profile import UserProfile
from app.core.config import settings
 
 
async def get_or_create_profile(db: AsyncSession, user_id: int) -> UserProfile:
    result = await db.execute(select(UserProfile).where(UserProfile.user_id == user_id))
    profile = result.scalar_one_or_none()
    if not profile:
        profile = UserProfile(user_id=user_id)
        db.add(profile)
        await db.commit()
        await db.refresh(profile)
    return profile
 
 
async def update_profile(
    db: AsyncSession,
    user_id: int,
    first_name: Optional[str],
    last_name: Optional[str],
    college: Optional[str],
    department: Optional[str],
    position: Optional[str],
) -> UserProfile:
    profile = await get_or_create_profile(db, user_id)
    if first_name is not None: profile.first_name = first_name.strip() or None
    if last_name  is not None: profile.last_name  = last_name.strip()  or None
    if college    is not None: profile.college    = college
    if department is not None: profile.department = department.strip()  or None
    if position   is not None: profile.position   = position.strip()   or None
 
    # Mark complete if core fields are filled
    profile.profile_complete = bool(
        profile.first_name and profile.last_name and profile.college
    )
    await db.commit()
    await db.refresh(profile)
    return profile
 
 
async def upload_avatar(db: AsyncSession, user_id: int, file: UploadFile) -> UserProfile:
    profile = await get_or_create_profile(db, user_id)
    upload_dir = os.path.join(settings.UPLOAD_DIR, "avatars")
    os.makedirs(upload_dir, exist_ok=True)
    ext = os.path.splitext(file.filename or "avatar.jpg")[1] or ".jpg"
    file_path = os.path.join(upload_dir, f"user_{user_id}{ext}")
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    profile.avatar_path = file_path
    await db.commit()
    await db.refresh(profile)
    return profile