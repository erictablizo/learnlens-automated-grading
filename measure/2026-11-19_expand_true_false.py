"""
measure/2026-11-19_expand_true_false_keys.py
=============================================
Sir Alex 2026-11-19, page 1 item 3 — the ROOT of "TRUE instead of T".

Production stores the ANSWER KEYS folded: 20 keys read 'T', 10 read 'F'.
`_is_true_false()` tests the key against ("TRUE","FALSE"), so those items are
not treated as true/false at all and the display fix never runs on them.

This runs BOTH real migration files, in order, against a real PostgreSQL:

    migrations/2026-11-19_expand_true_false_keys.sql    (the keys)
    migrations/2026-11-19_expand_true_false.sql         (the recorded answers)

Neither is transcribed. The fixture reproduces the exact page shapes measured
on production on 2026-11-19, including the matching-type page that must not
move and the short page the rule declines to judge.

    python measure/2026-11-19_expand_true_false_keys.py
"""
import os
import subprocess
import sys

OK = FAIL = 0
DB = "learnlens_tfkeys_bench"
HERE = os.path.dirname(os.path.abspath(__file__))
MIG_KEYS = os.path.normpath(os.path.join(
    HERE, "..", "migrations", "2026-11-19_expand_true_false_keys.sql"))
MIG_SCORES = os.path.normpath(os.path.join(
    HERE, "..", "migrations", "2026-11-19_expand_true_false.sql"))
SEP = "§"


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
    cmd += ["-tAq"] if quiet else []
    cmd += ["-f", file] if file else ["-c", sql]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(f"\n  !! psql failed: {(r.stderr or r.stdout).strip()}")
        sys.exit(2)
    return r.stdout.strip()


def keys():
    out = psql(f"SELECT concat_ws('{SEP}', answer_key_id, correct_answer) "
               f"FROM answer_keys ORDER BY answer_key_id")
    return {int(l.split(SEP)[0]): l.split(SEP)[1] for l in out.splitlines()}


def scores():
    out = psql(f"SELECT concat_ws('{SEP}', score_id, student_answer, "
               f"correct_answer, is_correct) FROM paper_scores ORDER BY score_id")
    got = {}
    for l in out.splitlines():
        sid, sa, ca, ic = l.split(SEP)
        got[int(sid)] = (sa, ca, ic == "t")
    return got


for f in (MIG_KEYS, MIG_SCORES):
    if not os.path.exists(f):
        print(f"  !! migration not found: {f}")
        sys.exit(2)
print(f"migrations under test:\n  {MIG_KEYS}\n  {MIG_SCORES}")

psql(f"DROP DATABASE IF EXISTS {DB}", db="postgres")
psql(f"CREATE DATABASE {DB}", db="postgres")
psql("""
CREATE TABLE public.exam_pages (
    page_id integer PRIMARY KEY, page_number smallint NOT NULL);
CREATE TABLE public.answer_keys (
    answer_key_id   integer PRIMARY KEY,
    page_id         integer NOT NULL REFERENCES public.exam_pages(page_id),
    question_number smallint NOT NULL,
    correct_answer  varchar(100) NOT NULL);
CREATE TABLE public.paper_scores (
    score_id       integer PRIMARY KEY,
    answer_key_id  integer NOT NULL REFERENCES public.answer_keys(answer_key_id),
    student_answer varchar(100) NOT NULL,
    correct_answer varchar(100) NOT NULL,
    is_correct     boolean NOT NULL,
    verdict        varchar(10) NOT NULL DEFAULT 'wrong');
""")

# The production shapes, reproduced. page_id : (label, keys)
PAGES = {
    1: ("exam 5 p1 — 30 items, all T/F  THE ONE THAT QUALIFIES",
        ["T", "F"] * 15),
    2: ("exam 4 p1 — multiple choice", ["A", "B", "C", "D"] * 3 + ["A", "B", "C"]),
    3: ("exam 8 p2 — mixed, already words",
        ["A", "B", "C", "D", "E", "TRUE", "FALSE", "TRUE", "A", "B"]),
    4: ("MATCHING page — A-F including T and F, must NOT qualify",
        ["A", "B", "C", "D", "E", "F", "T", "A", "B", "C"]),
    5: ("short page — only T/F but 3 items, rule declines to judge",
        ["T", "F", "T"]),
}
akid = 0
rows_pages, rows_keys = [], []
KEY_PAGE = {}
for pid, (label, ks) in PAGES.items():
    rows_pages.append(f"({pid},1)")
    for q, k in enumerate(ks, 1):
        akid += 1
        rows_keys.append(f"({akid},{pid},{q},'{k}')")
        KEY_PAGE[akid] = pid
psql("INSERT INTO public.exam_pages VALUES " + ",".join(rows_pages))
psql("INSERT INTO public.answer_keys VALUES " + ",".join(rows_keys))

# One paper per page, answering exactly the key (so every row is correct),
# plus one deliberate miss on the true/false page.
sc = []
sid = 0
for aid, pid in KEY_PAGE.items():
    k = psql(f"SELECT correct_answer FROM answer_keys WHERE answer_key_id={aid}")
    sid += 1
    student = k
    correct = True
    if pid == 1 and aid == 2:        # one wrong answer on the T/F page
        student = "T" if k == "F" else "F"
        correct = False
    sc.append(f"({sid},{aid},'{student}','{k}',{str(correct).lower()},"
              f"'{'correct' if correct else 'wrong'}')")
psql("INSERT INTO public.paper_scores VALUES " + ",".join(sc))

k_before, s_before = keys(), scores()

print("\n" + "=" * 74)
print("1.  migration A — the ANSWER KEYS")
print("=" * 74)
print("   " + psql(file=MIG_KEYS, quiet=False).replace("\n", "\n   "))
k_mid, s_mid = keys(), scores()

qualifying = [a for a, p in KEY_PAGE.items() if p == 1]
check("exam 5 p1: every key expanded to TRUE/FALSE",
      all(k_mid[a] in ("TRUE", "FALSE") for a in qualifying), "30 keys")
check("and the T/F sense is preserved, never swapped",
      all((k_before[a] == "T") == (k_mid[a] == "TRUE") for a in qualifying), "30 keys")
for pid, label in ((2, "multiple choice"), (3, "mixed, already words"),
                   (4, "MATCHING with T and F among A-F"),
                   (5, "short all-T/F page")):
    ids = [a for a, p in KEY_PAGE.items() if p == pid]
    check(f"CONTROL {label} page UNTOUCHED",
          all(k_before[a] == k_mid[a] for a in ids), f"{len(ids)} keys",
          "a page with A-E on it is not a true/false page; "
          "a page under five items is not judged")
check("migration A does not touch paper_scores at all",
      s_mid == s_before, f"{len(s_mid)} rows")

print("\n" + "=" * 74)
print("2.  migration B — the RECORDED ANSWERS, now that the keys are words")
print("=" * 74)
print("   " + psql(file=MIG_SCORES, quiet=False).replace("\n", "\n   "))
s_after = scores()

tf_scores = [s for s, a in ((i + 1, i + 1) for i in range(len(KEY_PAGE)))
             if KEY_PAGE[a] == 1]
check("every recorded answer on the T/F page is now a word",
      all(s_after[s][0] in ("TRUE", "FALSE") and s_after[s][1] in ("TRUE", "FALSE")
          for s in tf_scores), f"{len(tf_scores)} rows")
for pid, label in ((2, "multiple choice"), (4, "MATCHING"), (5, "short page")):
    ids = [i + 1 for i in range(len(KEY_PAGE)) if KEY_PAGE[i + 1] == pid]
    check(f"CONTROL {label} recorded answers UNTOUCHED",
          all(s_before[s] == s_after[s] for s in ids), f"{len(ids)} rows")

print("\n" + "=" * 74)
print("3.  NO MARK MOVED — the property both migrations exist to preserve")
print("=" * 74)
check("is_correct identical on every row, after BOTH migrations",
      all(s_before[s][2] == s_after[s][2] for s in s_before), f"{len(s_before)} rows",
      "a migration that could change a mark would be a different and far "
      "more dangerous thing")
check("the deliberate wrong answer is still wrong",
      s_after[2][2] is False, str(s_after[2]))
check("the deliberate wrong answer is still READABLE as a word",
      s_after[2][0] in ("TRUE", "FALSE") and s_after[2][1] in ("TRUE", "FALSE"),
      str(s_after[2]))
check("row counts unchanged",
      psql("SELECT count(*) FROM paper_scores") == str(len(s_before)) and
      psql("SELECT count(*) FROM answer_keys") == str(len(k_before)),
      f"{len(s_before)} scores, {len(k_before)} keys")

print("\n" + "=" * 74)
print("4.  IDEMPOTENCE — both, again, in order")
print("=" * 74)
psql(file=MIG_KEYS, quiet=False)
psql(file=MIG_SCORES, quiet=False)
check("second pass changes no key", keys() == k_mid, f"{len(k_before)} keys")
check("second pass changes no score", scores() == s_after, f"{len(s_before)} rows")

print("\n" + "=" * 74)
print("5.  _is_true_false() would now fire, which is the whole point")
print("=" * 74)
still = psql("SELECT count(*) FROM answer_keys ak WHERE upper(btrim(ak.correct_answer)) "
             "IN ('T','F') AND ak.page_id = 1")
check("no folded key survives on the true/false page", still == "0", f"{still}")
left = psql("SELECT concat_ws(',', page_id, upper(btrim(correct_answer))) "
            "FROM answer_keys WHERE upper(btrim(correct_answer)) IN ('T','F') "
            "GROUP BY 1 ORDER BY 1")
check("CONTROL T and F survive where they are letters",
      sorted(left.splitlines()) == ["4,F", "4,T", "5,F", "5,T"],
      left.replace("\n", " | "),
      "page 4 is matching type, page 5 is the short page left for a human")

psql(f"DROP DATABASE IF EXISTS {DB}", db="postgres")
print("\n" + "=" * 74)
print(f"{OK} passed, {FAIL} failed")
print("=" * 74)
sys.exit(1 if FAIL else 0)