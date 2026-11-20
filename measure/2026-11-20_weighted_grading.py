"""
measure/2026-11-20_weighted_grading.py
=======================================
Sir Alex 2026-11-20, Recommendations page 12 — per-item points, in the grader.

Loads `app/ml/grader.py` FROM YOUR TREE by path and grades real fixtures with
it. Only the leaf modules it imports are substituted when they cannot load.

THE CONTROL IS A SIDE-BY-SIDE RUN. If `/tmp/grader_before.py` exists - a copy
of grader.py taken before the edits - this grades every fixture with BOTH and
asserts the unpriced results are identical, field by field. That is a stronger
statement than "the numbers look right": it is "this change cannot have moved
a mark on any exam that does not use points".

    cd backend
    cp app/ml/grader.py /tmp/grader_before.py     # BEFORE applying the edits
    python ../measure/2026-11-20_weighted_grading.py
"""
import importlib
import importlib.util
import os
import sys
import types

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


def find_app(start):
    d = os.path.abspath(start)
    while True:
        if os.path.exists(os.path.join(d, "app", "ml", "grader.py")):
            return os.path.join(d, "app")
        up = os.path.dirname(d)
        if up == d:
            return None
        d = up


APP = find_app(os.getcwd()) or find_app(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"))
if not APP:
    print("Could not find app/ml/grader.py. Run from inside backend/.")
    sys.exit(2)


def mkpkg(name, path):
    m = types.ModuleType(name)
    m.__path__ = [path]
    sys.modules[name] = m
    return m


mkpkg("app", APP)
mkpkg("app.ml", os.path.join(APP, "ml"))


def need(modname, label):
    try:
        mod = importlib.import_module(modname)
    except Exception as e:                                       # noqa: BLE001
        print(f"\n  !! {label} could not be imported from your tree")
        print(f"  !! {type(e).__name__}: {e}")
        print("  !! This bench measures YOUR files or it measures nothing.")
        sys.exit(2)
    print(f"  {label:<22}: {getattr(mod, '__file__', '?')}")
    return mod


print("\nloaded from your tree:")
need("app.ml.scoring", "scoring")
G = need("app.ml.grader", "grader")

# The pre-edit grader, if a copy was kept. Loaded as its own module so both
# versions can grade the same fixture in the same process.
BEFORE = None
if os.path.exists("/tmp/grader_before.py"):
    spec = importlib.util.spec_from_file_location("grader_before",
                                                  "/tmp/grader_before.py")
    BEFORE = importlib.util.module_from_spec(spec)
    sys.modules["grader_before"] = BEFORE
    spec.loader.exec_module(BEFORE)
    print(f"  {'grader BEFORE edits':<22}: /tmp/grader_before.py")
else:
    print("  (no /tmp/grader_before.py — the side-by-side control is SKIPPED)")

# ── fixtures ────────────────────────────────────────────────────────────────
# A 15-item English 101 page: Test I items 1-10 encircled, Test II items 11-15
# written letters. The student gets 1-9 right, 10 wrong, 11-14 right, 15 blank.
# So THIRTEEN correct out of fifteen. The first version of this bench asserted
# fourteen in one place and 9x2+4x10 in another - two numbers for the same
# fixture that could not both be true. The bench caught my arithmetic, which
# is what it is for.
KEY = {1: "C", 2: "B", 3: "A", 4: "D", 5: "B", 6: "C", 7: "A", 8: "D", 9: "B",
       10: "A", 11: "B", 12: "C", 13: "C", 14: "C", 15: "A"}
DET = {q: (KEY[q], 0.9, 1) for q in range(1, 10)}
DET[10] = ("C", 0.8, 1)          # wrong
DET.update({q: (KEY[q], 0.9, 1) for q in (11, 12, 13, 14)})
DET[15] = ("", 0.0, 1)           # blank

# An exam with an identification part, so a review verdict is in play.
IKEY = {1: "A", 2: "B", 3: "MACHINE", 4: "ESSAY"}
IDET = {1: ("A", 0.9, 1), 2: ("C", 0.9, 1),
        3: ("MACHIN", 0.7, 1),      # 0.857 -> review
        4: ("ESSAY", 0.9, 1)}
IDENT = {3, 4}

print("\n" + "=" * 74)
print("1.  THE CONTROL — unpriced grading must be what it was")
print("=" * 74)
after = G.grade_detected(DET, KEY)
check("13 of 15 items correct", after.correct == 13, f"{after.correct}")
check("percent unchanged", after.score_percent == round(13 / 15 * 100, 1) == 86.7,
      f"{after.score_percent}")
check("total_score is the mark and equals the count at 1 point an item",
      after.total_score == 13, f"{after.total_score}")
check("points_possible is the item count", after.points_possible == 15,
      f"{after.points_possible}")

if BEFORE is not None:
    for name, det, key, ident in (("letters", DET, KEY, None),
                                  ("identification", IDET, IKEY, IDENT)):
        a = G.grade_detected(det, key, ident)
        b = BEFORE.grade_detected(det, key, ident)
        same = (a.correct == b.correct
                and a.score_percent == b.score_percent
                and a.total_score == b.total_score
                and a.max_possible == b.max_possible
                and a.needs_review == b.needs_review
                and a.total_items == b.total_items
                and a.answered == b.answered
                and [(q.question_number, q.student_answer, q.correct_answer,
                      q.is_correct, q.verdict) for q in a.questions]
                == [(q.question_number, q.student_answer, q.correct_answer,
                     q.is_correct, q.verdict) for q in b.questions])
        check(f"SIDE BY SIDE ({name}): new grader == old grader, unpriced",
              same,
              f"score {a.total_score}/{a.total_items} vs {b.total_score}/{b.total_items}",
              "if this fails, the change moved a mark on an exam with no pricing")

print("\n" + "=" * 74)
print("2.  ALEX'S EXAMPLE — Test I = 2 pts, Test II = 10 pts")
print("=" * 74)
PTS = {q: (2 if q <= 10 else 10) for q in range(1, 16)}
w = G.grade_detected(DET, KEY, None, PTS)
check("item count is unchanged by pricing", w.correct == 13, f"{w.correct}")
check("possible = 10x2 + 5x10", w.points_possible == 70, f"{w.points_possible}")
check("earned = 9x2 + 4x10", w.total_score == 58, f"{w.total_score}")
check("percent is weighted", w.score_percent == 82.9,
      f"{w.score_percent}% (unweighted would be 86.7%)")
check("the questions themselves are identical to the unpriced run",
      [(q.question_number, q.verdict) for q in w.questions]
      == [(q.question_number, q.verdict) for q in after.questions],
      "same verdicts",
      "pricing must change what an answer is WORTH, never whether it is right")

print("\n" + "=" * 74)
print("3.  REVIEW ITEMS CARRY THEIR POINTS")
print("=" * 74)
r = G.grade_detected(IDET, IKEY, IDENT, {1: 1, 2: 1, 3: 10, 4: 10})
check("one item under review", r.needs_review == 1, f"{r.needs_review}")
check("earned excludes it: A correct (1) + ESSAY correct (10)",
      r.total_score == 11, f"{r.total_score}")
check("max_possible includes it, at its real worth",
      r.max_possible == 21, f"{r.max_possible}",
      "a 10-point item under review is the difference between a pass and a fail")
check("not final while it is unresolved", r.is_final is False, str(r.is_final))
check("review_items still names the item", r.review_items == [3], str(r.review_items))

print("\n" + "=" * 74)
print("4.  REFUSALS — a bad points map must not stop a class being marked")
print("=" * 74)
check("a missing item falls back to 1 point",
      G.grade_detected(DET, KEY, None, {1: 5}).total_score == 17,
      "item 1 at 5, the other 12 correct at 1")
check("a junk value falls back to 1",
      G.grade_detected(DET, KEY, None, {q: "x" for q in KEY}).total_score == 13, "13")
check("points above 10 are capped",
      G.grade_detected(DET, KEY, None, {q: 99 for q in KEY}).total_score == 130,
      "13 x 10")
check("an empty key still refuses, with its own message",
      G.grade_detected(DET, {}, None, PTS).success is False, "refused")
check("a blank key item still refuses",
      G.grade_detected(DET, {**KEY, 3: ""}, None, PTS).success is False, "refused")

print("\n" + "=" * 74)
print(f"{OK} passed, {FAIL} failed")
print("=" * 74)
sys.exit(1 if FAIL else 0)
