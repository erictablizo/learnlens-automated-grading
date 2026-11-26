# -*- coding: utf-8 -*-
"""
backend/app/api/routes/analytics_export.py                       2026-11-26
============================================================================

    Ms. Melanie, Recommendations page 22, requirement 3: a download on the
    Data Analytics screen holding that page's contents.

GET /api/exams/{exam_id}/analytics.xlsx?passing_pct=

A SIBLING OF export.xlsx, NOT A SHEET INSIDE IT. Her sentence rules the
other option out: "and not the existing 'Download Excel' Info". The exam
page keeps its workbook, this screen gets its own, and the two answer
different questions.

THE OWNERSHIP CHECK IS COPIED, NOT RE-DERIVED. export.py's own note says
why the order matters:

    "`exam_item_analytics` is called FIRST because it performs that
     ownership check (`_owned_exam`) and returns None on failure. Nothing
     else is read until it has passed, so an unauthorised caller never
     reaches the Exam row."

Same here, same order, and a 404 for both "no such exam" and "not yours" so
the endpoint cannot be used to discover which exam_ids exist.

TWO IMPORTS COME FROM THE ROUTE MODULE, not from the service they live in.
`_uid` and `exam_item_analytics` are taken from app.api.routes.analytics
because that module demonstrably has both in scope - it calls one and
depends on the other - whereas the service module they originate in is a
path I would be guessing at. The same reasoning as importing `_admin` from
admin.py rather than hunting for its definition.

PASSING_PCT IS THE SCREEN'S, NOT A DEFAULT. The Data Analytics page has a
Passing mark box and the teacher may have typed 70; the file must say what
the page says. Query() validates the range exactly as export.xlsx does.
"""
from typing import Any, Mapping

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.analytics import _uid, exam_item_analytics
from app.core.database import get_db
from app.models.models import AnswerKey, Exam
from app.services import paper_service
from app.services.analytics_export_service import (build_analytics_workbook,
                                                   filename_for_analytics)

router = APIRouter(prefix="/exams/{exam_id}", tags=["analytics"])

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

# The four fields build_analytics_workbook reads off a paper. Pulled by name
# rather than passing the row through, so an ORM object, a pydantic model and
# a plain dict all arrive in the one shape the builder expects - and so a
# column added to papers later cannot change what this file contains.
PAPER_FIELDS = ("last_name", "first_name", "total_score", "checked")


def _as_map(row: Any) -> Mapping[str, Any]:
    if isinstance(row, Mapping):
        return {k: row.get(k) for k in PAPER_FIELDS}
    return {k: getattr(row, k, None) for k in PAPER_FIELDS}


@router.get("/analytics.xlsx")
async def export_analytics_xlsx(
    exam_id: int,
    uid: int = Depends(_uid),
    db: AsyncSession = Depends(get_db),
    passing_pct: float = Query(60.0, ge=0, le=100),
):
    """The Data Analytics page as a one-sheet .xlsx."""
    analytics = await exam_item_analytics(db, exam_id, uid)
    if analytics is None:
        raise HTTPException(status_code=404, detail="Exam not found")

    exam = await db.get(Exam, exam_id)
    if exam is None:                      # deleted between the two reads
        raise HTTPException(status_code=404, detail="Exam not found")

    rows = await paper_service.get_papers(db, exam_id, uid)
    papers = [_as_map(r) for r in rows]

    # THE EXAM'S LENGTH IS ITS NUMBER OF ANSWER KEYS, counted here rather
    # than taken from len(items) - the same decision export.py records.
    # exam_item_analytics is free to return only the items that have been
    # answered, and on an exam whose papers are not graded yet that list is
    # empty, which would print "Items: 0" on an exam with fifteen questions.
    #
    # A count query rather than exam.answer_keys: the relationship is not
    # eager-loaded here, and touching it would raise MissingGreenlet in an
    # async session rather than quietly returning the wrong number.
    total_items = (await db.execute(
        select(func.count()).select_from(AnswerKey)
        .where(AnswerKey.exam_id == exam_id))).scalar_one()

    meta = {
        "exam_name":    getattr(exam, "exam_name", None),
        "subject":      getattr(exam, "subject", None),
        "schedule":     getattr(exam, "schedule", None),
        "total_items":  int(total_items or 0),
        # Added 2026-11-20 and absent on older rows; 0 makes the builder fall
        # back to the item count, so an un-priced exam still produces a file.
        "total_points": int(getattr(exam, "total_points", 0) or 0),
    }

    blob = build_analytics_workbook(
        meta, papers, analytics.get("items") or [], passing_pct=passing_pct)

    name = filename_for_analytics(meta)
    return Response(
        content=blob,
        media_type=XLSX,
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )