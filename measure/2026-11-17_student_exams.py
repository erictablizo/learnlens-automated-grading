"""
measure/2026-11-17_student_exams.py — Recommendations page 11.

The REAL exams_for_student() body, run against a database whose columns are
copied from models.py: Exam.created_by/subject/schedule/created_at,
TestPaper.student_id/total_score/checked, AnswerKey.exam_id,
PaperScore.verdict.

    python 2026-11-17_student_exams.py
"""
import asyncio, datetime as dt, sys
from sqlalchemy import (Boolean, Column, DateTime, ForeignKey, Integer,
                        SmallInteger, String, func, select)
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import declarative_base, sessionmaker

Base = declarative_base()
OK = FAIL = 0
def check(label, cond, got="", note=""):
    global OK, FAIL
    if cond: OK += 1; print(f"  ok    {label}  ({got})")
    else:
        FAIL += 1; print(f"  FAIL  {label}  ({got})")
        if note: print(f"        {note}")

class Exam(Base):
    __tablename__ = "exams"
    exam_id = Column(Integer, primary_key=True)
    created_by = Column(Integer, nullable=False)
    exam_name = Column(String(255))
    subject = Column(String(255))
    schedule = Column(String(255))
    created_at = Column(DateTime, default=dt.datetime.now)

class AnswerKey(Base):
    __tablename__ = "answer_keys"
    answer_key_id = Column(Integer, primary_key=True)
    exam_id = Column(Integer, ForeignKey("exams.exam_id"), nullable=False)
    question_number = Column(SmallInteger)

class TestPaper(Base):
    __tablename__ = "test_papers"
    paper_id = Column(Integer, primary_key=True)
    exam_id = Column(Integer, ForeignKey("exams.exam_id"), nullable=False)
    student_name = Column(String(255))
    total_score = Column(SmallInteger)
    checked = Column(Boolean, default=False, nullable=False)
    added_at = Column(DateTime, default=dt.datetime.now)
    student_id = Column(Integer)

class PaperScore(Base):
    __tablename__ = "paper_scores"
    score_id = Column(Integer, primary_key=True)
    paper_id = Column(Integer, ForeignKey("test_papers.paper_id"), nullable=False)
    question_number = Column(SmallInteger)
    verdict = Column(String(32))

# ===================== THE FUNCTION UNDER TEST, VERBATIM =====================
async def exams_for_student(db: AsyncSession, owner_id: int, student_id: int):
    under_review = (
        select(func.count(PaperScore.score_id))
        .where(PaperScore.paper_id == TestPaper.paper_id,
               PaperScore.verdict == "review")
        .correlate(TestPaper).scalar_subquery().label("under_review")
    )
    total_items = (
        select(func.count(AnswerKey.answer_key_id))
        .where(AnswerKey.exam_id == Exam.exam_id)
        .correlate(Exam).scalar_subquery().label("total_items")
    )
    rows = (await db.execute(
        select(TestPaper.paper_id, Exam.exam_id, Exam.exam_name, Exam.subject,
               Exam.schedule, TestPaper.total_score, TestPaper.checked,
               total_items, under_review)
        .join(Exam, Exam.exam_id == TestPaper.exam_id)
        .where(TestPaper.student_id == student_id, Exam.created_by == owner_id)
        .order_by(Exam.created_at.desc(), Exam.exam_id.desc())
    )).all()
    return [{
        "paper_id": r.paper_id, "exam_id": r.exam_id, "exam_name": r.exam_name,
        "subject": r.subject, "schedule": r.schedule,
        "total_score": r.total_score, "checked": r.checked,
        "total_items": r.total_items, "under_review": r.under_review,
    } for r in rows]
# =============================================================================

async def main():
    eng = create_async_engine("sqlite+aiosqlite://")
    async with eng.begin() as c: await c.run_sync(Base.metadata.create_all)
    S = sessionmaker(eng, class_=AsyncSession, expire_on_commit=False)
    t0 = dt.datetime(2026, 11, 1)
    async with S() as db:
        # teacher 1 owns Midterm (15 items) and Final (30 items); teacher 2 owns Quiz
        db.add_all([
            Exam(exam_id=1, created_by=1, exam_name="Midterm Exam 1", subject="English 101",
                 schedule="MWF 9:30 am to 11:30 am", created_at=t0),
            Exam(exam_id=2, created_by=1, exam_name="Final Exam", subject="English 101",
                 schedule="MWF 9:30 am to 11:30 am", created_at=t0 + dt.timedelta(days=5)),
            Exam(exam_id=3, created_by=2, exam_name="Another Teacher's Quiz",
                 subject="Math 2", schedule="TTh", created_at=t0 + dt.timedelta(days=2)),
        ])
        for i in range(15): db.add(AnswerKey(exam_id=1, question_number=i + 1))
        for i in range(30): db.add(AnswerKey(exam_id=2, question_number=i + 1))
        for i in range(10): db.add(AnswerKey(exam_id=3, question_number=i + 1))
        db.add_all([
            # FINAL: checked, score present
            TestPaper(paper_id=1, exam_id=1, student_id=41, total_score=13, checked=True),
            # UNDER REVIEW: not checked, but a floor score exists
            TestPaper(paper_id=2, exam_id=2, student_id=41, total_score=28, checked=False),
            # NOT CHECKED AT ALL: no score
            TestPaper(paper_id=3, exam_id=3, student_id=41, total_score=None, checked=False),
        ])
        db.add_all([PaperScore(paper_id=2, question_number=q, verdict="review") for q in (7, 19)])
        db.add(PaperScore(paper_id=2, question_number=1, verdict="correct"))
        db.add(PaperScore(paper_id=1, question_number=1, verdict="correct"))
        await db.commit()

        print("=" * 72); print("1. TEACHER 1 — her own two exams, newest first"); print("=" * 72)
        got = await exams_for_student(db, 1, 41)
        for r in got:
            print(f"  {r['exam_name']:<22} score={r['total_score']} checked={r['checked']} "
                  f"items={r['total_items']} review={r['under_review']}")
        check("two rows, not three", len(got) == 2, str(len(got)),
              "CONTROL: exam 3 belongs to teacher 2 and must not appear.")
        check("newest exam first", [r["exam_name"] for r in got] == ["Final Exam", "Midterm Exam 1"],
              str([r["exam_name"] for r in got]))
        fin = next(r for r in got if r["exam_name"] == "Midterm Exam 1")
        check("FINAL paper: checked, 13 of 15", fin["checked"] and fin["total_score"] == 13
              and fin["total_items"] == 15, f"{fin['total_score']}/{fin['total_items']}")
        check("  and nothing under review", fin["under_review"] == 0, str(fin["under_review"]))
        rev = next(r for r in got if r["exam_name"] == "Final Exam")
        check("UNDER REVIEW: not checked, floor 28 of 30", (not rev["checked"])
              and rev["total_score"] == 28 and rev["total_items"] == 30,
              f"{rev['total_score']}/{rev['total_items']}")
        check("  two items counted under review", rev["under_review"] == 2, str(rev["under_review"]),
              "The correlated subquery must count only THIS paper's review rows.")
        check("  the 'correct' row is not counted", rev["under_review"] != 3, str(rev["under_review"]))

        print("\n" + "=" * 72); print("2. THE OWNERSHIP GUARD"); print("=" * 72)
        other = await exams_for_student(db, 2, 41)
        print(f"  teacher 2 sees: {[r['exam_name'] for r in other]}")
        check("teacher 2 sees only their own exam", [r["exam_name"] for r in other]
              == ["Another Teacher's Quiz"], str([r["exam_name"] for r in other]))
        check("  and its paper is the NOT-CHECKED shape",
              other[0]["total_score"] is None and not other[0]["checked"],
              f"score={other[0]['total_score']}")
        none_ = await exams_for_student(db, 3, 41)
        check("a teacher with no exams gets []", none_ == [], str(none_))
        nobody = await exams_for_student(db, 1, 999)
        check("an unknown student gets []", nobody == [], str(nobody))

        print("\n" + "=" * 72); print("3. THE THREE DISPLAY STATES"); print("=" * 72)
        def state(r):
            if r["checked"] and r["total_score"] is not None: return "score"
            if r["total_score"] is not None: return "review"
            return "unchecked"
        allrows = await exams_for_student(db, 1, 41) + await exams_for_student(db, 2, 41)
        states = {r["exam_name"]: state(r) for r in allrows}
        print(f"  {states}")
        check("all three states are reachable", set(states.values()) == {"score", "review", "unchecked"},
              str(sorted(set(states.values()))),
              "If one were unreachable the page would have a branch nothing can render.")
    await eng.dispose()
    print("\n" + "=" * 72); print(f"{OK} checks passed, {FAIL} failed")
    return 1 if FAIL else 0

sys.exit(asyncio.run(main()))
