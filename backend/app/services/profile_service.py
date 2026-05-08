from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.models import Profile
 
 
async def get_profile(db: AsyncSession, user_id: int) -> Optional[Profile]:
    result = await db.execute(select(Profile).where(Profile.user_id == user_id))
    return result.scalar_one_or_none()
 
 
async def create_profile(
    db: AsyncSession,
    user_id: int,
    full_name: str,
    college: str,
    department: str,
    position: str,
) -> Profile:
    profile = Profile(
        user_id=user_id,
        full_name=full_name,
        college=college,
        department=department,
        position=position,
    )
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return profile
 
 
async def update_profile(
    db: AsyncSession,
    user_id: int,
    **kwargs,
) -> Optional[Profile]:
    result = await db.execute(select(Profile).where(Profile.user_id == user_id))
    profile = result.scalar_one_or_none()
    if not profile:
        return None
    for k, v in kwargs.items():
        if v is not None:
            setattr(profile, k, v)
    await db.commit()
    await db.refresh(profile)
    return profile
 
 
async def has_profile(db: AsyncSession, user_id: int) -> bool:
    profile = await get_profile(db, user_id)
    return profile is not None