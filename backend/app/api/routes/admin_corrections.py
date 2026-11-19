"""
app/api/routes/admin_corrections.py
===================================
NEW 2026-11-19 — the Technical Admin specimen table.

    Sir Alex Passion, 19 November 2026:
      4. "corrections / handling conditions to cover Machine"
      5. "teach the algorithm to recognize E not as a dash"
      6. "Technical Admin - alphabet recognition handling; dataset; sample
          specimen to include E; add specimen recognition; algorithm to
          recognise new letters"
      7. "letter B"

REGISTER IT. One line in `backend/app/api/routes/__init__.py`, beside the
others - NOT in main.py, which names no individual router
(ROUTER-WIRING-2026-11-11.md).

WHY A SEPARATE ROUTER — the same argument admin.py made on 2026-11-13 and
admin_students.py repeated on 2026-11-17. Everything one user may do to
another user's data lives under `/admin*`, behind `_admin`, so that prefix
stays the complete greppable list. `_admin` is IMPORTED, never re-declared:
it reads the role from the database rather than the token.

SAVING A CORRECTION RE-CHECKS PAPERS. THAT IS THE POINT, AND IT IS BOUNDED.
---------------------------------------------------------------------------
`GET /admin/corrections/affected?seen=-` answers, before anything is saved,
exactly how many recorded items and how many papers a correction would touch.
POST and PUT then do it, in the SAME transaction as the correction row, and
report what they did.

The twenty-minute figure that made this worth arguing about
(THROUGHPUT-2026-10-23: 40.1 s per paper page) is the cost of OCR. This runs
none. See the header of correction_service.py.

A correction is not retro-applied by DELETE. Removing a row stops the
correction being applied to papers checked from then on; it does not put the
old reading back into papers already re-checked, because the original reading
has been overwritten in paper_scores and is not recoverable without the
photograph. DELETE says so in its response, and the screen repeats it.
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import OCRCorrection, User
from app.schemas.ocr_correction import (
    AffectedCount, OCRCorrectionCreate, OCRCorrectionResponse,
    OCRCorrectionSaved, OCRCorrectionUpdate, RescoreSummary,
)
from app.services import correction_service
from app.api.routes.admin import _admin

router = APIRouter(prefix="/admin/corrections", tags=["admin"])

DUPLICATE = ("Another correction already covers that reading. Edit that one "
             "instead - a reading can only mean one thing.")


def _summary(rep: correction_service.RescoreReport) -> RescoreSummary:
    return RescoreSummary(
        rows_examined=rep.rows_examined,
        rows_changed=rep.rows_changed,
        rows_skipped_review=rep.rows_skipped_review,
        papers_touched=rep.papers_touched,
        marks_gained=rep.marks_gained,
        marks_lost=rep.marks_lost,
        marks_to_review=rep.marks_to_review,
        message=rep.sentence(),
    )


@router.get("", response_model=List[OCRCorrectionResponse])
async def list_corrections(
    admin: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
):
    """Every correction, ordered the way it is looked up."""
    del admin                      # the dependency IS the authorisation
    rows = (await db.execute(
        select(OCRCorrection).order_by(OCRCorrection.seen)
    )).scalars().all()
    return list(rows)


@router.get("/affected", response_model=AffectedCount)
async def affected(
    seen: str = Query(..., description="The reading, exactly as the reader produced it."),
    means: str = Query("", description="What it would be read as. Enables the outcome counts."),
    admin: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
):
    """What a correction of `seen` to `means` would do, before it does it.

    Read-only, and it judges each row with the SAME function the apply uses,
    so the numbers on the screen describe what Save actually does.

    Without `means` it answers the row and paper counts only. With it, it also
    says how many items would become correct, how many wrong, and how many
    would go to the teacher - which is the part that matters. A correction can
    look obviously right and still cost marks; `would_be_wrong` is how an
    administrator finds that out before pressing the button rather than after.
    """
    del admin
    pv = await correction_service.preview_for(db, seen, means)
    return AffectedCount(
        rows=pv.rows, papers=pv.papers, skipped_review=pv.skipped_review,
        would_be_correct=pv.would_be_correct, would_be_wrong=pv.would_be_wrong,
        would_need_review=pv.would_need_review, detailed=pv.detailed,
    )


@router.post("", response_model=OCRCorrectionSaved, status_code=201)
async def add_correction(
    data: OCRCorrectionCreate,
    admin: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
):
    """Teach the system a reading, and re-check what it already recorded.

    ONE TRANSACTION. The correction row and the re-check it caused commit
    together or not at all; a correction stored without its cascade would
    leave the table and the scores disagreeing, which is worse than either
    failing on its own.
    """
    row = OCRCorrection(seen=data.seen, means=data.means, note=data.note,
                        created_by=admin.user_id)
    db.add(row)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail=DUPLICATE)

    rep = await correction_service.rescore_for(db, data.seen, data.means)
    await db.commit()
    await db.refresh(row)
    return OCRCorrectionSaved(correction=OCRCorrectionResponse.model_validate(row),
                              rescore=_summary(rep))


@router.put("/{correction_id}", response_model=OCRCorrectionSaved)
async def edit_correction(
    correction_id: int,
    data: OCRCorrectionUpdate,
    admin: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
):
    """Change a correction.

    The cascade runs on the NEW reading only. Papers re-checked under the old
    reading keep the old meaning until that reading turns up again - see the
    DELETE note in the module docstring; the original reading is gone from
    paper_scores and cannot be restored from the database alone.
    """
    row = (await db.execute(
        select(OCRCorrection).where(OCRCorrection.correction_id == correction_id)
    )).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="That correction no longer exists.")

    row.seen, row.means, row.note = data.seen, data.means, data.note
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail=DUPLICATE)

    rep = await correction_service.rescore_for(db, data.seen, data.means)
    await db.commit()
    await db.refresh(row)
    return OCRCorrectionSaved(correction=OCRCorrectionResponse.model_validate(row),
                              rescore=_summary(rep))


@router.delete("/{correction_id}")
async def delete_correction(
    correction_id: int,
    admin: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
):
    """Stop applying a correction from now on. Nothing is re-checked.

    Deliberately NOT a reverse cascade. The reading this correction replaced
    was overwritten in paper_scores when it was applied; the only place it
    still exists is the photograph. Putting a guess back would be inventing a
    reading, so papers already re-checked keep the meaning they were given,
    and the response says so plainly.
    """
    del admin
    row = (await db.execute(
        select(OCRCorrection).where(OCRCorrection.correction_id == correction_id)
    )).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="That correction no longer exists.")
    await db.delete(row)
    await db.commit()
    return {
        "deleted": True,
        "message": ("Papers checked from now on will no longer have that reading "
                    "corrected. Papers already re-checked keep the meaning they "
                    "were given - the original reading is only on the photograph "
                    "now. Check those papers again if you need them back."),
    }