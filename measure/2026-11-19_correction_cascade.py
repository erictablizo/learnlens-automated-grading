"""
measure/2026-11-19_correction_cascade.py
========================================
Sir Alex 2026-11-19, points 4-7 — the CASCADE half of the specimen table.

`measure/2026-11-19_specimen_corrections.py` already measured the pass that
rewrites a reading before it is judged. This measures what happens to papers
that were ALREADY judged when an administrator saves a correction, which is
the behaviour chosen over "apply to new papers only".

IT LOADS THE REAL FILE. `app/services/correction_service.py` is imported from
disk by path, with only its leaf dependencies stubbed, so the functions
exercised here are the ones the server runs. The 28 Sep post-mortem: a test
that re-implements a path cannot catch a bug in that path.

    cd backend
    python -m pip install aiosqlite        # once
    python ../measure/2026-11-19_correction_cascade.py

Run it from anywhere inside the repo; it walks up for app/services/.
"""
import asyncio
import importlib.util
import os
import sys
import time
import types
from dataclasses import dataclass

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


# ── locate the real backend tree ────────────────────────────────────────────
def find_app_dir(start):
    d = os.path.abspath(start)
    while True:
        cand = os.path.join(d, "app", "services", "correction_service.py")
        if os.path.exists(cand):
            return os.path.join(d, "app")
        up = os.path.dirname(d)
        if up == d:
            return None
        d = up


APP = find_app_dir(os.getcwd()) or find_app_dir(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"))
if not APP:
    print("Could not find app/services/correction_service.py above the current "
          "directory. Run this from inside the backend tree.")
    sys.exit(2)
print(f"backend tree: {APP}")

from sqlalchemy import (Boolean, Column, Integer, Numeric, SmallInteger,
                        String, ForeignKey, select, func)
from sqlalchemy.orm import declarative_base
from sqlalchemy.ext.asyncio import (AsyncSession, create_async_engine,
                                    async_sessionmaker)

Base = declarative_base()


class TestPaper(Base):
    __tablename__ = "test_papers"
    paper_id     = Column(Integer, primary_key=True, autoincrement=True)
    exam_id      = Column(Integer, nullable=False, default=1)
    student_name = Column(String(255), nullable=False, default="x")
    total_score  = Column(SmallInteger)
    checked      = Column(Boolean, default=False, nullable=False)


class PaperScore(Base):
    __tablename__ = "paper_scores"
    score_id        = Column(Integer, primary_key=True, autoincrement=True)
    paper_id        = Column(Integer, ForeignKey("test_papers.paper_id"), nullable=False)
    paper_page_id   = Column(Integer, default=1)
    answer_key_id   = Column(Integer, default=1)
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


# ── stub the leaves, then load the real modules by path ─────────────────────
def mkpkg(name):
    m = types.ModuleType(name)
    m.__path__ = []
    sys.modules[name] = m
    return m


mkpkg("app")
mkpkg("app.ml")
mkpkg("app.models")
mkpkg("app.services")

models = types.ModuleType("app.models.models")
models.PaperScore, models.TestPaper, models.OCRCorrection = (
    PaperScore, TestPaper, OCRCorrection)
sys.modules["app.models.models"] = models


def load_real(modname, path):
    spec = importlib.util.spec_from_file_location(modname, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[modname] = mod
    spec.loader.exec_module(mod)
    return mod


# ocr_item_numbers, for CONTESTED_SEP. Real file if it imports cleanly.
try:
    load_real("app.ml.ocr_item_numbers", os.path.join(APP, "ml", "ocr_item_numbers.py"))
    print("  CONTESTED_SEP from: the real app/ml/ocr_item_numbers.py")
except Exception as e:                                           # noqa: BLE001
    stub = types.ModuleType("app.ml.ocr_item_numbers")
    stub.CONTESTED_SEP = "|"
    sys.modules["app.ml.ocr_item_numbers"] = stub
    print(f"  !! ocr_item_numbers could not be imported ({type(e).__name__}: {e});"
          f" CONTESTED_SEP stubbed as '|'")

# grader, for _norm and BLANK. It imports app.ml.ocr_shared, which is a
# dataclass module with no OCR dependency - stub it rather than the thing
# under test.
shared = types.ModuleType("app.ml.ocr_shared")


@dataclass
class OCRPageResult:
    answers: list = None
    error: str = ""
    warning: str = ""


shared.OCRPageResult = OCRPageResult
sys.modules["app.ml.ocr_shared"] = shared
try:
    grader = load_real("app.ml.grader", os.path.join(APP, "ml", "grader.py"))
    print("  _norm / BLANK from: the real app/ml/grader.py")
except Exception as e:                                           # noqa: BLE001
    print(f"  !! grader could not be imported ({type(e).__name__}: {e})")
    sys.exit(2)

# ocr_identification, for grade_identification / REVIEW_FLOOR. It imports
# numpy at module level and cv2/pytesseract only inside functions, so it loads
# on a machine with no OCR stack. If it cannot, the bench says so LOUDLY and
# substitutes a stand-in - a silent substitution here would mean the whole
# three-state claim was measured against a copy of itself.
IDENT_IS_REAL = True
try:
    load_real("app.ml.ocr_identification",
              os.path.join(APP, "ml", "ocr_identification.py"))
    print("  grade_identification from: the real app/ml/ocr_identification.py")
except Exception as e:                                           # noqa: BLE001
    IDENT_IS_REAL = False
    print(f"  !! ocr_identification could not be imported "
          f"({type(e).__name__}: {e})")
    print("  !! SUBSTITUTING A STAND-IN. The identification checks below are "
          "measured against")
    print("  !! a reconstruction, not your file. Re-run where it imports.")
    stub = types.ModuleType("app.ml.ocr_identification")

    def _edit_distance(a, b):
        prev = list(range(len(b) + 1))
        for i, ca in enumerate(a, 1):
            cur = [i]
            for j, cb in enumerate(b, 1):
                cur.append(min(prev[j] + 1, cur[j - 1] + 1,
                               prev[j - 1] + (ca != cb)))
            prev = cur
        return prev[-1]

    def normalize_answer(v):
        return (v or "").strip().upper()

    def similarity(student, key):
        s_, k_ = normalize_answer(student), normalize_answer(key)
        if not s_ and not k_:
            return 1.0
        if not s_ or not k_:
            return 0.0
        return 1.0 - _edit_distance(s_, k_) / max(len(s_), len(k_))

    stub.CORRECT, stub.REVIEW, stub.WRONG = "correct", "review", "wrong"
    stub.REVIEW_FLOOR = 0.40
    stub.MAX_ANSWER_LEN = 100
    stub.similarity = similarity
    stub.normalize_answer = normalize_answer

    def grade_identification(student, key):
        sc = similarity(student, key)
        if sc >= 1.0:
            return stub.CORRECT
        if sc >= stub.REVIEW_FLOOR:
            return stub.REVIEW
        return stub.WRONG

    stub.grade_identification = grade_identification
    sys.modules["app.ml.ocr_identification"] = stub

IDENT = sys.modules["app.ml.ocr_identification"]

CS = load_real("app.services.correction_service",
               os.path.join(APP, "services", "correction_service.py"))
print(f"  under test        : {CS.__file__}")
print(f"  verdict column    : {'seen' if CS._HAS_VERDICT else 'ABSENT - review rows '
                                                             'cannot be protected'}")

BLANK = grader.BLANK
SEP = CS.CONTESTED_SEP


# ── fixture ─────────────────────────────────────────────────────────────────
#   paper 1  a normal multiple-choice paper with two dash readings
#   paper 2  one dash reading, one under review, one blank, one contested
#   paper 3  no dash at all  <- the control: nothing about it may change
#   paper 4  true/false, stored expanded
ROWS = [
    # paper, q, student,   key,     is_correct, verdict
    (1, 1, "A",   "A",   True,  "correct"),
    (1, 2, "-",   "E",   False, "wrong"),
    (1, 3, "-",   "C",   False, "wrong"),     # correcting to E still wrong
    (1, 4, "B",   "B",   True,  "correct"),
    (2, 1, " - ", "E",   False, "wrong"),     # whitespace, must still match
    (2, 2, "-",   "E",   False, "review"),    # under review: left alone
    (2, 3, BLANK, "E",   False, "wrong"),     # blank: never corrected
    (2, 4, "A" + SEP + "B", "E", False, "wrong"),   # contested: never corrected
    (3, 1, "C",   "C",   True,  "correct"),
    (3, 2, "D",   "A",   False, "wrong"),
    (4, 1, "TRUE",  "TRUE",  True,  "correct"),
    (4, 2, "TRUE",  "FALSE", False, "wrong"),
    # paper 5: IDENTIFICATION. Alex's point 4, and the band that exists
    # between right and wrong for a word.
    (5, 1, "MACHIN", "MACHINE", False, "wrong"),
    (5, 2, "QQQ",    "MACHINE", False, "wrong"),
    (5, 3, "ZZZ",    "ESSAY",   False, "wrong"),
]


async def fresh():
    eng = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with eng.begin() as c:
        await c.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(eng, class_=AsyncSession, expire_on_commit=False)
    db = Session()
    for pid in (1, 2, 3, 4, 5):
        db.add(TestPaper(paper_id=pid, exam_id=1, student_name=f"s{pid}",
                         total_score=0, checked=True))
    await db.flush()
    for paper, q, stud, key, ok, verdict in ROWS:
        db.add(PaperScore(paper_id=paper, question_number=q, student_answer=stud,
                          correct_answer=key, is_correct=ok, verdict=verdict))
    await db.flush()
    for pid in (1, 2, 3, 4, 5):
        n = sum(1 for r in ROWS if r[0] == pid and r[4])
        p = await db.get(TestPaper, pid)
        p.total_score = n
    await db.commit()
    return eng, db


async def scores(db):
    rows = (await db.execute(select(PaperScore).order_by(PaperScore.score_id))).scalars().all()
    return {(r.paper_id, r.question_number): (r.student_answer, r.is_correct, r.verdict)
            for r in rows}


async def totals(db):
    rows = (await db.execute(select(TestPaper.paper_id, TestPaper.total_score))).all()
    return dict(rows)


async def main():
    print("\n" + "=" * 74)
    print("1.  count_affected — the blast radius, BEFORE anything is saved")
    print("=" * 74)
    eng, db = await fresh()
    rows, papers = await CS.count_affected(db, "-")
    check("dash: rows counted", rows == 4, f"{rows} rows",
          "paper1 q2, paper1 q3, paper2 q1 (whitespace), paper2 q2 (review) = 4")
    check("dash: papers counted", papers == 2, f"{papers} papers")

    r2, p2 = await CS.count_affected(db, "  -  ")
    check("CONTROL whitespace/case-insensitive lookup agrees",
          (r2, p2) == (rows, papers), f"{r2}/{p2}")

    r3, p3 = await CS.count_affected(db, "Z")
    check("CONTROL a reading nobody has counts zero", (r3, p3) == (0, 0), f"{r3}/{p3}")

    r4, _ = await CS.count_affected(db, BLANK)
    check("CONTROL the blank glyph counts zero", r4 == 0, f"{r4} rows",
          "a blank must never be correctable, so it must never be counted either")

    r5, _ = await CS.count_affected(db, "A" + SEP + "B")
    check("CONTROL a contested reading counts zero", r5 == 0, f"{r5} rows")

    print("\n" + "=" * 74)
    print("2.  rescore_for('-' means 'E') — what actually changed")
    print("=" * 74)
    before_s, before_t = await scores(db), await totals(db)
    rep = await CS.rescore_for(db, "-", "E")
    await db.commit()
    after_s, after_t = await scores(db), await totals(db)

    check("rows_examined counts every match, skipped included",
          rep.rows_examined == 4, f"{rep.rows_examined}")
    check("rows_changed excludes the review row", rep.rows_changed == 3, f"{rep.rows_changed}")
    check("the review row is counted as skipped, not silently dropped",
          rep.rows_skipped_review == 1, f"{rep.rows_skipped_review}")
    check("papers_touched", rep.papers_touched == 2, f"{rep.papers_touched}")
    check("marks_gained: p1q2 and p2q1 become correct",
          rep.marks_gained == 2, f"{rep.marks_gained}")
    check("marks_lost: none, nothing correct was overwritten",
          rep.marks_lost == 0, f"{rep.marks_lost}")

    check("p1 q2  '-' -> 'E', now correct", after_s[(1, 2)] == ("E", True, "correct"),
          str(after_s[(1, 2)]))
    check("p1 q3  '-' -> 'E', key is C, STILL WRONG",
          after_s[(1, 3)] == ("E", False, "wrong"), str(after_s[(1, 3)]),
          "a correction must be able to leave an item wrong")
    check("p2 q1  ' - ' -> 'E', whitespace matched",
          after_s[(2, 1)] == ("E", True, "correct"), str(after_s[(2, 1)]))
    check("p2 q2  under review, UNTOUCHED", after_s[(2, 2)] == before_s[(2, 2)],
          str(after_s[(2, 2)]), "a row flagged for the teacher must stay flagged")
    check("p2 q3  blank, UNTOUCHED", after_s[(2, 3)] == before_s[(2, 3)],
          str(after_s[(2, 3)]))
    check("p2 q4  contested, UNTOUCHED", after_s[(2, 4)] == before_s[(2, 4)],
          str(after_s[(2, 4)]))
    check("CONTROL paper 3 has no dash: every row byte-identical",
          all(after_s[(3, q)] == before_s[(3, q)] for q in (1, 2)), "2 rows")
    check("CONTROL paper 4 has no dash: every row byte-identical",
          all(after_s[(4, q)] == before_s[(4, q)] for q in (1, 2)), "2 rows")

    check("p1 total_score recounted 2 -> 3", after_t[1] == 3, f"{before_t[1]} -> {after_t[1]}")
    check("p2 total_score recounted 0 -> 1", after_t[2] == 1, f"{before_t[2]} -> {after_t[2]}")
    check("CONTROL p3 total_score unchanged", after_t[3] == before_t[3], f"{after_t[3]}")
    check("CONTROL p4 total_score unchanged", after_t[4] == before_t[4], f"{after_t[4]}")
    check("CONTROL p5 (identification) total_score unchanged",
          after_t[5] == before_t[5], f"{after_t[5]}")
    check("every total equals that paper's count of is_correct",
          all(after_t[p] == sum(1 for (pp, _), (_, ok, _) in after_s.items()
                                if pp == p and ok) for p in (1, 2, 3, 4, 5)),
          str(after_t))
    await db.close()
    await eng.dispose()

    print("\n" + "=" * 74)
    print("3.  a correction that COSTS marks, and the refusals")
    print("=" * 74)
    eng, db = await fresh()
    rep = await CS.rescore_for(db, "TRUE", "FALSE")
    await db.commit()
    s = await scores(db)
    t = await totals(db)
    check("marks_lost reported, not hidden", rep.marks_lost == 1, f"{rep.marks_lost}")
    check("marks_gained on the same pass", rep.marks_gained == 1, f"{rep.marks_gained}")
    check("p4 q1 was correct, now wrong", s[(4, 1)] == ("FALSE", False, "wrong"), str(s[(4, 1)]))
    check("p4 q2 was wrong, now correct", s[(4, 2)] == ("FALSE", True, "correct"), str(s[(4, 2)]))
    check("p4 total_score still 1, for the other reason", t[4] == 1, f"{t[4]}")
    await db.close(); await eng.dispose()

    eng, db = await fresh()
    before = await scores(db)
    rep = await CS.rescore_for(db, BLANK, "E")
    check("REFUSED: a blank can never be corrected", rep.rows_changed == 0,
          f"{rep.rows_changed} changed",
          "this is the one that puts an answer on every unanswered item")
    rep = await CS.rescore_for(db, "A" + SEP + "B", "A")
    check("REFUSED: a contested reading can never be corrected",
          rep.rows_changed == 0, f"{rep.rows_changed} changed")
    rep = await CS.rescore_for(db, "-", "-")
    check("REFUSED: a no-op correction changes nothing",
          rep.rows_examined == 0 and rep.rows_changed == 0, str(rep.rows_changed))
    rep = await CS.rescore_for(db, "", "E")
    check("REFUSED: an empty reading changes nothing", rep.rows_changed == 0,
          f"{rep.rows_changed} changed")
    check("after four refusals the table is byte-identical",
          await scores(db) == before, "12 rows")
    await db.close(); await eng.dispose()

    print("\n" + "=" * 74)
    print("4.  THE EQUIVALENCE. Rescoring must agree with grading afresh.")
    print("=" * 74)
    # The claim the whole design rests on: correcting a STORED reading gives
    # the same mark as correcting the reading at OCR time and grading it.
    eng, db = await fresh()
    await CS.rescore_for(db, "-", "E")
    await db.commit()
    rescored = await scores(db)

    corrections = {"-": "E"}
    agree = disagree = 0
    for paper, q, stud, key, _ok, verdict in ROWS:
        detected = {q: (stud, 0.9, 1)}
        out, _ = CS.apply_corrections(detected, corrections)
        letter = out[q][0]
        fresh_ok = bool(grader._norm(letter)) and grader._norm(letter) == grader._norm(key)
        stored_answer, stored_ok, _v = rescored[(paper, q)]
        if verdict == "review":
            continue          # deliberately diverges: see the service docstring
        if (letter, fresh_ok) == (stored_answer, stored_ok):
            agree += 1
        else:
            disagree += 1
            print(f"        p{paper} q{q}: fresh=({letter!r},{fresh_ok}) "
                  f"stored=({stored_answer!r},{stored_ok})")
    check("every non-review item agrees with a fresh grading", disagree == 0,
          f"{agree} agree, {disagree} disagree")

    # And the documented limitation, asserted rather than assumed.
    r, _ = await CS.count_affected(db, "T")
    check("DOCUMENTED LIMIT: a correction keyed 'T' finds no true/false row, "
          "because readings are stored expanded", r == 0, f"{r} rows",
          "key true/false corrections on the word TRUE or FALSE, not the letter")
    await db.close(); await eng.dispose()

    print("\n" + "=" * 74)
    print("5.  SCALE. The objection was 'a 20-minute job across other teachers'.")
    print("=" * 74)
    eng = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with eng.begin() as c:
        await c.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(eng, class_=AsyncSession, expire_on_commit=False)
    db = Session()
    N_EXAMS, N_STUD, N_ITEMS = 50, 35, 15
    pid = 0
    t0 = time.time()
    for _e in range(N_EXAMS):
        for _s in range(N_STUD):
            pid += 1
            db.add(TestPaper(paper_id=pid, exam_id=1, student_name="s",
                             total_score=0, checked=True))
            for q in range(1, N_ITEMS + 1):
                dash = (q % 5 == 0)
                db.add(PaperScore(paper_id=pid, question_number=q,
                                  student_answer="-" if dash else "A",
                                  correct_answer="E" if dash else "A",
                                  is_correct=not dash,
                                  verdict="wrong" if dash else "correct"))
    await db.commit()
    built = time.time() - t0
    total_rows = N_EXAMS * N_STUD * N_ITEMS
    print(f"  built {pid} papers / {total_rows} recorded items in {built:.1f}s")

    t0 = time.time()
    rows, papers = await CS.count_affected(db, "-")
    t_count = time.time() - t0
    t0 = time.time()
    rep = await CS.rescore_for(db, "-", "E")
    await db.commit()
    t_rescore = time.time() - t0

    check("count_affected found every dash", rows == N_EXAMS * N_STUD * 3,
          f"{rows} rows across {papers} papers")
    check("rescore changed every one of them", rep.rows_changed == rows,
          f"{rep.rows_changed}")
    check("and every one became correct", rep.marks_gained == rows, f"{rep.marks_gained}")
    sample = (await db.execute(select(TestPaper.total_score).limit(1))).scalar_one()
    check("a sample paper's total recounted 12 -> 15", sample == N_ITEMS, f"{sample}")

    ocr_equivalent = rep.papers_touched * 40.1 / 60.0
    print(f"\n  count_affected : {t_count*1000:7.1f} ms")
    print(f"  rescore_for    : {t_rescore*1000:7.1f} ms   "
          f"({rep.rows_changed} items, {rep.papers_touched} papers)")
    print(f"  re-running OCR instead: {ocr_equivalent:,.0f} minutes "
          f"(THROUGHPUT-2026-10-23, 40.1 s per page)")
    print("  sqlite in memory, so treat the milliseconds as indicative. The")
    print("  structural claim is what matters: no image is opened.")
    check("the cascade is a database statement, not a grading run",
          t_rescore < 30, f"{t_rescore:.1f}s for {rows} items",
          "if this ever approaches minutes, something is re-reading images")
    await db.close(); await eng.dispose()

    print("\n" + "=" * 74)
    print("6.  IDENTIFICATION — three states, not two.  CHANGED 2026-11-19")
    print("=" * 74)
    print(f"  grade_identification is {'the REAL function' if IDENT_IS_REAL else 'A STAND-IN'};"
          f" REVIEW_FLOOR = {IDENT.REVIEW_FLOOR}")

    # The control FIRST, because it is the thing that could silently break:
    # switching to grade_identification must not change ANY letter item.
    eng, db = await fresh()
    rep = await CS.rescore_for(db, "-", "E")
    await db.commit()
    s6 = await scores(db)
    check("CONTROL letters unchanged: p1 q2 '-' -> 'E', key E, correct",
          s6[(1, 2)] == ("E", True, "correct"), str(s6[(1, 2)]),
          "equality and grade_identification must agree on single letters")
    check("CONTROL letters unchanged: p1 q3 '-' -> 'E', key C, wrong",
          s6[(1, 3)] == ("E", False, "wrong"), str(s6[(1, 3)]),
          "two distinct letters score 0.0, far below the floor - never review")
    check("CONTROL no letter item was pushed into review",
          rep.marks_to_review == 0, f"{rep.marks_to_review}")
    check("CONTROL counts identical to the equality version",
          (rep.rows_examined, rep.rows_changed, rep.marks_gained, rep.marks_lost)
          == (4, 3, 2, 0),
          f"{rep.rows_examined}/{rep.rows_changed}/{rep.marks_gained}/{rep.marks_lost}")
    await db.close(); await eng.dispose()

    # Alex's point 4: the whole reason the table earns its place.
    eng, db = await fresh()
    before5 = await totals(db)
    rep = await CS.rescore_for(db, "MACHIN", "MACHINE")
    await db.commit()
    s6, t6 = await scores(db), await totals(db)
    check("ALEX p4: 'MACHIN' -> 'MACHINE' is now CORRECT, not review",
          s6[(5, 1)] == ("MACHINE", True, "correct"), str(s6[(5, 1)]),
          "exact after correction, so grade_identification returns CORRECT")
    check("ALEX p4: it is reported as a mark gained",
          rep.marks_gained == 1, f"{rep.marks_gained}")
    check("ALEX p4: p5 total_score recounted", t6[5] == before5[5] + 1,
          f"{before5[5]} -> {t6[5]}")
    check("the uncorrected identification rows are untouched",
          s6[(5, 2)][0] == "QQQ" and s6[(5, 3)][0] == "ZZZ",
          f"{s6[(5, 2)][0]}, {s6[(5, 3)][0]}")
    await db.close(); await eng.dispose()

    # THE FAULT THIS CHANGE FIXES. A correction that moves a wrong answer
    # CLOSER to the key without reaching it must become the teacher's
    # decision, not a silent 'wrong'.
    sim = IDENT.similarity("MACHIN", "MACHINE")
    eng, db = await fresh()
    rep = await CS.rescore_for(db, "QQQ", "MACHIN")
    await db.commit()
    s6 = await scores(db)
    check(f"closer-but-not-exact -> REVIEW, not wrong  (similarity {sim:.3f})",
          s6[(5, 2)] == ("MACHIN", False, "review"), str(s6[(5, 2)]),
          "the old equality version marked this 'wrong' and said nothing")
    check("and it is reported, so the teacher is told to look",
          rep.marks_to_review == 1, f"{rep.marks_to_review}")
    check("'now need a teacher's review' appears in the sentence",
          "review" in rep.sentence(), rep.sentence())
    check("is_correct stays False - review is not a mark",
          s6[(5, 2)][1] is False, str(s6[(5, 2)][1]))
    await db.close(); await eng.dispose()

    # CONTROL: still far away -> still wrong. Review must not swallow
    # everything.
    eng, db = await fresh()
    rep = await CS.rescore_for(db, "ZZZ", "XQV")
    await db.commit()
    s6 = await scores(db)
    check("CONTROL far-from-the-key stays WRONG, not review",
          s6[(5, 3)] == ("XQV", False, "wrong"), str(s6[(5, 3)]),
          f"similarity('XQV','ESSAY') = {IDENT.similarity('XQV', 'ESSAY'):.3f}, "
          f"below REVIEW_FLOOR")
    check("CONTROL nothing reported to review", rep.marks_to_review == 0,
          f"{rep.marks_to_review}")
    await db.close(); await eng.dispose()

    print("\n" + "=" * 74)
    print(f"{OK} passed, {FAIL} failed")
    print("=" * 74)
    return 1 if FAIL else 0


sys.exit(asyncio.run(main()))