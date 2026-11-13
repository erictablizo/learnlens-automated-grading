"""
app/api/routes/admin.py
=======================
NEW 2026-11-13 — the administrator view.

    Alex Passion / Julius Bancud, post-UAT page 2, item 1:
    "(*) Admin -> ID -> to handle maintenance"

REGISTER IT. One line in `backend/app/api/routes/__init__.py`, beside the
others - NOT in main.py, which does `from app.api.routes import router` and
names no individual router.

WHY THIS IS A SEPARATE ROUTER AND NOT A FLAG ON THE EXISTING ONES
------------------------------------------------------------------
The obvious way to add an administrator is to change every ownership test
from `created_by == uid` to `created_by == uid OR is_admin`. That is eight
edits to `papers.py` alone, in the exact checks that were found WIDE OPEN on
2026-11-12 and closed the same day - and a mistake in any one of them hands a
teacher another teacher's papers again.

So not one existing check is touched. `_owned_exam` and `_owned_paper` keep
answering exactly one question - does THIS TEACHER own this? - and keep
answering it the same way. Everything an administrator can see lives here,
behind `_admin`, under one prefix.

Three things follow, and they are the reason for the design:

  * no regression risk to the 2026-11-12 fix, because nothing it touches is
    edited;
  * `/admin` is the COMPLETE list of places one user sees another's data -
    one grep, no judgement needed;
  * a bug in this file cannot widen a teacher's access, because the teacher
    paths never consult the role at all.

403, NOT 404
------------
`papers.py` answers 404 for a paper you do not own, so an id cannot be probed
for existence. Here 403 is right instead: this endpoint's existence is not a
secret, the caller is authenticated and known, and "you are not an
administrator" is the honest answer. Hiding it would only make a teacher who
hit the URL think the feature was broken.
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import AnswerKey, Exam, Student, TestPaper, User
from app.schemas.admin import AdminExam, AdminOverview, AdminTeacher
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/admin", tags=["admin"])
bearer = HTTPBearer()

ADMIN = "admin"


async def _admin(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    """The signed-in user, or refuse. Administrators only.

    The role is read from the DATABASE, not from the token. `get_current_user`
    already selects the whole row, so this costs nothing extra and means
    removing an administrator takes effect on their very next request rather
    than whenever their JWT happens to expire.

    `getattr(user, "role", "")` rather than `user.role`: if this file is ever
    deployed before the migration has run, the attribute is missing and the
    honest outcome is that NOBODY is an administrator - not a 500, and
    certainly not everybody.
    """
    user = await get_current_user(db, credentials.credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if (getattr(user, "role", "") or "").strip().lower() != ADMIN:
        raise HTTPException(status_code=403,
                            detail="Administrator access is required.")
    return user


@router.get("/overview", response_model=AdminOverview)
async def overview(
    _: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
):
    """One line of totals for the whole installation."""
    async def count(model) -> int:
        return (await db.execute(select(func.count()).select_from(model))).scalar_one()

    admins = (await db.execute(
        select(func.count()).select_from(User).where(User.role == ADMIN)
    )).scalar_one()
    users = await count(User)
    return {
        "teachers": users - admins,
        "admins":   admins,
        "exams":    await count(Exam),
        "papers":   await count(TestPaper),
        "students": await count(Student),
    }


@router.get("/teachers", response_model=List[AdminTeacher])
async def teachers(
    _: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
):
    """Every account, with how much of the system it owns.

    CORRELATED SUBQUERIES, not GROUP BY over joins. Two reasons, both
    measured on a seeded database: a teacher who has created nothing still
    appears, with zeros - and that teacher is exactly who an administrator is
    looking for - and counting exams and students in one joined query
    multiplies them by each other.
    """
    n_exams = (select(func.count()).select_from(Exam)
               .where(Exam.created_by == User.user_id).scalar_subquery())
    n_students = (select(func.count()).select_from(Student)
                  .where(Student.created_by == User.user_id).scalar_subquery())
    n_papers = (select(func.count()).select_from(TestPaper)
                .join(Exam, Exam.exam_id == TestPaper.exam_id)
                .where(Exam.created_by == User.user_id).scalar_subquery())

    rows = (await db.execute(
        select(User.user_id, User.email, User.role,
               n_exams.label("exams"),
               n_students.label("students"),
               n_papers.label("papers"))
        .order_by(User.email)
    )).all()
    return [
        {"user_id": uid, "email": email, "role": role,
         "exams": e, "students": s, "papers": p}
        for uid, email, role, e, s, p in rows
    ]


@router.get("/exams", response_model=List[AdminExam])
async def exams(
    _: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
):
    """Every exam in the installation and whose it is.

    `items` is the number of answer-key rows, so 0 means the key has not been
    generated yet - the state that makes an exam look finished and grade
    nothing. `checked` counts papers whose score is final; the difference
    between `papers` and `checked` is work still outstanding.
    """
    n_items = (select(func.count()).select_from(AnswerKey)
               .where(AnswerKey.exam_id == Exam.exam_id).scalar_subquery())
    n_papers = (select(func.count()).select_from(TestPaper)
                .where(TestPaper.exam_id == Exam.exam_id).scalar_subquery())
    n_checked = (select(func.count()).select_from(TestPaper)
                 .where(TestPaper.exam_id == Exam.exam_id,
                        TestPaper.checked.is_(True)).scalar_subquery())

    rows = (await db.execute(
        select(Exam.exam_id, Exam.exam_name, Exam.subject, Exam.schedule,
               User.email, User.user_id,
               n_items.label("items"),
               n_papers.label("papers"),
               n_checked.label("checked"))
        .join(User, User.user_id == Exam.created_by)
        .order_by(User.email, Exam.exam_id)
    )).all()
    return [
        {"exam_id": xid, "exam_name": name, "subject": subj, "schedule": sched,
         "owner_email": email, "owner_id": oid,
         "items": items, "papers": papers, "checked": checked}
        for xid, name, subj, sched, email, oid, items, papers, checked in rows
    ]