# -*- coding: utf-8 -*-
"""
backend/app/api/routes/auth_change_password.py                   2026-11-26
============================================================================

    Ms. Melanie, Recommendations page 20, requirements 2 and 3.

POST /api/auth/change-password

ITS OWN ROUTER with the same /auth prefix as auth.py, the pattern
admin_users.py and admin_teacher_corrections.py already use: one file per
change, and a router that is registered in one line rather than edited into
an existing one.

NO AUTHENTICATION DEPENDENCY, and that is the design rather than an
oversight. The old password IS the authentication. It has to be, because the
screen this serves is the Login page: a teacher holding a temporary password
from the administrator has no session to present.

WHAT THAT COSTS, and why it is acceptable: anyone can post an address and a
guess here, and a correct guess changes the password. That is the same
exposure POST /api/auth/login already has, with the same answer either way -
the service returns one sentence for a wrong address, a wrong password and a
resigned account alike, so nothing here distinguishes an account that exists
from one that does not.

WHAT IT DOES NOT HAVE is rate limiting, and nothing else in this project
does either. /auth/login is equally open and is the easier target, since a
success there costs the attacker nothing. Saying so here rather than leaving
it to be noticed: a limiter belongs in front of both, at nginx, not bolted
onto one endpoint a week before a defence.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.change_password import (ChangePasswordRequest,
                                         ChangePasswordResponse)
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/change-password", response_model=ChangePasswordResponse)
async def change_password(
    data: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """Change a password given the old one.

    400 with a sentence on every failure. The service writes those sentences
    for this screen - "Email or old password is not correct.", the password
    rule that was broken - and they are passed through unchanged, because
    rewording them here is how the one in the middle stops being true.
    """
    error = await auth_service.change_password(
        db,
        email=data.email,
        old_password=data.old_password,
        new_password=data.new_password,
    )
    if error:
        raise HTTPException(status_code=400, detail=error)
    return ChangePasswordResponse()