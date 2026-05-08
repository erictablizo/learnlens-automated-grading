from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
 
from app.core.database import get_db
from app.schemas.profile import ProfileCreate, ProfileUpdate, ProfileResponse, CollegesResponse, COLLEGES, POSITIONS
from app.services.profile_service import get_profile, create_profile, update_profile
from app.services.auth_service import get_current_user
 
router = APIRouter(prefix="/profile", tags=["profile"])
bearer = HTTPBearer()
 
 
async def current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> int:
    user = await get_current_user(db, credentials.credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user.user_id
 
 
@router.get("/colleges", response_model=CollegesResponse)
async def list_colleges():
    """Returns all colleges, their departments, and available positions — no auth required."""
    return CollegesResponse(colleges=COLLEGES, positions=POSITIONS)
 
 
@router.get("/me", response_model=ProfileResponse)
async def get_my_profile(
    uid: int = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
):
    profile = await get_profile(db, uid)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile
 
 
@router.post("/me", response_model=ProfileResponse, status_code=201)
async def create_my_profile(
    data: ProfileCreate,
    uid: int = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
):
    existing = await get_profile(db, uid)
    if existing:
        raise HTTPException(status_code=409, detail="Profile already exists — use PUT to update")
    return await create_profile(
        db, uid,
        full_name=data.full_name,
        college=data.college,
        department=data.department,
        position=data.position,
    )
 
 
@router.put("/me", response_model=ProfileResponse)
async def update_my_profile(
    data: ProfileUpdate,
    uid: int = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
):
    profile = await update_profile(
        db, uid,
        full_name=data.full_name,
        college=data.college,
        department=data.department,
        position=data.position,
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found — use POST to create")
    return profile
 
 
@router.get("/check", response_model=dict)
async def check_profile(
    uid: int = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Quick check — returns {has_profile: bool}. Used by frontend on login."""
    profile = await get_profile(db, uid)
    return {"has_profile": profile is not None}