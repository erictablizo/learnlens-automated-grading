#!/usr/bin/env python3
"""
apply_2026-11-14_middle_name.py

Patches FIVE backend files, and refuses unless ALL FIVE match:

    backend/app/schemas/_text.py                 check_middle_name, middle_initial,
                                                 compose_student_name gains a 3rd part
    backend/app/schemas/student.py               middle_name on create / response / bulk
    backend/app/services/student_service.py      stored, searched, bulk-imported
    backend/app/services/paper_service.py        created, renamed, AND compared
    backend/app/services/batch_paper_service.py  copied from the roster

    Alex Passion / Julius Bancud, Recommendations page 1, the class list:
      "Student Number, / Student Last Name, / Student First Name,
       / Student Middle Name"

RUN THE MIGRATION FIRST: migrations/2026-11-14_middle_name.sql. It is additive
and nullable, so it is safe to run before this; the reverse is not - these
files write a column that would not yet exist.

THE ONE CHANGE THAT IS NOT JUST "ANOTHER FIELD"
------------------------------------------------
`find_paper_by_name` now compares the middle name too. DuplicatePaper has told
the teacher since 2026-11-09:

    "If this is a different student with the same name, add a middle initial
     to tell them apart."

That advice was impossible to follow: the function compared last+first only,
so adding a middle initial changed nothing and the second student was still
refused. The message is true as of this change.

Both comparisons coalesce NULL to "", because every row predating today has
middle_name NULL and `NULL = \'\'` is NULL, never true - without it, no
existing paper would match and every one would look like a non-duplicate.

Usage:
    python apply_2026-11-14_middle_name.py --dry-run app
    python apply_2026-11-14_middle_name.py           app

The argument is the `app` directory. Exit 0 = patched, or already patched.
Exit 1 = refused, nothing written.
"""
import sys

import os

INSERT_BEFORE = "\x00"


def norm(s):
    return " ".join(s.split())


def find_line(lines, markers):
    """Index of the one line these markers address. -1 none, -2 ambiguous."""
    start = 0
    rest = []
    for m in markers:
        if m.startswith("scope:"):
            text = norm(m[len("scope:"):])
            hits = [i for i, ln in enumerate(lines) if text in norm(ln)]
            if len(hits) != 1:
                return -1 if not hits else -2
            start = hits[0]
        else:
            rest.append(m)

    def ok(ln):
        n = norm(ln)
        for m in rest:
            if m.startswith("^"):
                if n != norm(m[1:]):
                    return False
            elif norm(m) not in n:
                return False
        return True

    hits = [i for i in range(start, len(lines)) if ok(lines[i])]
    if not hits:
        return -1
    # Scoped searches take the first hit after the scope line, by definition.
    # Unscoped ones must be unique, or the edit is not addressing one place.
    if start == 0 and len(hits) > 1:
        return -2
    return hits[0]


def patch_file(path, edits, done_marker, stamp, dry):
    if not os.path.isfile(path):
        return "refused", f"no such file: {path}"
    src = open(path, encoding="utf-8").read()
    if norm(done_marker) in norm(src):
        return "already", f"already patched: {path}"
    crlf = "\r\n" in src
    lines = (src.replace("\r\n", "\n") if crlf else src).split("\n")

    plan, bad = [], []
    for markers, new in edits:
        i = find_line(lines, markers)
        if i < 0:
            label = [m for m in markers if not m.startswith("scope:")]
            bad.append(f"  {'not found' if i == -1 else 'matched more than once'}: "
                       f"{(label or markers)[0][:60]}")
        else:
            plan.append((i, new))
    if bad:
        return "refused", f"{path}\n" + "\n".join(bad)

    for i, new in sorted(plan, reverse=True):
        indent = lines[i][:len(lines[i]) - len(lines[i].lstrip())]
        insert = new.startswith(INSERT_BEFORE)
        body = new[len(INSERT_BEFORE):] if insert else new
        block = "\n".join((indent + l) if l.strip() else l
                          for l in body.split("\n"))
        if insert:
            lines.insert(i, block)
        else:
            lines[i] = block

    out = "\n".join(lines)
    if crlf:
        out = out.replace("\n", "\r\n")
    if dry:
        return "dry", f"{path}: all {len(edits)} anchors matched"
    bak = f"{path}.bak-{stamp}"
    if not os.path.exists(bak):
        open(bak, "w", encoding="utf-8", newline="").write(src)
    open(path, "w", encoding="utf-8", newline="").write(out)
    return "patched", f"{path}  ({len(src)} -> {len(out)} bytes), backup {bak}"


def run(targets, stamp, argv, doc):
    args = [a for a in argv if not a.startswith("--")]
    dry = "--dry-run" in argv
    if len(args) != 1:
        print(doc)
        return 1
    root = args[0]
    jobs = [(os.path.join(root, rel), e, d) for rel, e, d in targets]
    results = [patch_file(p, e, d, stamp, dry=True) for p, e, d in jobs]
    if any(s == "refused" for s, _ in results):
        print("REFUSED - NOTHING WRITTEN. These did not match:\n")
        for s, m in results:
            if s == "refused":
                print(m)
        print("\nSend me the file(s) above and the anchors will be re-aimed.")
        return 1
    if all(s == "already" for s, _ in results):
        print("Already patched - nothing to do.")
        return 0
    if dry:
        for s, m in results:
            print(f"DRY RUN  {m}")
        print("\nNothing written.")
        return 0
    for p, e, d in jobs:
        s, m = patch_file(p, e, d, stamp, dry=False)
        print(f"{s.upper():9} {m}")
    return 0


STAMP = "2026-11-14"

TEXT_ADDITIONS = '''# ── NEW 2026-11-14 (Alex Passion / Julius Bancud, Recommendations page 1) ────
# "Student Middle Name" on the class list, shown on the screens as Middle
# Initial.
#
# IT REUSES _NAME_PART_MARKS, not a fourth set. A middle name IS a name part -
# "Reyes", "R.", "Dela Cruz" - and every argument recorded above for that set
# applies unchanged: letters, space, period, apostrophe, hyphen; no digits, no
# comma, no parentheses.
#
# TWO THINGS DIFFER FROM check_name_part, and both are deliberate:
#
#   1. IT IS OPTIONAL. Blank is not an error, it is "not stated" - and it
#      returns None rather than "", so a student with no middle name and a
#      student with an empty one cannot both exist in the column. The same
#      distinction _section() keeps in schemas/student.py.
#
#   2. THE CAP IS 100, not 255, because students.middle_name and
#      test_papers.middle_name are varchar(100). A limit the API states as a
#      sentence beats one PostgreSQL refuses as a driver error.
MAX_MIDDLE_NAME_LENGTH = 100


def check_middle_name(v: Optional[str]) -> Optional[str]:
    """The middle name, or None. Blank is NOT an error."""
    v = tidy_text(v)
    if not v:
        return None
    if len(v) > MAX_MIDDLE_NAME_LENGTH:
        raise ValueError(
            f"Middle name must be at most {MAX_MIDDLE_NAME_LENGTH} characters.")
    if not any(c.isalpha() for c in v):
        raise ValueError("Middle name must contain at least one letter.")
    bad = _name_part_bad(v)
    if bad:
        tail = NAME_PART_COMMA_HINT if "," in bad else NAME_PART_SENTENCE
        raise ValueError(f"Middle name cannot contain {_shown(bad)}. {tail}")
    return v


def middle_initial(v: Optional[str]) -> str:
    """How a middle name is WRITTEN inside a composed name: "R." or "Reyes".

    A SINGLE LETTER gains a period, because that is how a teacher writes an
    initial and because _STRICT_MARKS already allows the period in
    student_name for exactly this case - "Midterm - Alcantara, Ben R." is in
    the comment at the top of this file.

    Anything longer, and anything already ending in a period, is left exactly
    as typed. This function ADDS punctuation; it never rewrites a name.
    "Dela Cruz" stays "Dela Cruz".

    Matches middleInitial() in frontend/src/lib/textField.ts.
    """
    s = tidy_text(v)
    if not s:
        return ""
    return f"{s}." if len(s) == 1 and s.isalpha() else s


def compose_student_name(last_name: Optional[str], first_name: Optional[str],
                         middle_name: Optional[str] = None) -> str:'''

TEXT_COMPOSE_BODY = '''# CHANGED 2026-11-14: a THIRD, OPTIONAL part, appended after the given
# name - "Alcantara, Ben R."
#
# The parameter has a default, so every existing two-argument call site keeps
# working AND keeps producing exactly the string it produced before. A paper
# or student with no middle name composes byte-for-byte as it did.
base = f"{tidy_text(last_name)}, {tidy_text(first_name)}"
mid = middle_initial(middle_name)
return f"{base} {mid}" if mid else base'''

TEXT = [
    (["def compose_student_name("], TEXT_ADDITIONS),
    (['return f"{tidy_text(last_name)}, {tidy_text(first_name)}"'], TEXT_COMPOSE_BODY),
]

SCHEMA_STUDENT = [
    (["from app.schemas._text import check_name_part"],
     "from app.schemas._text import check_name_part, check_middle_name"),

    (["def _section(v: Optional[str]) -> Optional[str]:"],
     "\x00" + '''def _middle(v: Optional[str]) -> Optional[str]:
    """NEW 2026-11-14. OPTIONAL - blank becomes None, not "".

    Shown on the screens as "Middle Initial" but stored as a name, so a
    teacher who types "Reyes" is not refused. See check_middle_name().
    """
    return check_middle_name(v)


'''),

    (["scope:class StudentCreate(BaseModel):", "^first_name: str"],
     '''first_name: str
# NEW 2026-11-14. Optional, and LAST of the name parts so an existing caller
# that sends only the three required fields is unaffected.
middle_name: Optional[str] = None'''),

    # INSERTED ABOVE the section validator rather than below the first_name
    # one. Below would mean writing a decorator at a SMALLER indent than the
    # matched `return _first(v)` line, and the engine only ever indents
    # further in, never out.
    (["scope:class StudentCreate(BaseModel):", '@field_validator("section")'],
     "\x00" + '''@field_validator("middle_name")
@classmethod
def _m(cls, v: Optional[str]) -> Optional[str]:
    return _middle(v)

'''),

    (["scope:class StudentResponse(BaseModel):", "^first_name: str"],
     '''first_name: str
middle_name: Optional[str] = None'''),

    (["scope:class StudentBulkRow(BaseModel):", '^first_name: str = ""'],
     '''first_name: str = ""
middle_name: Optional[str] = None'''),
]

STUDENT_SERVICE = [
    (["from app.schemas._text import check_name_part"],
     "from app.schemas._text import check_name_part, check_middle_name"),

    (["scope:async def create_student(", "^section: Optional[str] = None,"],
     '''middle_name: Optional[str] = None,
section: Optional[str] = None,'''),
    (["scope:async def create_student(", 'first = check_name_part(first_name, "First name")'],
     '''first = check_name_part(first_name, "First name")
# NEW 2026-11-14. check_middle_name returns None for blank, so an empty box
# stores NULL rather than "" - see schemas/_text.py.
middle = check_middle_name(middle_name)'''),
    (["scope:async def create_student(", "last_name=last, first_name=first, section=sect,"],
     "last_name=last, first_name=first, middle_name=middle, section=sect,"),

    (["scope:async def update_student(", "^section: Optional[str] = None,"],
     '''middle_name: Optional[str] = None,
section: Optional[str] = None,'''),
    (["scope:async def update_student(", 'first = check_name_part(first_name, "First name")'],
     '''first = check_name_part(first_name, "First name")
middle = check_middle_name(middle_name)'''),
    (["scope:async def update_student(", "^student.first_name = first"],
     '''student.first_name = first
student.middle_name = middle'''),

    (["func.lower(Student.first_name).like(q)"],
     '''| func.lower(Student.first_name).like(q)
# NEW 2026-11-14 - coalesce, because middle_name is NULL on every row that
# predates today and `NULL LIKE '%x%'` is NULL, never false, which would drop
# every one of those students out of every search.
| func.lower(func.coalesce(Student.middle_name, "")).like(q)'''),

    (["scope:async def bulk_create(", 'first = check_name_part(str(raw.get("first_name", "")), "First name")'],
     '''first = check_name_part(str(raw.get("first_name", "")), "First name")
middle = check_middle_name(str(raw.get("middle_name", "") or ""))'''),
    (["scope:async def bulk_create(", "last_name=last, first_name=first, section=row_section,"],
     "last_name=last, first_name=first, middle_name=middle, section=row_section,"),
]

PAPER_SERVICE = [
    (["scope:async def find_paper_by_name(", "^first_name: str,"],
     '''first_name: str,
# NEW 2026-11-14 - and this is what makes DuplicatePaper's own advice true.
# Its message has said since 2026-11-09: "If this is a different student with
# the same name, add a middle initial to tell them apart." Until now this
# function compared only last+first, so adding one changed nothing and the
# second student was still refused. Now it is part of the comparison.
middle_name: Optional[str] = None,'''),
    (["^composed = compose_student_name(last_name, first_name)"],
     "composed = compose_student_name(last_name, first_name, middle_name)"),
    (["func.lower(TestPaper.first_name) == first_name.lower(),"],
     '''func.lower(TestPaper.first_name) == first_name.lower(),
# coalesce: middle_name is NULL on every row that predates today, and
# `NULL = ''` is NULL, never true - so without this no existing paper would
# ever match and every one of them would look like a non-duplicate.
func.lower(func.coalesce(TestPaper.middle_name, ""))
    == (middle_name or "").lower(),'''),

    (["scope:async def create_paper(", "^first_name: str,"],
     '''first_name: str,
middle_name: Optional[str] = None,'''),
    (["scope:async def create_paper(", "db, exam_id, last_name=last_name, first_name=first_name"],
     "db, exam_id, last_name=last_name, first_name=first_name,\nmiddle_name=middle_name,"),
    (["scope:async def create_paper(", "^first_name=first_name,"],
     '''first_name=first_name,
middle_name=middle_name,'''),
    (["scope:async def create_paper(", "student_name=compose_student_name(last_name, first_name),"],
     "student_name=compose_student_name(last_name, first_name, middle_name),"),

    (["scope:async def rename_paper(", "^first_name: str,"],
     '''first_name: str,
middle_name: Optional[str] = None,'''),
    (["scope:async def rename_paper(", "^first_name=first_name,"],
     '''first_name=first_name,
middle_name=middle_name,'''),
    (["scope:async def rename_paper(", "paper.first_name   = first_name"],
     '''paper.first_name   = first_name
paper.middle_name  = middle_name'''),
    (["scope:async def rename_paper(", "paper.student_name = compose_student_name(last_name, first_name)"],
     "paper.student_name = compose_student_name(last_name, first_name, middle_name)"),
]

BATCH_PAPER_SERVICE = [
    (["^first_name=student.first_name,"],
     '''first_name=student.first_name,
middle_name=student.middle_name,'''),
    (["student_name=compose_student_name(student.last_name, student.first_name),"],
     "student_name=compose_student_name(\nstudent.last_name, student.first_name, student.middle_name),"),
]

TARGETS = [
    ("schemas/_text.py",                TEXT,                    "check_middle_name"),
    ("schemas/student.py",              SCHEMA_STUDENT,          "check_middle_name"),
    ("services/student_service.py",     STUDENT_SERVICE,         "check_middle_name"),
    ("services/paper_service.py",       PAPER_SERVICE,           "middle_name"),
    ("services/batch_paper_service.py", BATCH_PAPER_SERVICE,     "middle_name"),
]


if __name__ == "__main__":
    sys.exit(run(TARGETS, STAMP, sys.argv[1:], __doc__))
