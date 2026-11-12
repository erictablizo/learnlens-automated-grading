"""
app/api/routes/export.py
========================
NEW 2026-11-12 — GET /exams/{exam_id}/export.xlsx

    Alex Passion / Julius Bancud, page 2 item 6:
    "Results: Export -> to Excel / PDF.  Sorting ->"

REGISTER IT. One line in `backend/app/api/routes/__init__.py`, beside the
others — NOT in main.py. `main.py` does `from app.api.routes import router`
and `app.include_router(router, prefix="/api")`, naming no individual router,
so a line added there mounts this at `/exams/2/export.xlsx` with no `/api`
and the download 404s.

A SEPARATE ROUTER for the same reason analytics.py is one: routes/papers.py
has prefix "/exams/{exam_id}/papers" and this path is a SIBLING of it, not a
child.

NOTHING IS COUNTED TWICE
------------------------
Every number in the workbook comes from the code that already produces it:

  * per-item correct/wrong/blank/review  -> `exam_item_analytics`, the same
    call behind the Data Analytics page, so the two can never disagree.
  * each paper's score and checked flag   -> `PaperListResponse.model_validate`,
    which is literally what FastAPI runs for `GET .../papers` (list_papers
    returns raw rows under `response_model=List[PaperListResponse]`). The
    spreadsheet therefore shows the same score the exam page shows, assembled
    by the same code.
  * total items                           -> counted from the ANSWER KEYS.

The one rule that IS duplicated is who passed: `analytics/page.tsx` computes
it in the browser and `export_service.passing_mark` computes it here, because
no backend function owns it. They agree today (ceil, not round; only checked
papers; zero is a subset of failed). IF THE PASSING RULE CHANGES, BOTH MOVE.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import AnswerKey, Exam, Student
from app.schemas.paper import PaperListResponse
from app.services import paper_service
from app.services.analytics_service import exam_item_analytics
from app.services.auth_service import get_current_user
from app.services.export_service import build_workbook, filename_for

router = APIRouter(prefix="/exams/{exam_id}", tags=["export"])
bearer = HTTPBearer()

XLSX_MEDIA_TYPE = (
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
)


async def _uid(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> int:
    user = await get_current_user(db, credentials.credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user.user_id


def _sort_key(p: PaperListResponse):
    """Surname, then given name, then paper_id.

    Mirrors `bySurname` in PapersTable.tsx so the file lands in the order the
    teacher was looking at when they pressed Download. `casefold()`, not
    `lower()`: it is the correct case-insensitive fold and matches the
    `sensitivity: "base"` collator the table uses. paper_id last keeps the
    order STABLE when two students genuinely share a name.
    """
    return ((p.last_name or "").casefold(),
            (p.first_name or "").casefold(),
            p.paper_id)


def _paper_rows(papers: List[PaperListResponse], numbers: dict) -> List[dict]:
    """The plain dicts `build_workbook` takes, already sorted."""
    return [
        {
            "student_number": numbers.get(p.student_id, ""),
            "last_name": p.last_name,
            "first_name": p.first_name,
            "total_score": p.total_score,
            "checked": p.checked,
        }
        for p in sorted(papers, key=_sort_key)
    ]


@router.get("/export.xlsx")
async def export_exam_xlsx(
    exam_id: int,
    uid: int = Depends(_uid),
    db: AsyncSession = Depends(get_db),
    passing_pct: float = Query(75.0, ge=0, le=100),
):
    """The exam's results as a three-sheet .xlsx.

    404 when the exam does not exist OR is not this teacher's - deliberately
    the same answer for both, so the endpoint cannot be used to discover which
    exam_ids exist. Same reasoning as `exam_analytics` and `rename_paper`.

    `exam_item_analytics` is called FIRST because it performs that ownership
    check (`_owned_exam`) and returns None on failure. Nothing else is read
    until it has passed, so an unauthorised caller never reaches the Exam row.
    """
    analytics = await exam_item_analytics(db, exam_id, uid)
    if analytics is None:
        raise HTTPException(status_code=404, detail="Exam not found")

    exam = await db.get(Exam, exam_id)
    if exam is None:                      # deleted between the two reads
        raise HTTPException(status_code=404, detail="Exam not found")

    rows = await paper_service.get_papers(db, exam_id, uid)
    papers = [PaperListResponse.model_validate(r) for r in rows]

    # student_id -> student_number, for this teacher's roster only. A plain
    # id lookup, no rule in it; papers whose student was removed (the FK is
    # ON DELETE SET NULL) simply get a blank cell.
    numbers = {
        sid: num for sid, num in (
            await db.execute(
                select(Student.student_id, Student.student_number)
                .where(Student.created_by == uid)
            )
        ).all()
    }

    items = analytics.get("items") or []

    # The exam's LENGTH is its number of answer keys, counted here rather than
    # taken from len(items). `exam_item_analytics` is free to return only the
    # items that have been answered, and on an exam whose papers are not graded
    # yet that list is empty - which would make this the denominator of every
    # percentage in the file and blank the lot. Counting the keys is one cheap
    # query and cannot drift with another service's internals.
    total_items = (await db.execute(
        select(func.count()).select_from(AnswerKey)
        .where(AnswerKey.exam_id == exam_id)
    )).scalar_one() or len(items)

    data = build_workbook(
        exam={
            "exam_name": exam.exam_name,
            "subject": exam.subject,
            "schedule": exam.schedule,
            "total_items": total_items,
        },
        papers=_paper_rows(papers, numbers),
        items=items,
        passing_pct=passing_pct,
    )

    name = filename_for({"exam_name": exam.exam_name})
    return StreamingResponse(
        iter([data]),
        media_type=XLSX_MEDIA_TYPE,
        headers={
            "Content-Disposition": f'attachment; filename="{name}"',
            # Without this the browser's fetch() cannot read the filename and
            # the download lands as "export.xlsx" regardless of the header.
            "Access-Control-Expose-Headers": "Content-Disposition",
            "Content-Length": str(len(data)),
        },
    )