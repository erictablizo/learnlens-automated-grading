# -*- coding: utf-8 -*-
"""
backend/app/services/teacher_correction_service.py                2026-11-25
============================================================================

How many answers each teacher has re-corrected, and which ones.

    Ms. Melanie, Recommendations page 19, requirement 1:
    "Admin side can monitor how many the teachers recorrected answer"

WHAT IS COUNTED, AND WHY IT IS THIS AND NOT THE SAMPLES TABLE
-------------------------------------------------------------
A corrected item is a `paper_scores` row whose `ocr_confidence IS NULL`.

That is not a trick. `paper_answer_service.override_answer` sets it to NULL
on purpose - its own comment says "the confidence belonged to a reading that
has just been replaced by a human. Keeping it would attach a Tesseract number
to a typed answer." Nothing else in the codebase writes NULL there. Measured
2026-11-25, every grading path writes a number instead:

    ml/grader.py:27          ocr_confidence: float = 0.0     (dataclass default)
    ml/grader.py:163,186     conf if student_shown else 0.0  (0.0, not NULL,
                                                              when nothing was
                                                              detected)
    services/exam_service.py:461,581,593    round(float(...), 2)
    services/ocr_service.py:291             round(float(...), 2)

THE OBVIOUS ALTERNATIVE IS WRONG HERE. `ocr_correction_samples` also carries
`corrected_by`, and counting it would have been one GROUP BY. But
`correction_service.sample_worth_keeping` refuses four kinds of correction,
and the first refusal is the fatal one for a count:

    confidence is None  ->  the item was ALREADY corrected once

so a second edit is not recorded, nor is a correction to or from blank, nor
one involving a contested `a|b` reading. A teacher who corrected ten answers
could appear as five. That table answers "what has the reader got wrong",
which is Sir Alex's points 5 and 6, and it answers it well. It is the wrong
table for "how many did this teacher re-correct".

So: the COUNT comes from paper_scores, and the DETAIL joins the samples table
in where it exists. The two cannot disagree, because the count is the number
of rows the detail returns.

ATTRIBUTION IS BY EXAM OWNER, not by `samples.corrected_by`, and that is a
real choice. `paper_scores` has no "who typed this" column, so the teacher a
correction belongs to is the teacher whose exam it is. For this system the
two coincide: the ownership guards installed 2026-11-12 keep one teacher out
of another's papers. They differ only if an administrator corrects someone
else's paper, and then this counts it against the exam's owner. Said out loud
because a number on an admin screen should not have a hidden definition -
`corrected_by` is returned alongside in the detail rows, so a divergence is
visible rather than silent.
"""
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import (Exam, OCRCorrectionSample, PaperScore,
                               TestPaper, User)
from app.models.profile import UserProfile


async def counts_by_teacher(db: AsyncSession) -> list[dict]:
    """One row per account, with how many of its answers were re-corrected.

    EVERY ACCOUNT, including those with none. A teacher who has corrected
    nothing is exactly as interesting to an administrator as one who has
    corrected a hundred - the same reason admin.py counts teachers with
    correlated subqueries rather than a GROUP BY over joins, which would drop
    the zeros.
    """
    corrected = (
        select(Exam.created_by.label("uid"),
               func.count().label("n"))
        .select_from(PaperScore)
        .join(TestPaper, TestPaper.paper_id == PaperScore.paper_id)
        .join(Exam, Exam.exam_id == TestPaper.exam_id)
        .where(PaperScore.ocr_confidence.is_(None))
        .group_by(Exam.created_by)
        .subquery()
    )
    # Evidence kept about the READER - a subset, by design. Shown beside the
    # total so the gap between them is visible rather than being a thing the
    # specimen table silently disagrees with.
    samples = (
        select(OCRCorrectionSample.corrected_by.label("uid"),
               func.count().label("n"))
        .where(OCRCorrectionSample.corrected_by.is_not(None))
        .group_by(OCRCorrectionSample.corrected_by)
        .subquery()
    )

    rows = (await db.execute(
        select(User.user_id, User.email, User.role,
               UserProfile.last_name, UserProfile.first_name,
               func.coalesce(corrected.c.n, 0),
               func.coalesce(samples.c.n, 0))
        .select_from(User)
        .outerjoin(UserProfile, UserProfile.user_id == User.user_id)
        .outerjoin(corrected, corrected.c.uid == User.user_id)
        .outerjoin(samples, samples.c.uid == User.user_id)
        .order_by(func.coalesce(corrected.c.n, 0).desc(), User.user_id)
    )).all()

    out = []
    for uid, email, role, last, first, n_corr, n_samp in rows:
        name = ", ".join(p for p in ((last or "").strip(), (first or "").strip()) if p)
        out.append({
            "user_id":     uid,
            "email":       email,
            "role":        role,
            "name":        name or None,
            "corrections": int(n_corr),
            "samples":     int(n_samp),
        })
    return out


async def detail_for_teacher(db: AsyncSession, user_id: int,
                             limit: int = 500) -> tuple[list[dict], bool]:
    """Every re-corrected answer on that teacher's exams, newest exam first.

    LEFT JOIN to the samples table, not an inner one. The count above is the
    number of rows this returns, and an inner join would quietly drop exactly
    the corrections sample_worth_keeping refuses - the re-edits and the blanks
    - so the list would be shorter than the number beside it. A row with no
    sample still says what was corrected and to what; it just cannot say what
    the reader originally saw, because that was not kept.

    `limit` is a guard, not a pager: 500 corrections by one teacher is far
    past the point where a dialog is the right way to read them, and the
    caller is told when it bites.
    """
    rows = (await db.execute(
        select(PaperScore.score_id,
               Exam.exam_id, Exam.exam_name,
               PaperScore.question_number,
               PaperScore.student_answer,
               PaperScore.correct_answer,
               PaperScore.verdict,
               OCRCorrectionSample.seen,
               OCRCorrectionSample.confidence,
               OCRCorrectionSample.corrected_by,
               OCRCorrectionSample.created_at)
        .select_from(PaperScore)
        .join(TestPaper, TestPaper.paper_id == PaperScore.paper_id)
        .join(Exam, Exam.exam_id == TestPaper.exam_id)
        .outerjoin(OCRCorrectionSample,
                   OCRCorrectionSample.score_id == PaperScore.score_id)
        .where(PaperScore.ocr_confidence.is_(None), Exam.created_by == user_id)
        .order_by(Exam.exam_id.desc(), PaperScore.question_number)
        .limit(limit + 1)
    )).all()

    truncated = len(rows) > limit
    out = []
    for (score_id, exam_id, exam_name, qn, answer, correct, verdict,
         seen, conf, by, when) in rows[:limit]:
        out.append({
            "score_id":        score_id,
            "exam_id":         exam_id,
            "exam_name":       exam_name,
            "question_number": qn,
            # What it says NOW - the teacher's answer. `seen` is what the
            # reader had before them, and is None when the correction was not
            # kept as evidence (an already-corrected item, a blank, or a
            # contested reading).
            "answer":          answer,
            "correct_answer":  correct,
            "verdict":         verdict,
            "reader_saw":      seen,
            "reader_confidence": float(conf) if conf is not None else None,
            "corrected_by":    by,
            "corrected_at":    when,
        })
    return out, truncated


async def teacher_exists(db: AsyncSession, user_id: int) -> Optional[str]:
    """The account's email, or None. So the route can 404 rather than show an
    empty list for a user_id that was never real."""
    return (await db.execute(
        select(User.email).where(User.user_id == user_id))).scalar_one_or_none()