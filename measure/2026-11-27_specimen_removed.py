#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
measure/2026-11-27_specimen_removed.py                            2026-11-27
============================================================================

Sir Alex Passion, 27 November 2026: the specimen-correction table is not
needed, because the focus is encircled answers.

    python measure/2026-11-27_specimen_removed.py

THIS BENCH HAS TWO JOBS AND THE SECOND ONE IS THE REAL ONE.

  1. that the feature is gone - the screen, the router, the model, the pass
     in the checker, and the five deleted files, with nothing left importing
     any of them.

  2. THAT THE REMOVAL STOPPED WHERE IT WAS SUPPOSED TO. One prefix apart
     from the table that went is `ocr_correction_samples`, which is live and
     is the data behind Ms. Melanie, page 19 requirement 1. A removal that
     took both would not crash: the "Corrections by teacher" panel would
     render a column of zeroes, which looks like a quiet class rather than a
     broken feature, and nobody would find it before the defence.

SO IT RUNS THE SURVIVING CODE, not just greps for it. sample_worth_keeping
and build_sample were lifted out of a 470-line file into a 122-line one, and
"the text is still there" is not the same claim as "it still behaves the
same". The fixtures below are the five refusals and the two accepts, run
against the real module imported from the real package.

IT EXITS 2 RATHER THAN SKIPPING if the import fails. A bench that quietly
drops its only behavioural section when a dependency is missing reports
green on a tree it never measured. Use the backend's own venv.
"""
import ast
import importlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"

passed = 0
failed = []


def check(label, cond, detail=""):
    global passed
    if cond:
        passed += 1
    else:
        failed.append(f"{label}: {detail}" if detail else label)


def bail(why, *extra):
    print(f"\n  CANNOT MEASURE: {why}")
    for line in extra:
        print(f"  {line}")
    print("  Nothing was checked.")
    sys.exit(2)


def text(rel):
    p = ROOT / rel
    if not p.is_file():
        return None
    return p.read_text(encoding="utf-8", errors="replace").replace("\r\n", "\n")


# ── 1. the five files are gone ────────────────────────────────────────────
GONE = [
    "backend/app/api/routes/admin_corrections.py",
    "backend/app/schemas/ocr_correction.py",
    "frontend/src/components/admin/SpecimenCorrections.tsx",
    "frontend/src/services/correctionService.ts",
    "frontend/src/types/correction.ts",
]
for rel in GONE:
    check(f"{rel.split('/')[-1]} is gone", not (ROOT / rel).is_file())

# ── 2. and the two that must NOT be ───────────────────────────────────────
STAYS = [
    "backend/app/services/teacher_correction_service.py",
    "backend/app/api/routes/admin_teacher_corrections.py",
    "frontend/src/components/admin/TeacherCorrections.tsx",
    "backend/app/services/correction_service.py",
]
for rel in STAYS:
    check(f"{rel.split('/')[-1]} is still here", (ROOT / rel).is_file(),
          "this is the half of the feature that stays")

# ── 3. the router ─────────────────────────────────────────────────────────
reg = text("backend/app/api/routes/__init__.py")
if reg is None:
    bail("backend/app/api/routes/__init__.py is not in this tree",
         "Run this from the repo root.")
# LIVE LINES ONLY. Measured 2026-11-27: a mutation that COMMENTED OUT the
# teacher-corrections registration survived, because the name was still in
# the file. "Mentioned" and "registered" are different claims.
_live = [l for l in reg.splitlines() if not l.strip().startswith("#")]
check("the specimen router is not imported",
      not any("admin_corrections" in l for l in _live),
      str([l.strip() for l in _live if "admin_corrections" in l][:1]))
check("  ...and the teacher-corrections router is still IMPORTED",
      any("import" in l and "admin_teacher_corrections" in l for l in _live),
      "Ms. Melanie's page 19 requirement 1 is served by that router")
check("  ...and still REGISTERED, not merely imported",
      any("include_router(admin_teacher_corrections_router)" in l
          for l in _live),
      "an unregistered router is a 404 on every endpoint it carries")

# ── 4. the model ──────────────────────────────────────────────────────────
models = text("backend/app/models/models.py")
if models is None:
    bail("backend/app/models/models.py is not in this tree")
check("the OCRCorrection model is gone",
      "class OCRCorrection(Base)" not in models)
check("  ...and OCRCorrectionSample is NOT",
      "class OCRCorrectionSample(Base)" in models,
      "one name is a prefix of the other; this is the check that catches it")
check("the ocr_corrections table is not declared",
      '__tablename__ = "ocr_corrections"' not in models)
check("  ...and ocr_correction_samples still is",
      '__tablename__ = "ocr_correction_samples"' in models)

# ── 5. the split ──────────────────────────────────────────────────────────
cs = text("backend/app/services/correction_service.py")
if cs is None:
    bail("backend/app/services/correction_service.py is not in this tree")
for name in ("norm_seen", "sample_worth_keeping", "build_sample"):
    check(f"correction_service keeps {name}", f"def {name}(" in cs)
for name in ("apply_corrections", "active_map", "judge", "_correctable",
             "count_affected", "preview_for", "rescore_for", "suggestions"):
    check(f"  ...and has dropped {name}", f"def {name}(" not in cs)
# THE IMPORTS, NOT THE PROSE. A regex for "OCRCorrection" over the whole file
# fires on this module's own header, which explains what was removed - and a
# check that a comment can fail is a check that gets deleted. Parsed instead.
_cs_tree = ast.parse(cs)
_imported = set()
for _n in ast.walk(_cs_tree):
    if isinstance(_n, (ast.Import, ast.ImportFrom)):
        _imported |= {a.name for a in _n.names}
check("it no longer imports the removed model",
      "OCRCorrection" not in _imported,
      f"a bare OCRCorrection import is an ImportError at startup once the "
      f"model is gone; imports are {sorted(_imported)}")
check("  ...nor anything else the cascade needed",
      not ({"TestPaper", "grade_identification", "func", "select"} & _imported),
      str(sorted({"TestPaper", "grade_identification", "func", "select"}
                 & _imported)))
check("  ...and still imports the one that stays",
      "OCRCorrectionSample" in _imported, str(sorted(_imported)))


def _code_only(tree):
    """The module with every docstring removed, as text.

    So that a reference in EXECUTABLE code is distinguishable from a mention
    in the prose that explains the removal.
    """
    stripped = ast.parse(ast.unparse(tree))
    for node in ast.walk(stripped):
        body = getattr(node, "body", None)
        if isinstance(body, list) and body and isinstance(body[0], ast.Expr) \
           and isinstance(body[0].value, ast.Constant) \
           and isinstance(body[0].value.value, str):
            node.body = body[1:] or [ast.Pass()]
    return ast.unparse(stripped)


check("no executable line mentions the removed model",
      not re.search(r"\bOCRCorrection\b(?!Sample)", _code_only(_cs_tree)),
      "prose may name it; code may not")

# ── 6. the checker ────────────────────────────────────────────────────────
ocr = text("backend/app/services/ocr_service.py")
if ocr is None:
    bail("backend/app/services/ocr_service.py is not in this tree")
check("the checker no longer applies a specimen list",
      "apply_corrections" not in ocr and "active_map" not in ocr,
      [l.strip() for l in ocr.splitlines()
       if "apply_corrections" in l or "active_map" in l][:1])

# ── 7. the hook that MUST survive ─────────────────────────────────────────
pas = text("backend/app/services/paper_answer_service.py")
if pas is None:
    bail("backend/app/services/paper_answer_service.py is not in this tree")
check("overriding an answer still records the pair",
      "from app.services.correction_service import build_sample" in pas,
      "without this, the Corrections by teacher panel stops gaining rows")
check("  ...and still calls it", "build_sample(" in pas)

tcs = text("backend/app/services/teacher_correction_service.py")
check("the teacher panel still counts the samples table",
      tcs is not None and "OCRCorrectionSample" in tcs)

# ── 8. the screen ─────────────────────────────────────────────────────────
page = text("frontend/src/app/(dashboard)/admin/page.tsx")
if page is None:
    bail("frontend/src/app/(dashboard)/admin/page.tsx is not in this tree")
check("the panel is off the admin screen", "SpecimenCorrections" not in page)
check("  ...and the teacher panel is still on it",
      "<TeacherCorrections />" in page)

# ── 9. nothing anywhere still points at the deleted files ────────────────
DOOMED = re.compile(r"admin_corrections|schemas\.ocr_correction"
                    r"|schemas/ocr_correction|SpecimenCorrections"
                    r"|services/correctionService|types/correction\b")
SKIP = {"node_modules", "__pycache__", ".next", "venv", ".venv", "dist",
        "retired"}
dangling = []
for base in ("backend/app", "frontend/src"):
    d = ROOT / base
    if not d.is_dir():
        continue
    for p in d.rglob("*"):
        if p.suffix not in {".py", ".ts", ".tsx"} or \
           any(s in p.parts for s in SKIP):
            continue
        body = p.read_text(encoding="utf-8", errors="replace")
        for i, line in enumerate(body.splitlines(), 1):
            if re.search(r"\b(import|from|require)\b", line) and DOOMED.search(line):
                dangling.append(f"{p.relative_to(ROOT).as_posix()}:{i} {line.strip()[:70]}")
check("nothing imports a file that was deleted", not dangling,
      "; ".join(dangling[:3]))

# ── 10. AND IT STILL BEHAVES. The part that is not a grep. ───────────────
sys.path.insert(0, str(BACKEND))


def _ours(exc) -> bool:
    """Is this import failure the REMOVAL's fault, or the environment's?

    The difference decides whether this is a finding or a reason to stop,
    and getting it wrong in either direction is bad: a missing venv reported
    as a broken removal wastes an afternoon, and a broken removal reported
    as a missing venv ships. Measured 2026-11-27 - deleting
    OCRCorrectionSample made the import raise, and the bench exited 2 with
    nothing checked, which is "refused to measure", not "caught it".

    A module the app owns, or a traceback frame inside backend/app, is ours.
    Anything else - sqlalchemy, pydantic, cv2 - is the environment.
    """
    name = getattr(exc, "name", "") or ""
    if name == "app" or name.startswith("app."):
        return True
    tb = exc.__traceback__
    while tb is not None:
        try:
            if Path(tb.tb_frame.f_code.co_filename).resolve().is_relative_to(
                    BACKEND / "app"):
                return True
        except (ValueError, OSError):
            pass
        tb = tb.tb_next
    return False


svc = PaperScore = BLANK = CONTESTED_SEP = None
try:
    svc = importlib.import_module("app.services.correction_service")
    from app.models.models import PaperScore          # noqa: E402
    from app.ml.grader import BLANK                   # noqa: E402
    from app.ml.ocr_item_numbers import CONTESTED_SEP  # noqa: E402
except Exception as e:                                # noqa: BLE001
    if not _ours(e):
        bail(f"could not import the surviving correction_service: "
             f"{type(e).__name__}: {e}",
             "That name is not one of ours, so this is the environment and",
             "not the removal. This is the half of the bench that measures",
             "behaviour rather than text, so it is not skipped. Activate the",
             "backend venv and run it again.")
    check("the surviving code still imports", False,
          f"{type(e).__name__}: {e} - this is the removal's doing, not the "
          f"environment's. If the name is OCRCorrectionSample, the removal "
          f"took the table that was supposed to stay.")

if svc is None:
    print()
    print(f"  {passed} passed, {len(failed)} failed")
    print()
    for f in failed:
        print("  FAIL  " + f)
    print()
    print("  the behaviour checks could not run, because the import failed.")
    sys.exit(1)

WORTH = [
    ("A", "B", 0.73, True,  "the ordinary case: the reader said A, a teacher said B"),
    ("a", "B", 0.73, True,  "case does not matter - norm_seen still applied"),
    ("A", "B", None, False, "confidence NULL: already corrected once, says "
                            "nothing about the reader"),
    ("A", "A", 0.90, False, "no change at all"),
    ("a", "A", 0.90, False, "no change AFTER normalising - the case that "
                            "proves norm_seen is still in the path"),
    ("",  "B", 0.90, False, "corrected from nothing"),
    ("A", "",  0.90, False, "corrected to nothing"),
    (BLANK, "B", 0.90, False, "the blank glyph as the reading"),
    ("A", BLANK, 0.90, False, "the blank glyph as the answer"),
    (f"A{CONTESTED_SEP}B", "C", 0.90, False, "a contested reading is not one mark"),
]
for seen, means, conf, want, why in WORTH:
    got = svc.sample_worth_keeping(seen, means, conf)
    check(f"sample_worth_keeping({seen!r}, {means!r}, {conf!r}) is {want} "
          f"- {why}", got is want, f"got {got}")

def built(label, score, **kw):
    """A raise is a RESULT. If build_sample throws because the model lost a
    column in the removal, that is the single most important thing this
    bench could find - and a traceback would read as the bench being broken
    rather than as the finding it is."""
    try:
        return svc.build_sample(score, **kw)
    except Exception as e:                            # noqa: BLE001
        check(label, False, f"it raised {type(e).__name__}: {e}")
        return None


score = PaperScore(score_id=11, question_number=4,
                   student_answer="  A  ", ocr_confidence=0.73)
row = built("build_sample returns a row for real evidence", score,
            exam_id=7, means="  B  ", user_id=3)
check("build_sample returns a row for real evidence", row is not None)
if row is not None:
    check("  ...with the reading stripped", row.seen == "A", repr(row.seen))
    check("  ...the answer stripped", row.means == "B", repr(row.means))
    check("  ...the item and exam carried",
          (row.question_number, row.exam_id, row.score_id) == (4, 7, 11),
          f"{row.question_number}, {row.exam_id}, {row.score_id}")
    check("  ...the confidence kept - it is what answers 'was it sure "
          "while it was wrong'", float(row.confidence) == 0.73, str(row.confidence))
    check("  ...and who typed it", row.corrected_by == 3, str(row.corrected_by))

long_score = PaperScore(score_id=12, question_number=5,
                        student_answer="X" * 140, ocr_confidence=0.5)
long_row = built("a long reading builds a row", long_score,
                 exam_id=7, means="Y" * 140, user_id=None)
check("a reading longer than the column is truncated, not refused",
      long_row is not None and len(long_row.seen) == 100
      and len(long_row.means) == 100,
      "none" if long_row is None else f"{len(long_row.seen)}, {len(long_row.means)}")

already = PaperScore(score_id=13, question_number=6,
                     student_answer="A", ocr_confidence=None)
check("build_sample returns None for an already-corrected item",
      built("an already-corrected item is handled", already,
            exam_id=7, means="B", user_id=3) is None,
      "a second edit is not evidence about the reader")

# ── 11. and the file parses as what it claims to be ──────────────────────
tree = ast.parse(cs)
names = {n.name for n in tree.body if isinstance(n, (ast.FunctionDef,
                                                     ast.AsyncFunctionDef))}
check("the surviving module defines exactly three functions",
      names == {"norm_seen", "sample_worth_keeping", "build_sample"},
      str(sorted(names)))

print()
print(f"  {passed} passed, {len(failed)} failed")
if failed:
    print()
    for f in failed:
        print("  FAIL  " + f)
print()
print("  the removal, and the half of it that had to stay - run, not grepped.")
sys.exit(1 if failed else 0)
