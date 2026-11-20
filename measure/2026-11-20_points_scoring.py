"""
measure/2026-11-20_points_scoring.py
=====================================
Sir Alex 2026-11-20, Recommendations page 12 — per-item points.

Loads `app/ml/scoring.py` FROM YOUR TREE by path and exercises the real
functions. No database, no app imports - the module has none by design.

    cd backend
    python ../measure/2026-11-20_points_scoring.py

THE CHECK THAT MATTERS is section 1: with every item worth 1 point, every
number must equal the count it replaces. Every exam that exists today is
priced that way, so if this feature can break anything, it breaks it there.
"""
import importlib.util
import os
import sys

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


def find(start):
    d = os.path.abspath(start)
    while True:
        p = os.path.join(d, "app", "ml", "scoring.py")
        if os.path.exists(p):
            return p
        up = os.path.dirname(d)
        if up == d:
            return None
        d = up


PATH = find(os.getcwd()) or find(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"))
if not PATH:
    print("Could not find app/ml/scoring.py. Run from inside backend/.")
    sys.exit(2)
spec = importlib.util.spec_from_file_location("scoring", PATH)
S = importlib.util.module_from_spec(spec)
# REGISTERED BEFORE EXECUTION, and it has to be: @dataclass resolves its own
# module out of sys.modules while the class body runs, so a module loaded by
# path without this raises AttributeError on the decorator. Measured.
sys.modules["scoring"] = S
spec.loader.exec_module(S)
print(f"under test: {PATH}")

# A 15-item paper: 11 correct, 2 under review, 2 wrong.
VERDICTS = ([(q, "correct") for q in range(1, 12)]
            + [(12, "review"), (13, "review"), (14, "wrong"), (15, "wrong")])

print("\n" + "=" * 74)
print("1.  THE CONTROL — one point an item must equal counting")
print("=" * 74)
flat = S.summarise(VERDICTS)                      # no points map at all
ones = S.summarise(VERDICTS, {q: 1 for q, _ in VERDICTS})
n_correct = sum(1 for _, v in VERDICTS if v == "correct")
n_review = sum(1 for _, v in VERDICTS if v == "review")

check("points_earned IS the count of correct answers",
      flat.points_earned == n_correct == 11, f"{flat.points_earned}")
check("points_possible IS the item count",
      flat.points_possible == len(VERDICTS) == 15, f"{flat.points_possible}")
check("percent is the old figure, to the old rounding",
      flat.percent == round(11 / 15 * 100, 1) == 73.3, f"{flat.percent}")
check("an explicit all-1 map is identical to no map at all",
      flat == ones, "byte-identical",
      "a paper priced at 1 must not depend on whether anyone said so")
check("review items counted, not scored",
      (flat.review_items, flat.points_review) == (2, 2), f"{flat.review_items}")
check("max_points is the ceiling if review went the student's way",
      flat.max_points == 13 and flat.max_percent == 86.7, f"{flat.max_points}")
check("is_final false while anything is under review",
      flat.is_final is False, str(flat.is_final))

clean = S.summarise([(q, "correct") for q in range(1, 16)])
check("CONTROL a full paper with no review is final at 100%",
      (clean.percent, clean.is_final, clean.max_points) == (100.0, True, 15),
      f"{clean.percent}%")

print("\n" + "=" * 74)
print("2.  ALEX'S OWN EXAMPLE — Test I = 2 pts, Test II = 10 pts")
print("=" * 74)
# Items 1-10 at 2 points, items 11-15 at 10 points. The English 101 sheet.
PTS = {q: (2 if q <= 10 else 10) for q in range(1, 16)}
s = S.summarise(VERDICTS, PTS)
check("points_possible = 10x2 + 5x10", s.points_possible == 70, f"{s.points_possible}")
check("earned: items 1-10 correct (20) + item 11 correct (10)",
      s.points_earned == 30, f"{s.points_earned}")
check("percent is weighted, not an item ratio",
      s.percent == 42.9, f"{s.percent}% (the unweighted figure would be 73.3%)",
      "this is the whole point of the feature and the whole risk of it")
check("the two review items are worth 20, not 2",
      s.points_review == 20, f"{s.points_review}")
check("max_points shows what is still in play",
      s.max_points == 50 and s.max_percent == 71.4, f"{s.max_points} / {s.max_percent}%")
check("item counts are unchanged by pricing",
      (s.total_items, s.correct_items, s.review_items) == (15, 11, 2),
      f"{s.correct_items}/{s.total_items}")

print("\n" + "=" * 74)
print("3.  A HIGH-VALUE ITEM DECIDES THE PAPER — the thing to be careful about")
print("=" * 74)
# 9 one-point items correct, one 10-point item wrong.
mixed = [(q, "correct") for q in range(1, 10)] + [(10, "wrong")]
mp = {q: 1 for q in range(1, 10)}
mp[10] = 10
m = S.summarise(mixed, mp)
check("9 of 10 items correct", m.correct_items == 9, f"{m.correct_items}/10")
check("but 9 of 19 points", m.points_earned == 9 and m.points_possible == 19,
      f"{m.points_earned}/{m.points_possible}")
check("so 47.4%, not 90% — a FAIL where counting said a pass",
      m.percent == 47.4, f"{m.percent}%",
      "if a teacher is surprised by this, the pricing is the surprise, not a bug")

print("\n" + "=" * 74)
print("4.  REFUSALS AND EDGES — nothing may crash a class being marked")
print("=" * 74)
check("an empty paper scores zero and does not divide by zero",
      S.summarise([]).percent == 0.0 and S.summarise([]).points_possible == 0, "0%")
check("a missing points entry falls back to 1",
      S.summarise([(1, "correct"), (2, "correct")], {1: 5}).points_earned == 6,
      "5 + 1")
check("points of 0 falls back to 1, never unscorable",
      S.clamp_points(0) == 1, str(S.clamp_points(0)))
check("points above 10 are capped, never dominating",
      S.clamp_points(500) == 10, str(S.clamp_points(500)))
check("a negative value falls back to 1", S.clamp_points(-3) == 1, str(S.clamp_points(-3)))
check("None falls back to 1", S.clamp_points(None) == 1, str(S.clamp_points(None)))
check("a string number is accepted", S.clamp_points("3") == 3, str(S.clamp_points("3")))
check("nonsense falls back to 1", S.clamp_points("two") == 1, str(S.clamp_points("two")))
check("a malformed key row cannot stop the paper scoring",
      S.summarise([(1, "correct"), (2, "correct")], {1: "x", 2: None}).points_earned == 2,
      "both default to 1")
check("verdict case and whitespace do not matter",
      S.summarise([(1, " CORRECT "), (2, "Review")]).points_earned == 1,
      "rows come from a database, not a constant")
check("an unknown verdict scores nothing and is not review",
      S.summarise([(1, "maybe")]).points_earned == 0
      and S.summarise([(1, "maybe")]).review_items == 0, "0")

print("\n" + "=" * 74)
print("5.  summarise_bools — the grader's path must agree with the rows' path")
print("=" * 74)
bools = [(q, True) for q in range(1, 12)] + [(q, False) for q in range(12, 16)]
b = S.summarise_bools(bools, PTS)
# The same paper with the two review items treated as wrong, which is what a
# letter item is: there is no review state for it.
as_rows = S.summarise([(q, "correct") for q in range(1, 12)]
                      + [(q, "wrong") for q in range(12, 16)], PTS)
check("booleans and rows give the same summary", b == as_rows, "identical")
check("and the control holds here too: all-1 equals counting",
      S.summarise_bools(bools).points_earned == 11, "11")

print("\n" + "=" * 74)
print("6.  page_total — the 'Total Points on this page (Computed)' field")
print("=" * 74)
check("12 items at 2 points", S.page_total(12, 2) == 24, str(S.page_total(12, 2)))
check("15 items at 1 point", S.page_total(15, 1) == 15, str(S.page_total(15, 1)))
check("a blank item count is 0, not a crash", S.page_total(None, 3) == 0,
      str(S.page_total(None, 3)))
check("a negative item count is 0", S.page_total(-4, 3) == 0, str(S.page_total(-4, 3)))
check("points are clamped here too", S.page_total(10, 99) == 100,
      str(S.page_total(10, 99)),
      "the browser computes this as the teacher types; the server does not "
      "trust the browser's number")

print("\n" + "=" * 74)
print(f"{OK} passed, {FAIL} failed")
print("=" * 74)
sys.exit(1 if FAIL else 0)
