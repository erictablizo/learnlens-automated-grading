"""
measure/2026-11-19_true_false_display.py — Sir Alex, 2026-11-19 point 3:
"Correct display in Test Paper -> TRUE instead of T".

The grading loop of app/ml/grader.py, before and after, lifted verbatim.
Only the identification branch is omitted; it is untouched by the change.

    python 2026-11-19_true_false_display.py
"""
import sys

BLANK = "—"
CORRECT, REVIEW, WRONG = "correct", "review", "wrong"
OK = FAIL = 0
def check(label, cond, got="", note=""):
    global OK, FAIL
    if cond: OK += 1; print(f"  ok    {label}  ({got})")
    else:
        FAIL += 1; print(f"  FAIL  {label}  ({got})")
        if note: print(f"        {note}")

# ---- verbatim from grader.py --------------------------------------------
def _norm(ans):
    a = (ans or "").strip().upper()
    if a in ("TRUE",):  return "T"
    if a in ("FALSE",): return "F"
    return a

# ---- NEW ----------------------------------------------------------------
def _is_true_false(raw_key):
    """A TRUE/FALSE item, decided by the KEY - the only authority on the page.

    NOT by the student's letter. "F" is a legal multiple-choice option
    (MIXED_LETTERS is "ABCDEFT"), so expanding every F would turn a correct
    matching-type F into FALSE.
    """
    return (raw_key or "").strip().upper() in ("TRUE", "FALSE")

def _expand(a):
    if a == "T": return "TRUE"
    if a == "F": return "FALSE"
    return a

# ---- the loop, both arms ------------------------------------------------
def grade(detected, key_map, expand):
    rows = []
    correct = answered = 0
    for q in sorted(key_map):
        raw_key = key_map[q]
        letter, conf, page = detected.get(q, ("", 0.0, 1))
        key = _norm(raw_key)
        student = _norm(letter)
        if student:
            answered += 1
        ok = bool(student) and student == key          # UNCHANGED, both arms
        correct += ok
        if expand and _is_true_false(raw_key):
            shown_student, shown_key = _expand(student), _expand(key)
        else:
            shown_student, shown_key = student, key
        rows.append({"q": q, "student": shown_student or BLANK, "key": shown_key,
                     "is_correct": ok})
    return rows, correct, answered

# =========================================================================
# A page with BOTH kinds, which is the whole difficulty.
KEY = {
    1: "TRUE",   # true/false, student wrote TRUE
    2: "FALSE",  # true/false, student wrote FALSE
    3: "TRUE",   # true/false, student wrote FALSE  -> wrong
    4: "F",      # MATCHING TYPE, the letter F. Correct.
    5: "B",      # multiple choice
    6: "FALSE",  # unanswered
}
DET = {
    1: ("T", .98, 1), 2: ("F", .97, 1), 3: ("F", .95, 1),
    4: ("F", .91, 1), 5: ("B", .93, 1),
}

print("=" * 72); print("1. THE SCORE MUST NOT MOVE"); print("=" * 72)
before, cb, ab = grade(DET, KEY, expand=False)
after,  ca, aa = grade(DET, KEY, expand=True)
print(f"  before: correct={cb} answered={ab}")
print(f"  after : correct={ca} answered={aa}")
check("same correct count", cb == ca == 4, f"{cb} vs {ca}",
      "The comparison still runs on _norm; only what is STORED for display changes.")
check("same answered count", ab == aa == 5, f"{ab} vs {aa}")
check("same per-item verdicts",
      [r["is_correct"] for r in before] == [r["is_correct"] for r in after],
      str([r["is_correct"] for r in after]))

print("\n" + "=" * 72); print("2. WHAT THE TEST PAPER SHOWS"); print("=" * 72)
print(f"  {'item':<6}{'key':<10}{'BEFORE':<18}{'AFTER':<18}")
for b, a in zip(before, after):
    print(f"  {b['q']:<6}{KEY[b['q']]:<10}"
          f"{b['student'] + ' vs ' + b['key']:<18}"
          f"{a['student'] + ' vs ' + a['key']:<18}")
check("item 1 reads TRUE, not T", after[0]["student"] == "TRUE" == after[0]["key"],
      f"{after[0]['student']} vs {after[0]['key']}")
check("item 2 reads FALSE, not F", after[1]["student"] == "FALSE" == after[1]["key"],
      f"{after[1]['student']} vs {after[1]['key']}")
check("item 3, a WRONG true/false, reads FALSE vs TRUE",
      after[2]["student"] == "FALSE" and after[2]["key"] == "TRUE"
      and not after[2]["is_correct"],
      f"{after[2]['student']} vs {after[2]['key']}")

print("\n" + "=" * 72)
print("3. THE CONTROL - a matching-type F must stay F")
print("=" * 72)
check("item 4: key 'F' is NOT expanded to FALSE",
      after[3]["student"] == "F" and after[3]["key"] == "F", 
      f"{after[3]['student']} vs {after[3]['key']}",
      "MIXED_LETTERS is 'ABCDEFT'. Expanding on the STUDENT's letter instead "
      "of the KEY would print FALSE here and misdescribe a correct answer.")
check("  and it is still marked correct", after[3]["is_correct"], "True")
check("item 5: a plain multiple-choice B is untouched",
      after[4]["student"] == "B" and after[4]["key"] == "B", after[4]["student"])

# The naive fix, for contrast.
naive = [_expand(_norm(DET.get(q, ("", 0, 1))[0])) for q in sorted(KEY)]
print(f"  naive 'expand every T/F letter': {naive}")
check("  CONTROL: the naive fix corrupts item 4", naive[3] == "FALSE", naive[3],
      "This is the bug the key-based test exists to avoid.")

print("\n" + "=" * 72); print("4. BLANKS"); print("=" * 72)
check("an unanswered TRUE/FALSE item still shows the blank marker",
      after[5]["student"] == BLANK, after[5]["student"])
check("  and its key still reads FALSE", after[5]["key"] == "FALSE", after[5]["key"])
check("  and it is not counted as answered", aa == 5, str(aa))

print("\n" + "=" * 72)
print(f"{OK} checks passed, {FAIL} failed")
sys.exit(1 if FAIL else 0)
