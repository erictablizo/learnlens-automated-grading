import os, uuid
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload
from fastapi import UploadFile

from app.models.models import TestPaper, PaperPage, PaperScore, Exam
from app.core.config import settings
from app.services.ocr_service import grade_paper
# NEW 2026-11-04 (Doc Rubrica, consultation, page 4). student_name is DERIVED
# from last_name + first_name now, and exactly one function in the codebase
# knows the "Last, First" format - this one, imported from _text.py so the
# browser's composeStudentName() can be held to the same string.
from app.schemas._text import compose_student_name


async def _owned_exam(db: AsyncSession, exam_id: int, user_id: int) -> Optional[Exam]:
    """The exam, but only if this teacher created it.

    NEW 2026-11-04. This was the first three lines of get_papers() and nothing
    else used it. MEASURED 2026-11-04 with two teachers against the real
    function bodies: of the five entry points in this module, ONLY get_papers
    took a user_id, so

        get_paper(db, paper_id)       Bob could READ   Alice's paper
        create_paper(db, exam_id, …)  Bob could CREATE a paper in Alice's exam
        delete_paper(db, paper_id)    Bob could DELETE Alice's paper

    all by id alone, and routes/papers.py passes uid to none of them.
    Authentication was enforced; authorisation was not.

    create_paper and rename_paper take user_id as of today. get_paper,
    delete_paper and add_paper_page still DO NOT - see the note at the bottom
    of this file.
    """
    return (await db.execute(
        select(Exam).where(Exam.exam_id == exam_id, Exam.created_by == user_id)
    )).scalar_one_or_none()


async def get_papers(db: AsyncSession, exam_id: int, user_id: int) -> List[TestPaper]:
    # CHANGED 2026-11-04: the ownership lookup moved into _owned_exam() so the
    # other functions can share it. Behaviour is identical - an exam this
    # teacher did not create still yields [].
    if not await _owned_exam(db, exam_id, user_id):
        return []
    result = await db.execute(
        select(TestPaper).where(TestPaper.exam_id == exam_id).order_by(TestPaper.added_at.desc())
    )
    return list(result.scalars().all())


async def get_paper(db: AsyncSession, paper_id: int) -> Optional[TestPaper]:
    result = await db.execute(
        select(TestPaper)
        .options(selectinload(TestPaper.paper_pages), selectinload(TestPaper.paper_scores))
        .where(TestPaper.paper_id == paper_id)
    )
    return result.scalar_one_or_none()


async def create_paper(
    db: AsyncSession,
    exam_id: int,
    user_id: int,
    *,
    last_name: str,
    first_name: str,
) -> Optional[TestPaper]:
    """Add a paper. Returns None when the exam is not this teacher's.

    CHANGED 2026-11-04, two things:

      1. It took `student_name: str` and did `.strip()`. The teacher no longer
         types that value - Add Paper has a Last name box and a First name box
         (her page 4) - so the two parts come in and student_name is composed
         from them. It is KEPT rather than dropped because it is read in at
         least six places and is the rollback the migration comment promises.

      2. user_id is NEW and so is the check. See _owned_exam() above for what
         was measured without it.

    The two names arrive already tidied: check_name_part() in schemas/paper.py
    runs tidy_text() and returns the tidied value, and compose_student_name()
    tidies again, which is idempotent.
    """
    if not await _owned_exam(db, exam_id, user_id):
        return None
    paper = TestPaper(
        exam_id=exam_id,
        last_name=last_name,
        first_name=first_name,
        student_name=compose_student_name(last_name, first_name),
    )
    db.add(paper)
    await db.commit()
    await db.refresh(paper)
    return paper


async def rename_paper(
    db: AsyncSession,
    paper_id: int,
    exam_id: int,
    user_id: int,
    *,
    last_name: str,
    first_name: str,
) -> Optional[TestPaper]:
    """NEW 2026-11-04 — the rename, and the HAND-SPLIT of the 18 old papers.

    PUT /exams/{id}/papers/{paper_id} used to do its own select / setattr /
    commit inside routes/papers.py with an unvalidated model. The body lives
    here because recomposing student_name is logic, because the route would
    otherwise be the second place that knows the "Last, First" format, and
    because the ownership check has one home.

    Returns None when the paper does not exist, is not in this exam, or the
    exam is not this teacher's - the route turns all three into one 404, which
    is deliberate: a 403 would confirm that someone else's paper_id exists.

    The score is NOT reset. A name has nothing to do with grading, unlike
    add_paper_page() below, which replaces the photo the score came from.
    """
    if not await _owned_exam(db, exam_id, user_id):
        return None
    paper = (await db.execute(
        select(TestPaper).where(
            TestPaper.paper_id == paper_id,
            TestPaper.exam_id == exam_id,
        )
    )).scalar_one_or_none()
    if not paper:
        return None
    paper.last_name    = last_name
    paper.first_name   = first_name
    paper.student_name = compose_student_name(last_name, first_name)
    await db.commit()
    await db.refresh(paper)
    return paper


async def delete_paper(db: AsyncSession, paper_id: int) -> bool:
    paper = (await db.execute(select(TestPaper).where(TestPaper.paper_id == paper_id))).scalar_one_or_none()
    if not paper:
        return False
    paths = (await db.execute(select(PaperPage.image_path).where(PaperPage.paper_id == paper_id))).scalars().all()
    await db.delete(paper)
    await db.commit()
    for p in paths:
        try:
            if os.path.exists(p):
                os.remove(p)
        except OSError:
            pass
    return True


async def add_paper_page(db: AsyncSession, paper_id: int, page_number: int, file: UploadFile) -> PaperPage:
    """
    FIX 2026-09-22: re-uploading page N (Edit Paper) crashed on the
    (paper_id, page_number) unique key. The page is now replaced, and because
    the old score came from the old photo, the paper is marked unchecked.
    """
    upload_dir = os.path.join(settings.UPLOAD_DIR, "paper_pages", str(paper_id))
    os.makedirs(upload_dir, exist_ok=True)
    ext = os.path.splitext(file.filename or "page.jpg")[1].lower() or ".jpg"
    file_path = os.path.join(upload_dir, f"page_{page_number}_{uuid.uuid4().hex[:8]}{ext}")
    data = await file.read()
    if not data:
        raise ValueError(f"The image for page {page_number} is empty.")
    with open(file_path, "wb") as f:
        f.write(data)

    page = (await db.execute(
        select(PaperPage).where(PaperPage.paper_id == paper_id, PaperPage.page_number == page_number)
    )).scalar_one_or_none()
    if page:
        old = page.image_path
        page.image_path = file_path
        await db.execute(delete(PaperScore).where(PaperScore.paper_id == paper_id))
        paper = (await db.execute(select(TestPaper).where(TestPaper.paper_id == paper_id))).scalar_one_or_none()
        if paper:
            paper.total_score = None
            paper.checked = False
        try:
            if old != file_path and os.path.exists(old):
                os.remove(old)
        except OSError:
            pass
    else:
        page = PaperPage(paper_id=paper_id, page_number=page_number, image_path=file_path)
        db.add(page)
    await db.commit()
    await db.refresh(page)
    return page


async def grade_and_update(db: AsyncSession, paper_id: int, exam_id: int) -> dict:
    """Grade the paper (question type comes from the answer key — see ocr_service)."""
    return await grade_paper(db, paper_id, exam_id)


# ---------------------------------------------------------------------------
# STILL UNGUARDED as of 2026-11-04 — get_paper, delete_paper, add_paper_page
#
# Each identifies its target by id alone and takes no user_id, and
# routes/papers.py passes none. MEASURED with two teachers: Bob can read and
# delete Alice's paper by guessing a paper_id. create_paper and rename_paper
# are guarded above; these three are not, because this change set is item B
# (the name split) and widening it further was Grace's call to make, not mine.
#
# The fix is three small edits, each the same shape:
#
#     async def delete_paper(db, paper_id, exam_id, user_id) -> bool:
#         if not await _owned_exam(db, exam_id, user_id):
#             return False
#         ...
#
# plus `exam_id=exam_id, uid` at the three call sites in routes/papers.py.
# ---------------------------------------------------------------------------