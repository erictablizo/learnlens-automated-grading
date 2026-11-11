"""
NEW 2026-11-11 — the numbers behind the Data Analytics page.

Doc Rubrica, post-UAT recommendations, page 1:

    Data Analytics - separate clickable option in the side bar
    Choose Subject, Schedule and Exam Name (3 Details needed)
    No of Students that got highest score and list the details ...
    No of Students that who passed the exam and list the details ...
    No of Students that who failed the exam and list the details ...
    No of Students that got zero score and list the details ...
    Provide also info of number that students did not get the correct answer

The four student lists need only `last_name`, `first_name`, `total_score` and
`checked`, which GET /exams/{id}/papers already returns - the page computes
those in the browser, as the Summary Report does.

The LAST line is the one that needs a server. "number that students did not
get the correct answer" is per-ITEM, and nothing exposes per-item results in
bulk: PaperListResponse carries only the total. The alternative is one
GET /papers/{id} per student - 35 round trips for a 35-student section, which
is visibly slow and gets slower with the class size. One aggregate query
instead.
"""
from typing import List, Optional

from sqlalchemy import select, func, case, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import TestPaper, PaperScore
# The ownership check lives in exactly ONE place on purpose. Re-implementing
# it here would be a second copy of a security rule, which is precisely the
# defect fixed on 2026-11-11 in auth_service (_user_by_email had three callers
# and only one of them used it). The leading underscore is a smell - a public
# alias in paper_service would be tidier - but one source of truth beats a
# tidy name.
from app.services.paper_service import _owned_exam

# ocr_service writes this when an answer is blank or was not detected. Kept as
# a module constant so the meaning of the string is written down once.
BLANK_ANSWER = "—"


async def exam_item_analytics(
    db: AsyncSession,
    exam_id: int,
    user_id: int,
) -> Optional[dict]:
    """Per-item results across every paper in this exam.

    Returns None when the exam is not this teacher's - the route turns that
    into a 404, the same shape get_papers() uses, so the endpoint never
    confirms that someone else's exam_id exists.

    ONE query for the items, two cheap counts for the headline figures.
    """
    if not await _owned_exam(db, exam_id, user_id):
        return None

    # Papers: how many exist, and how many are finished. The distinction
    # matters everywhere in this project - a paper with identification items
    # still under review has a score that is a FLOOR, not a result.
    paper_rows = (await db.execute(
        select(
            func.count().label("total"),
            func.sum(case((TestPaper.checked == True, 1), else_=0)).label("checked"),  # noqa: E712
        ).where(TestPaper.exam_id == exam_id)
    )).one()

    # `verdict` is "" for rows written before the 2026-10-24 migration, and the
    # column is nullable, so EVERY comparison goes through coalesce. Without
    # it `verdict != 'review'` is NULL for a NULL row - not False - and SUM
    # skips it, silently under-counting both correct and wrong.
    verdict = func.coalesce(PaperScore.verdict, "")
    not_review = verdict != "review"

    rows = (await db.execute(
        select(
            PaperScore.question_number,
            func.count().label("answered"),
            func.sum(case((verdict == "review", 1), else_=0)).label("review"),
            func.sum(case((and_(not_review, PaperScore.is_correct == True), 1), else_=0)).label("correct"),    # noqa: E712
            func.sum(case((and_(not_review, PaperScore.is_correct == False), 1), else_=0)).label("wrong"),     # noqa: E712
            func.sum(case((PaperScore.student_answer == BLANK_ANSWER, 1), else_=0)).label("blank"),
            # MIN and MAX of the key this item was graded against. They differ
            # only when the answer key was edited and the papers graded before
            # the edit were never re-checked - exactly the gap the panel's
            # "update all Test Papers tied to this answer key" asks us to
            # close. Surfacing it is nearly free and it tells the teacher which
            # items are untrustworthy TODAY.
            func.min(PaperScore.correct_answer).label("key_min"),
            func.max(PaperScore.correct_answer).label("key_max"),
        )
        .join(TestPaper, TestPaper.paper_id == PaperScore.paper_id)
        .where(TestPaper.exam_id == exam_id)
        .group_by(PaperScore.question_number)
        .order_by(PaperScore.question_number)
    )).all()

    items: List[dict] = []
    for r in rows:
        key_min = r.key_min or ""
        key_max = r.key_max or ""
        items.append({
            "question_number": r.question_number,
            "correct_answer":  key_max,
            # True = this item was graded against more than one key.
            "key_mismatch":    key_min != key_max,
            "answered":        int(r.answered or 0),
            "correct":         int(r.correct or 0),
            "wrong":           int(r.wrong or 0),
            "review":          int(r.review or 0),
            "blank":           int(r.blank or 0),
        })

    return {
        "exam_id":        exam_id,
        "papers_total":   int(paper_rows.total or 0),
        "papers_checked": int(paper_rows.checked or 0),
        "items":          items,
    }