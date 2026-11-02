import os, shutil
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy import func
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
    last_name:  Optional[str],
    college:    Optional[str],
    course:     Optional[str],
    position:   Optional[str],
    year_level: Optional[int] = None,     # Added on 2026-10-04
) -> UserProfile:
    profile = await get_or_create_profile(db, user_id)
 
    if first_name is not None: profile.first_name = first_name.strip() or None
    if last_name  is not None: profile.last_name  = last_name.strip()  or None
    if college    is not None: profile.college    = college
    if course     is not None: profile.course     = course.strip()     or None
    if position   is not None: profile.position   = position.strip()   or None
    if year_level is not None: profile.year_level = year_level
 
    # Profile is complete when name, college AND course are all provided.
    # The year level is a convenience default, so it is NOT required here —
    # the teacher still confirms it on /college every session.
    profile.profile_complete = bool(
        profile.first_name and profile.last_name
        and profile.college and profile.course
    )
 
    await db.commit()
    await db.refresh(profile)
    return profile
 
 
# Added 2026-11-02: the avatar is written to ONE name per user, so the image
# FORMAT is the only thing that can change that name. Derive it from the
# content type the route has already validated, never from the uploaded file
# name — splitext() on "shell.html" yields ".html", which would then be written
# into a statically served directory and served back as HTML.
_AVATAR_EXT  = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
_AVATAR_EXTS = tuple(sorted(set(_AVATAR_EXT.values())))


def _avatar_ext(content_type: Optional[str]) -> str:
    return _AVATAR_EXT.get((content_type or "").split(";")[0].strip().lower(), ".jpg")


async def upload_avatar(db: AsyncSession, user_id: int, file: UploadFile) -> UserProfile:
    profile = await get_or_create_profile(db, user_id)
    upload_dir = os.path.join(settings.UPLOAD_DIR, "avatars")
    os.makedirs(upload_dir, exist_ok=True)

    ext = _avatar_ext(file.content_type)
    file_path = os.path.join(upload_dir, f"user_{user_id}{ext}")
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # A previous photo saved under a different format would otherwise linger
    # forever, and both files would be reachable from the uploads directory.
    for other in _AVATAR_EXTS:
        stale = os.path.join(upload_dir, f"user_{user_id}{other}")
        if stale != file_path and os.path.exists(stale):
            try:
                os.remove(stale)
            except OSError:
                pass

    profile.avatar_path = file_path

    # FIX 2026-11-02: every upload writes to the SAME file name, so when the
    # format is unchanged the line above assigns a string identical to the one
    # already stored. SQLAlchemy then sees no dirty column, emits no UPDATE,
    # and onupdate=func.now() never fires. updated_at is the ?v= cache-buster
    # on the image URL, so without this the browser keeps serving the previous
    # photo. Measured on PostgreSQL 16.15 / SQLAlchemy 2.0.30: the FIRST upload
    # bumps it (NULL -> path is a real change), every later one does not.
    profile.updated_at = func.now()

    await db.commit()
    await db.refresh(profile)
    return profile