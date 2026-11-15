#!/usr/bin/env python3
"""
apply_2026-11-15_students_route_middle.py

THE MIDDLE NAME NEVER REACHED THE SERVICE FROM THE SINGLE-ROW ROUTES.

Measured on learnlens.tech, 2026-11-15:

    students.py:160  edit_student -> update_student(...)
    student_service.py:221  check_middle_name(middle_name, required=True)
    ValueError: Middle name is required.

with "Rodulfo" typed into a box whose schema field is a REQUIRED str. It
passed validation and then vanished, because routes/students.py names its
arguments one at a time and was never updated when the service and the schema
gained middle_name on 2026-11-14:

    create_student(db, uid, student_number=, last_name=, first_name=, section=)
    update_student(db, uid, id, student_number=, last_name=, first_name=, section=)
    StudentDetailResponse(student_id=, student_number=, last_name=,
                          first_name=, section=, created_at=, papers_count=)

THREE omissions, one file. This is the THIRD time this exact fault has
appeared in this project - routes/papers.py:105 records the first two, "the
two new fields were validated by PaperCreate and then dropped on the floor -
the same bug as the year_level route and the subject route, third occurrence."
This is the fourth.

WHAT IT MEANT IN PRACTICE
-------------------------
Every student added through the single-row "Add a student" form since
2026-11-14 was stored with middle_name NULL, silently. The roster showed a
middle name only for students added through the PASTE modal, because
bulk_create builds the row itself and does pass it.

Nothing is corrupted - the column is nullable and the names are simply
absent. Check which rows are affected with:

    SELECT student_id, student_number, first_name, middle_name
    FROM students WHERE middle_name IS NULL;

WHY THE 500 AND NOT A 422
-------------------------
The schema's validators are reported by FastAPI as 422 naming the field. The
SERVICE's checks raise ValueError, which no handler catches, so they surface
as "Request failed" with no detail. Those checks were unreachable until
required=True made one of them reachable. After this patch they are
unreachable again - every field the service re-checks has already been
validated by StudentCreate / StudentUpdate - but that is a property worth
knowing rather than relying on, and it is recorded here rather than fixed,
because catching ValueError in the route needs to sit AFTER the
DuplicateStudent handler and that ordering depends on what DuplicateStudent
subclasses.

Usage:
    cd backend
    python ../apply_2026-11-15_students_route_middle.py --dry-run app
    python ../apply_2026-11-15_students_route_middle.py           app
"""
import os
import sys

INSERT_BEFORE = "\x00"
def norm(s):
    return " ".join(s.split())


def find_line(lines, markers):
    start, rest = 0, []
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
    # newline="" so a CRLF file is not silently rewritten to LF - the bug
    # found in every 2026-11-14 patcher.
    src = open(path, encoding="utf-8", newline="").read()
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
                       f"{(label or markers)[0][:62]}")
        else:
            plan.append((i, new))
    if bad:
        return "refused", f"{path}\n" + "\n".join(bad)

    for i, new in sorted(plan, reverse=True):
        indent = lines[i][:len(lines[i]) - len(lines[i].lstrip())]
        insert = new.startswith(INSERT_BEFORE)
        body = new[len(INSERT_BEFORE):] if insert else new
        block = "\n".join((indent + l) if l.strip() else l for l in body.split("\n"))
        lines.insert(i, block) if insert else lines.__setitem__(i, block)

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


STAMP = "2026-11-15"


ROUTES = [
    # Both calls name their arguments one at a time, so the fix is one line
    # each. Scoped, because `first_name=data.first_name,` appears in both.
    (["scope:async def add_student(", "first_name=data.first_name,"],
     '''first_name=data.first_name,
# NEW 2026-11-15. Without this the single-row form stored NULL, silently -
# create_student's middle_name parameter simply defaulted.
middle_name=data.middle_name,'''),

    (["scope:async def edit_student(", "first_name=data.first_name,"],
     '''first_name=data.first_name,
# NEW 2026-11-15. This is the line whose absence produced
# "ValueError: Middle name is required." on a form that had one typed in.
middle_name=data.middle_name,'''),

    # The response model declares middle_name, so it was being serialised as
    # None on every call rather than failing - the quieter half of the fault.
    (["scope:async def get_student(", "first_name=student.first_name,"],
     '''first_name=student.first_name,
middle_name=student.middle_name,'''),
]

TARGETS = [
    ("api/routes/students.py", ROUTES, "middle_name=data.middle_name"),
]


if __name__ == "__main__":
    sys.exit(run(TARGETS, STAMP, sys.argv[1:], __doc__))
