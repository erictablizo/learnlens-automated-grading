# -*- coding: utf-8 -*-
"""
backend/app/api/routes/admin_teacher_corrections.py              2026-11-25
============================================================================

    Ms. Melanie, Recommendations page 19, requirement 1:
    "Admin side can monitor how many the teachers recorrected answer"

ITS OWN ROUTER, importing `_admin` from admin.py - the same pattern
admin_users.py, admin_students.py and admin_reference.py use, and for the
same reason: one router per concern, and admin.py is not edited.

NOT FOLDED INTO admin_corrections.py, deliberately, even though both are
about corrections. That router is about the RECOGNISER - what it got wrong,
what to teach it, which papers a specimen would re-score. This one is about
PEOPLE: how much marking each teacher has had to redo. They read the same
tables and answer different questions, and the prefixes say which is which:

    /admin/corrections/*          the reader
    /admin/teacher-corrections/*  the teachers

READ-ONLY. Both endpoints are GETs over existing rows; nothing here writes.
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.admin import _admin
from app.core.database import get_db
from app.models.models import User
from app.schemas.teacher_correction import (CorrectedAnswer,
                                            TeacherCorrectionCount,
                                            TeacherCorrectionDetail)
from app.services import teacher_correction_service as svc

router = APIRouter(prefix="/admin/teacher-corrections", tags=["admin"])


@router.get("", response_model=List[TeacherCorrectionCount])
async def by_teacher(
    admin: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
):
    """Every account and how many answers on its exams were re-corrected.

    Accounts with none are INCLUDED, with a zero. An administrator watching
    for a teacher who has had to redo a lot of marking also wants to see the
    one who has redone none.
    """
    del admin
    return await svc.counts_by_teacher(db)


@router.get("/{user_id}", response_model=TeacherCorrectionDetail)
async def for_teacher(
    user_id: int,
    admin: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
):
    """Which answers, on which exams.

    404 for a user_id that is not an account, rather than an empty list: an
    empty list is a true answer for a teacher who has corrected nothing, and
    the screen must be able to tell the two apart.
    """
    del admin
    email = await svc.teacher_exists(db, user_id)
    if email is None:
        raise HTTPException(status_code=404, detail="Account not found")
    items, truncated = await svc.detail_for_teacher(db, user_id)
    return TeacherCorrectionDetail(
        user_id=user_id,
        email=email,
        items=[CorrectedAnswer(**i) for i in items],
        truncated=truncated,
    )