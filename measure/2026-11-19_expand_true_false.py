"""
measure/2026-11-19_expand_true_false.py
=======================================
Sir Alex 2026-11-19, page 1 item 3 — "TRUE instead of T", for the papers that
were already checked.

IT RUNS THE REAL MIGRATION FILE. Not a transcription of it, not an ORM
equivalent: this reads `migrations/2026-11-19_expand_true_false.sql` off disk
and feeds it to psql against a scratch PostgreSQL database. The 28 Sep
post-mortem's rule applies to SQL as much as to Python - a test that
re-implements a statement cannot catch a bug in that statement.

    python measure/2026-11-19_expand_true_false.py

Needs `psql` on PATH and a PostgreSQL you can create a database on. It builds
`learnlens_tf_bench`, drops it at the end, and never touches anything else.
Point it elsewhere with PGHOST / PGPORT / PGUSER as usual.
"""
import os
import subprocess
import sys

OK = FAIL = 0
DB = "learnlens_tf_bench"
HERE = os.path.dirname(os.path.abspath(__file__))
SQL_FILE = os.path.join(HERE, "..", "migrations", "2026-11-19_expand_true_false.sql")


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


def psql(sql=None, db=DB, file=None, quiet=True):
    cmd = ["psql", "-v", "ON_ERROR_STOP=1", "-d", db]
    if quiet:
        cmd += ["-tAq"]
    if file:
        cmd += ["-f", file]
    else:
        cmd += ["-c", sql]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(f"\n  !! psql failed: {(r.stderr or r.stdout).strip()}")
        sys.exit(2)
    return r.stdout.strip()


# NOT '|'. A contested reading IS 'T|F', and psql's default column separator
# would split it in half - the fixture would silently stop testing the thing
# it was added to test. Record of a real failure, kept as a comment so the
# separator does not drift back.
SEP = "\u00a7"


def rows():
    """Every paper_score as a comparable tuple."""
    out = psql(f"SELECT concat_ws('{SEP}', score_id, student_answer, "
               f"correct_answer, is_correct, verdict) "
               f"FROM paper_scores ORDER BY score_id")
    got = {}
    for line in out.splitlines():
        sid, sa, ca, ic, vd = line.split(SEP)
        got[int(sid)] = (sa, ca, ic == "t", vd)
    return got


if not os.path.exists(SQL_FILE):
    print(f"  !! migration not found: {SQL_FILE}")
    sys.exit(2)
print(f"migration under test: {os.path.normpath(SQL_FILE)}")

psql(f'DROP DATABASE IF EXISTS {DB}', db="postgres")
psql(f'CREATE DATABASE {DB}', db="postgres")

# Minimal schema: the two tables and the columns the migration names. Nothing
# else is relevant to an UPDATE ... FROM, and a cut-down schema cannot change
# what the statement does to these columns.
psql("""
CREATE TABLE public.answer_keys (
    answer_key_id  integer PRIMARY KEY,
    correct_answer varchar(100) NOT NULL
);
CREATE TABLE public.paper_scores (
    score_id       integer PRIMARY KEY,
    answer_key_id  integer NOT NULL REFERENCES public.answer_keys(answer_key_id),
    student_answer varchar(100) NOT NULL,
    correct_answer varchar(100) NOT NULL,
    is_correct     boolean NOT NULL,
    verdict        varchar(10) NOT NULL DEFAULT 'wrong'
);
""")

#  key_id : what the ANSWER KEY says - this is what decides everything
KEYS = [
    (1, "TRUE"),      # a true/false item
    (2, "FALSE"),     # a true/false item
    (3, "F"),         # MATCHING TYPE whose correct answer is the letter F
    (4, "T"),         # an item whose key was stored folded - must be left alone
    (5, "C"),         # multiple choice
    (6, "MACHINE"),   # identification
]
#  id, key_id, student, correct, is_correct, verdict,   expected after
SCORES = [
    (10, 1, "T",      "T",     True,  "correct", ("TRUE",  "TRUE",  True,  "correct")),
    (11, 1, "F",      "T",     False, "wrong",   ("FALSE", "TRUE",  False, "wrong")),
    (12, 2, "F",      "F",     True,  "correct", ("FALSE", "FALSE", True,  "correct")),
    (13, 1, " t ",    "T",     True,  "correct", ("TRUE",  "TRUE",  True,  "correct")),
    (14, 1, "—", "T",     False, "wrong",   ("—", "TRUE", False, "wrong")),
    (15, 1, "T|F",    "T",     False, "wrong",   ("T|F",   "TRUE",  False, "wrong")),
    (16, 1, "TRUE",   "TRUE",  True,  "correct", ("TRUE",  "TRUE",  True,  "correct")),
    # ---- the controls. None of these may move. ----
    (20, 3, "F",      "F",     True,  "correct", ("F",     "F",     True,  "correct")),
    (21, 3, "T",      "F",     False, "wrong",   ("T",     "F",     False, "wrong")),
    (22, 4, "T",      "T",     True,  "correct", ("T",     "T",     True,  "correct")),
    (23, 5, "C",      "C",     True,  "correct", ("C",     "C",     True,  "correct")),
    (24, 5, "F",      "C",     False, "wrong",   ("F",     "C",     False, "wrong")),
    (25, 6, "MACHIN", "MACHINE", False, "review", ("MACHIN", "MACHINE", False, "review")),
]

psql("INSERT INTO public.answer_keys VALUES " + ",".join(
    f"({i},'{a}')" for i, a in KEYS))
psql("INSERT INTO public.paper_scores VALUES " + ",".join(
    f"({sid},{kid},'{sa}','{ca}',{str(ic).lower()},'{vd}')"
    for sid, kid, sa, ca, ic, vd, _ in SCORES))

before = rows()

print("\n" + "=" * 74)
print("1.  the real migration, run against a real PostgreSQL")
print("=" * 74)
out = psql(file=os.path.normpath(SQL_FILE), quiet=False)
print("   " + out.replace("\n", "\n   "))
after = rows()

print("\n" + "=" * 74)
print("2.  true/false items — expanded")
print("=" * 74)
for sid, kid, sa, ca, ic, vd, exp in SCORES:
    if kid not in (1, 2):
        continue
    label = {10: "T/T correct -> TRUE/TRUE, still correct",
             11: "F against key T -> FALSE/TRUE, still wrong",
             12: "F/F correct (key FALSE) -> FALSE/FALSE, still correct",
             13: "' t ' lower case and padded -> TRUE",
             14: "BLANK em dash untouched, its key still expands",
             15: "CONTESTED 'T|F' untouched (documented)",
             16: "already expanded -> unchanged"}[sid]
    check(label, after[sid] == exp, str(after[sid]), f"expected {exp}")

print("\n" + "=" * 74)
print("3.  THE CONTROLS — matching type, folded keys, multiple choice")
print("=" * 74)
for sid, kid, sa, ca, ic, vd, exp in SCORES:
    if kid in (1, 2):
        continue
    label = {20: "MATCHING 'F' with key 'F' is UNTOUCHED",
             21: "MATCHING 'T' with key 'F' is UNTOUCHED",
             22: "an item whose KEY is 'T' is left alone (mirrors _is_true_false)",
             23: "multiple choice 'C' untouched",
             24: "multiple choice 'F' untouched — the dangerous one",
             25: "identification untouched, verdict 'review' preserved"}[sid]
    check(label, after[sid] == exp, str(after[sid]), f"expected {exp}")

print("\n" + "=" * 74)
print("4.  WHAT MUST NOT HAVE MOVED, across every row")
print("=" * 74)
check("is_correct identical on every row",
      all(before[s][2] == after[s][2] for s in before), f"{len(before)} rows",
      "this migration must never be able to change a mark")
check("verdict identical on every row",
      all(before[s][3] == after[s][3] for s in before), f"{len(before)} rows")
check("row count unchanged",
      psql("SELECT count(*) FROM paper_scores") == str(len(SCORES)), "13 rows")
check("answer_keys untouched",
      psql("SELECT string_agg(correct_answer, ',' ORDER BY answer_key_id) "
           "FROM answer_keys") == "TRUE,FALSE,F,T,C,MACHINE", "6 keys")

print("\n" + "=" * 74)
print("5.  IDEMPOTENCE — run it a second time")
print("=" * 74)
out2 = psql(file=os.path.normpath(SQL_FILE), quiet=False)
again = rows()
check("second run changes nothing", again == after, f"{len(again)} rows")
check("second run reports 0 rows to expand",
      " 0\n" in out2 or out2.strip().splitlines()[1].strip() == "0",
      out2.replace("\n", " | "))

print("\n" + "=" * 74)
print("6.  THE PRODUCTION SHAPE, reproduced")
print("=" * 74)
dist = psql("SELECT upper(btrim(student_answer)), count(*) FROM paper_scores "
            "GROUP BY 1 ORDER BY 2 DESC, 1")
print("   " + dist.replace("\n", "\n   "))
check("no T or F survives on a true/false item",
      psql("SELECT count(*) FROM paper_scores ps JOIN answer_keys ak "
           "ON ak.answer_key_id = ps.answer_key_id "
           "WHERE upper(btrim(ak.correct_answer)) IN ('TRUE','FALSE') "
           "AND upper(btrim(ps.student_answer)) IN ('T','F')") == "0", "0 rows")
# FOUR, not three. The first version of this check said three and failed:
# I had forgotten score 24, the multiple-choice 'F' against a key of 'C' -
# which is the row most at risk from a careless predicate and the whole
# reason it is in the fixture. The assertion was wrong; the migration was
# right. Left documented rather than quietly corrected.
survivors = psql("SELECT concat_ws(',', score_id, student_answer, correct_answer) "
                 "FROM paper_scores WHERE student_answer IN ('T','F') "
                 "ORDER BY score_id").splitlines()
check("CONTROL T and F still exist where they belong",
      len(survivors) == 4, " | ".join(survivors),
      "matching F, matching T, folded-key T, and multiple-choice F")

psql(f'DROP DATABASE IF EXISTS {DB}', db="postgres")

print("\n" + "=" * 74)
print(f"{OK} passed, {FAIL} failed")
print("=" * 74)
sys.exit(1 if FAIL else 0)