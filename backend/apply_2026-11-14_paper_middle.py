#!/usr/bin/env python3
"""
apply_2026-11-14_paper_middle.py

Add Paper, and Edit Paper, take a middle name. TWO files, all or nothing:

    backend/app/schemas/paper.py        middle_name on PaperCreate AND PaperUpdate
    backend/app/api/routes/papers.py    both call sites pass it through

RUN apply_2026-11-14_middle_name.py FIRST. This file calls check_middle_name()
and paper_service.create_paper(middle_name=...), neither of which exists until
that patcher has run, and both of which need the column from
migrations/2026-11-14_middle_name.sql.

WHY PaperUpdate IS IN HERE AND NOT OPTIONAL
-------------------------------------------
apply_2026-11-14_middle_name.py gave rename_paper a `middle_name` parameter
defaulting to None and made it write

    paper.middle_name  = middle_name
    paper.student_name = compose_student_name(last_name, first_name, middle_name)

UNCONDITIONALLY. PaperUpdate carries no middle_name, so the PUT cannot send
one, so every rename since that patcher ran sets the column to NULL and strips
the initial back out of the composed name. Edit Paper currently ERASES the
middle name of any paper it touches. That is why this is one patch and not two.

THE DEPLOY ORDER, AND WHY IT IS MILDER THAN 2026-11-04
------------------------------------------------------
schemas/paper.py:65 records that making fields REQUIRED coupled the deploy -
the old payload 422'd on the missing keys. middle_name has a DEFAULT, so
neither direction errors:

    old frontend -> new backend    key absent, default None        works
    new frontend -> old backend    key ignored by pydantic         middle name dropped

Backend first is still right, because the second row loses data quietly.

Usage:
    cd backend
    python ../apply_2026-11-14_paper_middle.py --dry-run app
    python ../apply_2026-11-14_paper_middle.py           app

Exit 0 = patched, or already patched. Exit 1 = refused, nothing written.
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

# ── the field, written once and used on both models ──────────────────────────
FIELD = '''first_name: str
# NEW 2026-11-14 (Alex Passion / Julius Bancud, Recommendations page 1).
#
# OPTIONAL WITH A DEFAULT, which is what makes this unlike the 2026-11-04
# change recorded above. That one made two fields REQUIRED, so the old payload
# failed 422 and the frontend had to ship in the same deploy. This one cannot
# fail that way - an old payload that omits the key is valid, and a new payload
# sent to an old backend has the key ignored by pydantic. Backend still deploys
# first, but the cost of getting it wrong is a dropped middle name, not a
# broken screen.
middle_name: Optional[str] = None'''

# INSERTED ABOVE the first_name validator, not below it. Below would mean
# writing a decorator at a SMALLER indent than the matched `return ...` line,
# and the engine only ever indents further in, never out - the same limitation
# that moved the student.py validator on 2026-11-14.
#
# check_middle_name is called DIRECTLY rather than through a local
# _check_middle_name wrapper. The wrappers in this file exist because last and
# first take a LABEL argument that must be spelled the same here and in
# student.py; this one takes no label, so a wrapper would add a name and
# nothing else.
VALIDATOR = INSERT_BEFORE + '''@field_validator("middle_name")
@classmethod
def _middle(cls, v: Optional[str]) -> Optional[str]:
    return check_middle_name(v)

'''

SCHEMA_PAPER = [
    (["from app.schemas._text import check_name_part"],
     "from app.schemas._text import check_name_part, check_middle_name"),

    (["scope:class PaperCreate(BaseModel):", "^first_name: str"], FIELD),
    (["scope:class PaperCreate(BaseModel):", '@field_validator("first_name")'], VALIDATOR),

    # PaperUpdate: the rename. NOT optional in practice - see the module
    # docstring. Without this, Edit Paper nulls the column on every save.
    (["scope:class PaperUpdate(BaseModel):", "^first_name: str"], FIELD),
    (["scope:class PaperUpdate(BaseModel):", '@field_validator("first_name")'], VALIDATOR),
]

ROUTES_PAPERS = [
    (["scope:async def create_paper(exam_id: int, data: PaperCreate",
      "first_name=data.first_name,"],
     '''first_name=data.first_name,
# NEW 2026-11-14. create_paper has taken middle_name since
# apply_2026-11-14_middle_name.py; until this line it was never given one, so
# a paper typed in by name could not have a middle initial at all.
middle_name=data.middle_name,'''),

    (["scope:async def update_paper_name(", "first_name=data.first_name,"],
     '''first_name=data.first_name,
# NEW 2026-11-14 - AND THIS IS A FIX, not a feature. rename_paper writes
# paper.middle_name = middle_name unconditionally, so every rename since
# apply_2026-11-14_middle_name.py ran has been setting the column to NULL and
# recomposing student_name without the initial. Edit Paper was erasing it.
middle_name=data.middle_name,'''),
]

TARGETS = [
    ("schemas/paper.py",        SCHEMA_PAPER,  "check_middle_name"),
    ("api/routes/papers.py",    ROUTES_PAPERS, "middle_name=data.middle_name"),
]


if __name__ == "__main__":
    sys.exit(run(TARGETS, STAMP, sys.argv[1:], __doc__))
