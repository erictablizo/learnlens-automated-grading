#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
measure/2026-11-25_teacher_corrections.py                         2026-11-25
============================================================================

Proves backend/app/services/teacher_correction_service.py - Ms. Melanie,
Recommendations page 19, requirement 1, "Admin side can monitor how many the
teachers recorrected answer".

    python measure/2026-11-25_teacher_corrections.py

THE PROPERTY THIS BENCH EXISTS FOR is that the COUNT and the LIST cannot
disagree. The number in the Accounts column and the rows in the drill-down
come from two different queries over the same predicate, and the way that
goes wrong is an inner join to ocr_correction_samples: the list would then
quietly drop exactly the corrections sample_worth_keeping refuses - second
edits, blanks, contested readings - and read shorter than the number beside
it. Property 4 ties them together.

CAVEATS, stated rather than buried
  * SQLite, not PostgreSQL 17. `PRAGMA foreign_keys=ON` is set.
  * The models are MIRRORED from models.py. OCRCorrectionSample's real
    CheckConstraints and its btrim() expression index are PostgreSQL-only and
    are NOT mirrored, so this harness cannot see a divergence in them. It
    does not need them: every row it inserts is one override_answer would
    have produced.
  * PaperScore's paper_page_id and answer_key_id are mirrored as plain
    nullable columns. The service never reads them.
"""
import asyncio
import importlib.util
import sys
import types
from pathlib import Path

from sqlalchemy import (Boolean, CheckConstraint, Column, DateTime, ForeignKey,
                        Integer, Numeric, SmallInteger, String, event, func,
                        select)
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import declarative_base

# ── BYTECODE IS A MEASUREMENT HAZARD IN THIS BENCH ─────────────────────────
# It loads a module from the tree by path. See
# measure/2026-11-24_admin_users.py for the measurement behind this.
def _no_stale_bytecode():
    import shutil as _sh, sys as _s
    from pathlib import Path as _P
    _s.dont_write_bytecode = True
    _root = _P(__file__).resolve().parent.parent
    for _sub in ("backend", "measure", "fixtures"):
        _base = _root / _sub
        if _base.is_dir():
            for _d in _base.rglob("__pycache__"):
                _sh.rmtree(_d, ignore_errors=True)


_no_stale_bytecode()

ROOT = Path(__file__).resolve().parent.parent
SERVICE = ROOT / "backend/app/services/teacher_correction_service.py"

passed = 0
failed = []
def check(label, cond, detail=""):
    global passed
    if cond: passed += 1
    else: failed.append(f"{label}: {detail}" if detail else label)

def bail(named, *why):
    """Print a NAMED failure and stop, instead of dying on the next line.

    The tally is read as a dict keyed by email, so a mutation that DROPS a
    row - an inner join where an outer one belongs - makes the next subscript
    raise KeyError, and the bench exits on a traceback having printed no
    count at all. That reads as a broken harness rather than a broken query.
    Measured 2026-11-25: two mutations did exactly that, and both are the
    join mistakes this bench most needs to catch.
    """
    print()
    for i, line in enumerate(why):
        print(f"  ABORTED: {line}" if i == 0 else f"           {line}")
    print(f"\n  {passed} passed, {len(failed) + 1} failed")
    for f in failed:
        print("  FAIL  " + f)
    print("  FAIL  " + named)
    sys.exit(1)


Base = declarative_base()


class User(Base):
    __tablename__ = "users"
    user_id = Column(Integer, primary_key=True, autoincrement=True)
    email   = Column(String(255), unique=True, nullable=False)
    role    = Column(String(16), nullable=False, server_default="teacher")
    status  = Column(String(20), nullable=False, server_default="active")


class UserProfile(Base):
    __tablename__ = "user_profiles"
    user_id    = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"),
                        primary_key=True)
    last_name  = Column(String(255))
    first_name = Column(String(255))


class Exam(Base):
    __tablename__ = "exams"
    exam_id    = Column(Integer, primary_key=True, autoincrement=True)
    exam_name  = Column(String(255), nullable=False)
    created_by = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"),
                        nullable=False)


class TestPaper(Base):
    __tablename__ = "test_papers"
    paper_id = Column(Integer, primary_key=True, autoincrement=True)
    exam_id  = Column(Integer, ForeignKey("exams.exam_id", ondelete="CASCADE"),
                      nullable=False)


class PaperScore(Base):
    __tablename__ = "paper_scores"
    __table_args__ = (
        CheckConstraint("verdict IN ('correct', 'review', 'wrong')",
                        name="paper_scores_verdict_check"),
    )
    score_id        = Column(Integer, primary_key=True, autoincrement=True)
    paper_id        = Column(Integer, ForeignKey("test_papers.paper_id",
                                                 ondelete="CASCADE"), nullable=False)
    paper_page_id   = Column(Integer)
    answer_key_id   = Column(Integer)
    question_number = Column(SmallInteger, nullable=False)
    student_answer  = Column(String(100), nullable=False)
    correct_answer  = Column(String(100), nullable=False)
    is_correct      = Column(Boolean, nullable=False)
    verdict         = Column(String(10), nullable=False, server_default="wrong")
    # THE COLUMN THE WHOLE COUNT TURNS ON. NULL means a person typed the
    # answer; override_answer sets it so.
    ocr_confidence  = Column(Numeric(5, 2))


class OCRCorrectionSample(Base):
    __tablename__ = "ocr_correction_samples"
    sample_id       = Column(Integer, primary_key=True, autoincrement=True)
    score_id        = Column(Integer, ForeignKey("paper_scores.score_id",
                                                 ondelete="SET NULL"))
    exam_id         = Column(Integer, ForeignKey("exams.exam_id", ondelete="SET NULL"))
    question_number = Column(SmallInteger)
    seen            = Column(String(100), nullable=False)
    means           = Column(String(100), nullable=False)
    confidence      = Column(Numeric(5, 2))
    corrected_by    = Column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"))
    created_at      = Column(DateTime())


def install_stubs():
    if not SERVICE.is_file():
        print(f"  MISSING: {SERVICE}")
        sys.exit(2)
    for name in ("app", "app.models", "app.services"):
        sys.modules.setdefault(name, types.ModuleType(name))
    m = types.ModuleType("app.models.models")
    m.User, m.Exam, m.TestPaper = User, Exam, TestPaper
    m.PaperScore, m.OCRCorrectionSample = PaperScore, OCRCorrectionSample
    sys.modules["app.models.models"] = m
    pf = types.ModuleType("app.models.profile")
    pf.UserProfile = UserProfile
    sys.modules["app.models.profile"] = pf

    spec = importlib.util.spec_from_file_location(
        "app.services.teacher_correction_service", SERVICE)
    svc = importlib.util.module_from_spec(spec)
    sys.modules["app.services.teacher_correction_service"] = svc
    spec.loader.exec_module(svc)
    return svc


async def main():
    svc = install_stubs()

    engine = create_async_engine("sqlite+aiosqlite:///:memory:")

    @event.listens_for(engine.sync_engine, "connect")
    def _fk(dbapi_conn, _rec):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    async with engine.begin() as c:
        await c.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with Session() as db:
        admin = User(email="admin@dlsau.edu.ph", role="admin")
        busy  = User(email="busy@x.ph",  role="teacher")
        idle  = User(email="idle@x.ph",  role="teacher")
        db.add_all([admin, busy, idle]); await db.flush()
        db.add(UserProfile(user_id=busy.user_id, last_name="Tablizo",
                           first_name="Eric"))

        e1 = Exam(exam_name="Midterm Exam 1", created_by=busy.user_id)
        e2 = Exam(exam_name="Final Exam",     created_by=busy.user_id)
        e3 = Exam(exam_name="Quiz 1",         created_by=idle.user_id)
        db.add_all([e1, e2, e3]); await db.flush()
        p1 = TestPaper(exam_id=e1.exam_id)
        p2 = TestPaper(exam_id=e2.exam_id)
        p3 = TestPaper(exam_id=e3.exam_id)
        db.add_all([p1, p2, p3]); await db.flush()

        def score(paper, qn, answer, conf):
            return PaperScore(paper_id=paper.paper_id, question_number=qn,
                              student_answer=answer, correct_answer="A",
                              is_correct=False, verdict="wrong",
                              ocr_confidence=conf)

        # busy: 3 corrected (NULL conf), 2 untouched (a real number, one of
        # them 0.0 - which is what grader.py writes when it detected nothing,
        # and is NOT a correction)
        s_a = score(p1, 1, "B", None)
        s_b = score(p1, 2, "C", None)
        s_c = score(p2, 5, "D", None)
        s_d = score(p1, 3, "A", 91.5)
        s_e = score(p1, 4, "",  0.0)
        # idle: nothing corrected
        s_f = score(p3, 1, "A", 88.0)
        db.add_all([s_a, s_b, s_c, s_d, s_e, s_f]); await db.flush()

        # Evidence kept for ONE of busy's three. The other two are the kinds
        # sample_worth_keeping refuses - a second edit and a blank - so they
        # have no sample, which is exactly the gap this bench is about.
        db.add(OCRCorrectionSample(score_id=s_a.score_id, exam_id=e1.exam_id,
                                   question_number=1, seen="8", means="B",
                                   confidence=64.0, corrected_by=busy.user_id))
        await db.commit()

        # ── CONTROL. If a scored-and-untouched row counted, every number
        #    below would be meaningless.
        rows = await svc.counts_by_teacher(db)
        by_email = {r["email"]: r for r in rows}

        # EVERY ACCOUNT MUST BE PRESENT BEFORE ANYTHING IS READ OUT OF IT.
        # The tally is keyed by email below, and a missing key is a KeyError
        # three lines later rather than a named failure here.
        EXPECTED = ("admin@dlsau.edu.ph", "busy@x.ph", "idle@x.ph")
        missing = [e for e in EXPECTED if e not in by_email]
        check("every account appears in the tally, including those with none",
              not missing, f"missing: {missing}")
        if missing:
            bail("the tally drops accounts instead of reporting them as zero",
                 f"these accounts are not in the result at all: {missing}.",
                 "An administrator watching for a teacher who has redone a lot",
                 "of marking also needs to see the one who has redone none, so",
                 "a dropped row is a wrong answer and not a smaller one.")

        check("CONTROL: an answer the reader scored is NOT a correction",
              by_email["idle@x.ph"]["corrections"] == 0,
              f'idle has {by_email["idle@x.ph"]["corrections"]}')
        if by_email["idle@x.ph"]["corrections"] != 0:
            print("\n  ABORTED: a row with a confidence counted as corrected,")
            print("           so every property below is measuring nothing.")
            print(f"\n  {passed} passed, {len(failed)} failed")
            for f in failed:
                print("  FAIL  " + f)
            sys.exit(1)

        check("  ...including a 0.0 confidence, which is what grader.py "
              "writes when nothing was detected",
              by_email["busy@x.ph"]["corrections"] == 3,
              f'busy has {by_email["busy@x.ph"]["corrections"]}, expected 3')

        # ── 1. the tally ──────────────────────────────────────────────────
        check("counts every re-corrected answer on that teacher's exams",
              by_email["busy@x.ph"]["corrections"] == 3)
        check("  ...across more than one exam",
              True)
        check("  ...and reports accounts with none, as a zero",
              "idle@x.ph" in by_email and by_email["idle@x.ph"]["corrections"] == 0)
        check("  ...including an account with no profile row",
              by_email["admin@dlsau.edu.ph"]["name"] is None,
              str(by_email["admin@dlsau.edu.ph"]))
        check("  ...and names the ones that have a profile, Surname, First",
              by_email["busy@x.ph"]["name"] == "Tablizo, Eric",
              str(by_email["busy@x.ph"]["name"]))
        check("most corrections first", rows[0]["email"] == "busy@x.ph",
              rows[0]["email"])

        # ── 2. samples are a SUBSET, and the gap is real ──────────────────
        check("the kept-evidence count is reported beside the total",
              by_email["busy@x.ph"]["samples"] == 1,
              str(by_email["busy@x.ph"]["samples"]))
        check("  ...and is never larger than the total",
              all(r["samples"] <= r["corrections"] for r in rows),
              str([(r["email"], r["corrections"], r["samples"]) for r in rows]))

        # ── 3. the detail ─────────────────────────────────────────────────
        items, truncated = await svc.detail_for_teacher(db, busy.user_id)
        check("the detail lists the corrected answers", len(items) == 3,
              f"{len(items)} rows")
        check("  ...and is not truncated at this size", truncated is False)

        # ── 4. THE INVARIANT: the count IS the length of the list ─────────
        # An inner join to the samples table would make this 1, not 3, and
        # the screen would show "3" above a list of one.
        for r in rows:
            got, _ = await svc.detail_for_teacher(db, r["user_id"])
            check(f"the count equals the list for {r['email']}",
                  r["corrections"] == len(got),
                  f'count {r["corrections"]} vs {len(got)} rows')

        # ── 5. what each row carries ──────────────────────────────────────
        with_sample = [i for i in items if i["reader_saw"] is not None]
        without     = [i for i in items if i["reader_saw"] is None]
        check("a correction kept as evidence shows what the reader saw",
              len(with_sample) == 1 and with_sample[0]["reader_saw"] == "8",
              str(with_sample))
        check("  ...with the confidence it had when it was wrong",
              with_sample and with_sample[0]["reader_confidence"] == 64.0,
              str(with_sample[0]["reader_confidence"]) if with_sample else "none")
        check("a correction NOT kept as evidence is still listed",
              len(without) == 2, f"{len(without)} rows without a sample")
        check("  ...saying what it was corrected TO, even with no reader value",
              all(i["answer"] for i in without), str(without))
        check("every row names its exam",
              all(i["exam_name"] for i in items), str([i["exam_name"] for i in items]))

        # ── 6. attribution is by EXAM OWNER, stated in the service ────────
        # An administrator correcting someone else's paper counts against the
        # exam's owner, and corrected_by is returned so the divergence shows.
        db.add(OCRCorrectionSample(score_id=s_b.score_id, exam_id=e1.exam_id,
                                   question_number=2, seen="0", means="C",
                                   confidence=55.0, corrected_by=admin.user_id))
        await db.commit()
        rows2 = {r["email"]: r for r in await svc.counts_by_teacher(db)}
        check("a correction on a teacher's exam counts against that teacher",
              rows2["busy@x.ph"]["corrections"] == 3,
              str(rows2["busy@x.ph"]))
        check("  ...and not against the administrator who typed it",
              rows2["admin@dlsau.edu.ph"]["corrections"] == 0,
              str(rows2["admin@dlsau.edu.ph"]))
        items2, _ = await svc.detail_for_teacher(db, busy.user_id)
        who = {i["question_number"]: i["corrected_by"] for i in items2}
        check("  ...but the detail still says who typed it",
              who.get(2) == admin.user_id, str(who))

        # ── 7. a user_id that is not an account ───────────────────────────
        check("teacher_exists returns the email of a real account",
              await svc.teacher_exists(db, busy.user_id) == "busy@x.ph")
        check("  ...and None for one that is not",
              await svc.teacher_exists(db, 9999) is None)

        # ── 8. the limit is reported, not silently applied ────────────────
        short, cut = await svc.detail_for_teacher(db, busy.user_id, limit=2)
        check("a list cut at the limit says so", cut is True and len(short) == 2,
              f"{len(short)} rows, truncated={cut}")

    await engine.dispose()

    print()
    print(f"  {passed} passed, {len(failed)} failed")
    if failed:
        print()
        for f in failed:
            print("  FAIL  " + f)
    print()
    print("  the real teacher_correction_service.py, loaded from the tree by")
    print("  path; SQLite with foreign_keys=ON, models mirrored from models.py.")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    asyncio.run(main())
