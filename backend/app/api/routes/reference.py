"""
app/api/routes/reference.py
===========================
NEW 2026-11-14 — the three dropdown lists, as every teacher reads them.

READ ONLY, and for ANY signed-in teacher. This router is what makes the Edit
Profile and Setup dropdowns stop being hardcoded arrays; it is not an
administrator screen and nothing here can change anything.

The matching WRITE endpoints live in `admin_reference.py`, behind `_admin`.
The split is on purpose and it is the same one `admin.py` already draws: one
file holds everything that requires being an administrator, so that question
has a one-grep answer. A teacher reading the list of colleges is not crossing
any boundary - they are reading the school's own prospectus.

REGISTER IT. One line in `backend/app/api/routes/__init__.py`, beside the
others.
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.reference import CollegeLists, CourseOut, YearLevelOut
from app.services import reference_service as ref
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/reference", tags=["reference"])
bearer = HTTPBearer()


async def _signed_in(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> int:
    """Any authenticated teacher. Deliberately NOT `_admin`.

    The lists are behind sign-in rather than public because they describe the
    installation, and there is no reason to serve them to the open internet.
    They are not behind `_admin` because every teacher needs them to fill in
    their own profile.
    """
    user = await get_current_user(db, credentials.credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user.user_id


@router.get("/lists", response_model=List[CollegeLists])
async def lists(
    _: int = Depends(_signed_in),
    db: AsyncSession = Depends(get_db),
):
    """Every ACTIVE college, each with its active courses and year levels.

    One request for the whole of both dependent dropdowns - see CollegeLists.
    `in_use` is left None throughout: how many colleagues share a college is an
    administrator's business, not a teacher's.
    """
    out = []
    for c in await ref.list_colleges(db):
        out.append({
            "college_id":  c.college_id,
            "code":        c.code,
            "name":        c.name,
            "badge_bg":    c.badge_bg,
            "badge_color": c.badge_color,
            "sort_order":  c.sort_order,
            "active":      c.active,
            "in_use":      None,
            "courses":     [CourseOut.model_validate(x)
                            for x in await ref.list_courses(db, c.college_id)],
            "year_levels": [YearLevelOut.model_validate(x)
                            for x in await ref.list_year_levels(db, c.college_id)],
        })
    return out