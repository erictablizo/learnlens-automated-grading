"""
measure/2026-11-19_correction_samples.py
=========================================
Sir Alex 2026-11-19, points 5 and 6 — "training set; datasets; sample
specimen". The dataset collected from teachers correcting scanned answers.

It loads `app/services/correction_service.py` FROM YOUR TREE by path and
exercises the real `build_sample`, `sample_worth_keeping` and `suggestions`.
Only `app.models.models` is substituted, because the real one declares
PostgreSQL tables and this runs on SQLite.

    cd backend
    python ../measure/2026-11-19_correction_samples.py
"""
import asyncio
import importlib
import importlib.util
import os
import sys
import types
from datetime import datetime, timezone

OK = FAIL = 0


def check(label, cond, got="", note=""):
    global OK, FAIL
    if cond:
        OK += 1
        print(f"  ok    {label}  ({got})")
    else:
        FAIL += 1
        print(f"  FAIL  {label}  ({got})")
        if note:
            print(f"        {note}")


def find_app_dir(start):
    d = os.path.abspath(start)
    while True:
        if os.path.exists(os.path.join(d, "app", "services", "correction_service.py")):
            return os.path.join(d, "app")
        up = os.path.dirname(d)
        if up == d:
            return None
        d = up


APP = find_app_dir(os.getcwd()) or find_app_dir(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"))
if not APP:
    print("Could not find app/services/correction_service.py. Run from backend/.")
    sys.exit(2)

from sqlalchemy import (Boolean, Column, DateTime, Integer, Numeric,
                        SmallInteger, String, select, func)
from sqlalchemy.orm import declarative_base
from sqlalchemy.ext.asyncio import (AsyncSession, create_async_engine,
                                    async_sessionmaker)

Base = declarative_base()


class TestPaper(Base):
    __tablename__ = "test_papers"
    paper_id    = Column(Integer, primary_key=True, autoincrement=True)
    exam_id     = Column(Integer, default=1)
    total_score = Column(SmallInteger)
    checked     = Column(Boolean, default=False, nullable=False)


class PaperScore(Base):
    __tablename__ = "paper_scores"
    score_id        = Column(Integer, primary_key=True, autoincrement=True)
    paper_id        = Column(Integer, nullable=False)
    question_number = Column(SmallInteger, nullable=False)
    student_answer  = Column(String(100), nullable=False)
    correct_answer  = Column(String(100), nullable=False)
    is_correct      = Column(Boolean, nullable=False)
    verdict         = Column(String(10), nullable=False, default="wrong")
    ocr_confidence  = Column(Numeric(5, 2))


class OCRCorrection(Base):
    __tablename__ = "ocr_corrections"
    correction_id = Column(Integer, primary_key=True, autoincrement=True)
    seen          = Column(String(100), nullable=False)
    means         = Column(String(100), nullable=False)


class OCRCorrectionSample(Base):
    __tablename__ = "ocr_correction_samples"
    sample_id       = Column(Integer, primary_key=True, autoincrement=True)
    score_id        = Column(Integer)
    exam_id         = Column(Integer)
    question_number = Column(SmallInteger)
    seen            = Column(String(100), nullable=False)
    means           = Column(String(100), nullable=False)
    confidence      = Column(Numeric(5, 2))
    corrected_by    = Column(Integer)
    created_at      = Column(DateTime, default=lambda: datetime.now(timezone.utc))


def mkpkg(name, path):
    m = types.ModuleType(name)
    m.__path__ = [path]
    sys.modules[name] = m
    return m


mkpkg("app", APP)
mkpkg("app.ml", os.path.join(APP, "ml"))
mkpkg("app.models", os.path.join(APP, "models"))
mkpkg("app.services", os.path.join(APP, "services"))
models = types.ModuleType("app.models.models")
(models.PaperScore, models.TestPaper, models.OCRCorrection,
 models.OCRCorrectionSample) = (PaperScore, TestPaper, OCRCorrection,
                                OCRCorrectionSample)
sys.modules["app.models.models"] = models


def need(modname, label):
    try:
        mod = importlib.import_module(modname)
    except Exception as e:                                       # noqa: BLE001
        print(f"\n  !! {label} could not be imported from your tree")
        print(f"  !! {type(e).__name__}: {e}")
        sys.exit(2)
    print(f"  {label:<20}: {getattr(mod, '__file__', '?')}")
    return mod


print("\nloaded from your tree:")
need("app.ml.ocr_item_numbers", "CONTESTED_SEP")
grader = need("app.ml.grader", "BLANK")
need("app.ml.ocr_identification", "grade_identification")
spec = importlib.util.spec_from_file_location(
    "app.services.correction_service",
    os.path.join(APP, "services", "correction_service.py"))
CS = importlib.util.module_from_spec(spec)
sys.modules["app.services.correction_service"] = CS
spec.loader.exec_module(CS)
print(f"  {'correction_service':<20}: {CS.__file__}")

BLANK = grader.BLANK
SEP = CS.CONTESTED_SEP


def mkscore(sid, q, seen, key, conf):
    s = PaperScore(score_id=sid, paper_id=1, question_number=q,
                   student_answer=seen, correct_answer=key,
                   is_correct=False, verdict="wrong", ocr_confidence=conf)
    return s


async def main():
    print("\n" + "=" * 74)
    print("1.  WHAT COUNTS AS EVIDENCE ABOUT THE READER")
    print("=" * 74)
    cases = [
        ("a real misreading: reader said T, teacher says B",
         mkscore(1, 11, "T", "B", 0.91), "B", True),
        ("CONTROL already corrected by hand (confidence NULL)",
         mkscore(2, 12, "C", "B", None), "B", False),
        ("CONTROL a BLANK is not a misreading",
         mkscore(3, 13, BLANK, "B", 0.4), "B", False),
        ("CONTROL a CONTESTED reading is not one glyph",
         mkscore(4, 14, "A" + SEP + "B", "B", 0.8), "B", False),
        ("CONTROL correcting to the same value is not evidence",
         mkscore(5, 15, "B", "B", 0.8), "B", False),
        ("CONTROL correcting to the same value, different case",
         mkscore(6, 16, "b", "B", 0.8), "B", False),
        ("CONTROL correcting TO a blank records nothing",
         mkscore(7, 17, "T", "B", 0.8), BLANK, False),
        ("a word misreading: MACHIN -> MACHINE",
         mkscore(8, 18, "MACHIN", "MACHINE", 0.77), "MACHINE", True),
    ]
    for label, score, means, expected in cases:
        got = CS.build_sample(score, 6, means, 42)
        check(label, (got is not None) == expected,
              "recorded" if got is not None else "not recorded")

    sample = CS.build_sample(mkscore(9, 11, " t ", "B", 0.91), 6, "B", 42)
    check("the sample keeps the reading as the reader produced it",
          sample.seen == "t" and sample.means == "B", f"{sample.seen!r}/{sample.means!r}",
          "stripped, but not case-folded: the grouping does that, the row keeps the fact")
    check("and the confidence of the WRONG reading",
          float(sample.confidence) == 0.91, str(sample.confidence),
          "the number that answers 'was it confident while wrong?'")
    check("and where it came from",
          (sample.exam_id, sample.question_number, sample.corrected_by) == (6, 11, 42),
          f"exam {sample.exam_id}, item {sample.question_number}")

    print("\n" + "=" * 74)
    print("2.  THE SUGGESTIONS — what teachers keep overruling")
    print("=" * 74)
    eng = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with eng.begin() as c:
        await c.run_sync(Base.metadata.create_all)
    db = async_sessionmaker(eng, class_=AsyncSession, expire_on_commit=False)()

    #              score, exam, q,  seen,  means, conf
    FIXTURE = [(101, 6, 11, "T", "B", 0.91),
               (102, 6, 3,  "T", "B", 0.88),
               (103, 7, 5,  "t", "b", 0.95),      # same pair, different case
               (104, 7, 9,  "8", "B", 0.60),      # a different pair
               (105, 8, 2,  "-", "E", 0.55)]
    for sid, ex, q, seen, means, conf in FIXTURE:
        db.add(OCRCorrectionSample(score_id=sid, exam_id=ex, question_number=q,
                                   seen=seen, means=means, confidence=conf,
                                   corrected_by=1))
    db.add(OCRCorrection(seen="-", means="E"))     # already a rule
    await db.commit()

    sug = await CS.suggestions(db)
    by = {(s.seen, s.means): s for s in sug}
    check("case variants are ONE suggestion", ("T", "B") in by and by[("T", "B")].times == 3,
          f"{by[('T','B')].times} times" if ("T", "B") in by else "missing",
          "'t'->'b' and 'T'->'B' are the same claim about the reader")
    check("counted across exams", by[("T", "B")].exams == 2, f"{by[('T','B')].exams}")
    check("ordered by weight of evidence", sug[0].seen == "T", f"first is {sug[0].seen}")
    check("average confidence of the wrong readings",
          abs(by[("T", "B")].avg_confidence - 0.913) < 0.01,
          str(by[("T", "B")].avg_confidence),
          "0.91, 0.88, 0.95 -> the reader was CONFIDENT and wrong")
    check("a pair already covered by a rule is flagged, not hidden",
          by[("-", "E")].already is True and by[("8", "B")].already is False,
          f"- already={by[('-','E')].already}, 8 already={by[('8','B')].already}")
    check("min_times filters weak evidence",
          [s.seen for s in await CS.suggestions(db, min_times=3)] == ["T"],
          "only the 3-times pair survives min_times=3")
    check("nothing here creates a correction",
          (await db.execute(select(func.count(OCRCorrection.correction_id)))).scalar_one() == 1,
          "1 rule, unchanged",
          "a suggestion is evidence; a correction is a decision")
    await db.close(); await eng.dispose()

    print("\n" + "=" * 74)
    print(f"{OK} passed, {FAIL} failed")
    print("=" * 74)
    return 1 if FAIL else 0


sys.exit(asyncio.run(main()))
