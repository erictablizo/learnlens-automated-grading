import os, shutil
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.config import settings
# CHANGED 2026-11-04: PaperUpdate is imported now. It already existed in
# schemas/paper.py and this file never imported it - the PUT below used a local
# PaperNameUpdate(BaseModel) with NO validators instead, so the entire
# character-rule programme of 2026-10-22/23 was bypassable on that endpoint.
# MEASURED: it accepted "@@@", "", "   ", "123", "<script>alert(1)</script>"
# and 300 characters (the last reaching varchar(255) as a 500, not a 422).
from app.schemas.paper import (
    PaperCreate, PaperUpdate, PaperResponse, PaperListResponse, GradeResponse,
    # NEW 2026-10-24 — review queue (add these to app/schemas/paper.py)
    ReviewItemResponse, ReviewResolveRequest, ReviewResolveResponse,
)
from app.services import paper_service
from app.services.ocr_service import resolve_review
from app.services.auth_service import get_current_user
from app.models.models import TestPaper, PaperPage, PaperScore
from sqlalchemy import select, delete

router = APIRouter(prefix="/exams/{exam_id}/papers", tags=["papers"])
bearer = HTTPBearer()


async def _uid(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> int:
    user = await get_current_user(db, credentials.credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user.user_id


# REMOVED 2026-11-04 — class PaperNameUpdate(BaseModel): student_name: str
#
# It had no validators of any kind, and schemas/paper.py already held a
# validated PaperUpdate that this file did not import. Validation for the
# rename now comes from the schema, where the rest of this project keeps it.


@router.get("", response_model=List[PaperListResponse])
async def list_papers(exam_id: int, uid: int = Depends(_uid), db: AsyncSession = Depends(get_db)):
    return await paper_service.get_papers(db, exam_id, uid)


@router.post("", response_model=PaperListResponse, status_code=201)
async def create_paper(exam_id: int, data: PaperCreate, uid: int = Depends(_uid), db: AsyncSession = Depends(get_db)):
    # FIX 2026-11-04 (Doc Rubrica, consultation, page 4): this line named
    # student_name one argument at a time, so the two new fields were validated
    # by PaperCreate and then dropped on the floor - the same bug as the
    # year_level route and the subject route, third occurrence.
    # MEASURED: the service received {'student_name': None} and nothing else.
    #
    # student_name is NOT passed from here. paper_service composes it from the
    # two parts, so exactly one place in the codebase knows the "Last, First"
    # format.
    #
    # CHANGED 2026-11-04 (second pass): `uid` is passed and the result is
    # checked. paper_service.create_paper takes user_id as of the same day -
    # MEASURED with two teachers, without it ANY teacher could inject a paper
    # into ANY exam by id - and it returns None when the exam is not this
    # teacher's, which `return await ...` would hand to a PaperListResponse
    # response_model as a 500.
    #
    # CHANGED 2026-11-09: DuplicatePaper -> 409. MEASURED 2026-11-09, four
    # submissions of the same Last/First produced four rows, all answered 201,
    # indistinguishable in the list except by paper_id, and the Summary Report
    # counted them as four students; the migration creates CREATE INDEX, not
    # CREATE UNIQUE INDEX, so nothing refused them.
    #
    # 409 and not 422: the request is well-formed and every field is valid. It
    # is the server's existing state that refuses it, and 422 would tell the
    # teacher she typed something wrong when she did not.
    #
    # detail is a plain STRING, like every other validation message here, so
    # api.ts's `body.detail ?? message` puts it on ApiError.message and the Add
    # Paper modal shows it with NO frontend change.
    try:
        paper = await paper_service.create_paper(
            db, exam_id, uid,
            last_name=data.last_name,
            first_name=data.first_name,
        )
    except paper_service.DuplicatePaper as dup:
        raise HTTPException(status_code=409, detail=dup.message)
    if not paper:
        raise HTTPException(status_code=404, detail="Exam not found")
    return paper


@router.get("/{paper_id}", response_model=PaperResponse)
async def get_paper(exam_id: int, paper_id: int, uid: int = Depends(_uid), db: AsyncSession = Depends(get_db)):
    # FIX: look up by paper_id only — don't check exam_id here to avoid
    # false 404s when exam_id in URL doesn't exactly match DB value
    paper = await paper_service.get_paper(db, paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    return paper


@router.put("/{paper_id}", response_model=PaperListResponse)
async def update_paper_name(exam_id: int, paper_id: int, data: PaperUpdate, uid: int = Depends(_uid), db: AsyncSession = Depends(get_db)):
    # CHANGED 2026-11-04. Two things:
    #
    #  1. PaperUpdate replaces the inline, unvalidated PaperNameUpdate - see
    #     the import comment above for what that model accepted.
    #
    #  2. This is the HAND-SPLIT endpoint. The teacher opens Edit Paper on one
    #     of the 18 papers that predate the migration, the Last name / First
    #     name boxes arrive pre-filled from a best-effort split of
    #     student_name, she corrects them, and student_name is rewritten from
    #     the parts so every existing read site stays correct.
    #
    # The select / setattr / commit body moved into paper_service.rename_paper:
    # recomposing student_name is logic, this would otherwise be the second
    # place that knows the format, and the service is where an ownership check
    # belongs. The 404 shape matches delete_paper and grade_paper below.
    # CHANGED 2026-11-04 (second pass): `uid`, same reason as create_paper.
    #
    # CHANGED 2026-11-09: the duplicate guard applies here too, or Edit Paper
    # is a way round the Add Paper validation - renaming paper B onto paper A's
    # name is the same collision by another route. The service excludes this
    # paper_id, so re-saving a paper under its own name, or changing only its
    # capitalisation, is not a duplicate.
    #
    # The service checks ownership, then fetches the paper, then looks for the
    # duplicate, so a 404 ("no such paper in this exam") still beats the 409.
    try:
        paper = await paper_service.rename_paper(
            db, paper_id, exam_id, uid,
            last_name=data.last_name,
            first_name=data.first_name,
        )
    except paper_service.DuplicatePaper as dup:
        raise HTTPException(status_code=409, detail=dup.message)
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    return paper


@router.delete("/{paper_id}", status_code=204)
async def delete_paper(exam_id: int, paper_id: int, uid: int = Depends(_uid), db: AsyncSession = Depends(get_db)):
    ok = await paper_service.delete_paper(db, paper_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Paper not found")


@router.post("/{paper_id}/pages", status_code=201)
async def upload_paper_page(
    exam_id:     int,
    paper_id:    int,
    page_number: int        = Form(...),
    file:        UploadFile = File(...),
    uid: int = Depends(_uid),
    db: AsyncSession = Depends(get_db),
):
    # FIX: Accept image/jpg and application/octet-stream (Windows browsers)
    ALLOWED_TYPES = {
        "image/jpeg", "image/jpg", "image/png",
        "image/webp", "image/tiff", "application/octet-stream",
    }
    ALLOWED_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".tiff", ".tif"}
    filename = file.filename or ""
    ext      = os.path.splitext(filename)[1].lower()
    ct       = (file.content_type or "").lower()
    if ct not in ALLOWED_TYPES and ext not in ALLOWED_EXTS:
        raise HTTPException(status_code=400, detail=f"Only image files are allowed (got '{ct}').")

    page = await paper_service.add_paper_page(db, paper_id, page_number, file)
    return {"paper_page_id": page.paper_page_id, "page_number": page.page_number, "image_path": page.image_path}


@router.delete("/{paper_id}/pages/{page_id}", status_code=204)
async def delete_paper_page(exam_id: int, paper_id: int, page_id: int, uid: int = Depends(_uid), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PaperPage).where(PaperPage.paper_page_id == page_id, PaperPage.paper_id == paper_id)
    )
    page = result.scalar_one_or_none()
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    if os.path.exists(page.image_path):
        try:
            os.remove(page.image_path)
        except OSError:
            pass
    await db.delete(page)
    await db.commit()


@router.post("/{paper_id}/reset", status_code=200)
async def reset_paper_score(exam_id: int, paper_id: int, uid: int = Depends(_uid), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TestPaper).where(TestPaper.paper_id == paper_id))
    paper  = result.scalar_one_or_none()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    await db.execute(delete(PaperScore).where(PaperScore.paper_id == paper_id))
    paper.total_score = None
    paper.checked     = False
    await db.commit()
    return {"message": "Score reset. Re-grade when ready."}


@router.post("/{paper_id}/grade", response_model=GradeResponse)
async def grade_paper(
    exam_id:  int,
    paper_id: int,
    uid: int = Depends(_uid),
    db: AsyncSession = Depends(get_db),
):
    # FIX: look up paper by paper_id only — the exam_id mismatch check
    # caused false 404s when the URL exam_id differed from the stored value
    paper = await paper_service.get_paper(db, paper_id)
    if not paper or paper.exam_id != exam_id:
        raise HTTPException(status_code=404, detail="Paper not found")

    # Use the exam_id stored on the paper itself for grading
    result = await paper_service.grade_and_update(db, paper_id, paper.exam_id)
    if not result.get("success"):
        raise HTTPException(status_code=422, detail=result.get("reason", "Grading failed"))
    return result


# ---------------------------------------------------------------------------
# NEW 2026-10-24 — the review queue (Doc Rubrica's sixth comment, Part IV)
#
# Identification answers are words, and grading them is not safe to automate:
# similarity('UBSECT','SUBJECT') and similarity('OBJECT','SUBJECT') are both
# 0.714 - a correct answer read badly and a wrong answer read perfectly score
# the same, so no threshold separates them (see app/ml/ocr_identification.py).
#
# So those items come back marked `review`, and `grade_paper` leaves the paper
# `checked = False` while any remain: the score is a FLOOR, not a result. These
# two endpoints are what closes them. WITHOUT THEM a paper with an
# identification part stays unchecked for ever.
# ---------------------------------------------------------------------------

@router.get("/{paper_id}/review", response_model=List[ReviewItemResponse])
async def list_review_items(
    exam_id:  int,
    paper_id: int,
    uid: int = Depends(_uid),
    db: AsyncSession = Depends(get_db),
):
    """The items on this paper still waiting for a human decision.

    `image_path` is the page the item was read from, so the queue can show the
    teacher the handwriting instead of asking her to judge a string she cannot
    check. That is the whole point of the review state.
    """
    paper = (await db.execute(select(TestPaper).where(TestPaper.paper_id == paper_id))).scalar_one_or_none()
    if not paper or paper.exam_id != exam_id:
        raise HTTPException(status_code=404, detail="Paper not found")

    rows = (await db.execute(
        select(PaperScore, PaperPage.page_number, PaperPage.image_path)
        .join(PaperPage, PaperPage.paper_page_id == PaperScore.paper_page_id)
        .where(PaperScore.paper_id == paper_id, PaperScore.verdict == "review")
        .order_by(PaperScore.question_number)
    )).all()
    return [
        {
            "question_number": s.question_number,
            "student_answer":  s.student_answer,
            "correct_answer":  s.correct_answer,
            "ocr_confidence":  float(s.ocr_confidence) if s.ocr_confidence is not None else 0.0,
            "page_number":     page_no,
            "image_path":      image_path,
        }
        for s, page_no, image_path in rows
    ]


@router.post("/{paper_id}/review/{question_number}", response_model=ReviewResolveResponse)
async def resolve_review_item(
    exam_id:         int,
    paper_id:        int,
    question_number: int,
    data: ReviewResolveRequest,
    uid: int = Depends(_uid),
    db: AsyncSession = Depends(get_db),
):
    """Mark one reviewed item correct or wrong, and re-total the paper.

    The paper becomes `checked` once nothing is left under review. 422 when
    the item is not under review (already decided, or never was), because the
    client asked for something the current state does not allow - the same
    code the grade endpoint uses for that.
    """
    paper = (await db.execute(select(TestPaper).where(TestPaper.paper_id == paper_id))).scalar_one_or_none()
    if not paper or paper.exam_id != exam_id:
        raise HTTPException(status_code=404, detail="Paper not found")

    result = await resolve_review(db, paper_id, question_number, data.is_correct)
    if not result.get("success"):
        raise HTTPException(status_code=422, detail=result.get("reason", "Could not resolve this item."))
    return result