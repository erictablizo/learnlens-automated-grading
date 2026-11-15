#!/usr/bin/env python3
"""
apply_2026-11-15_service_valueerror_422.py

A SERVICE RULE THAT CAN ONLY BE REPORTED AS "Request failed" IS WORSE THAN NO
RULE.

student_service.create_student / update_student re-check every field with
check_number, check_name_part and check_middle_name. Those raise plain
ValueError. routes/students.py catches DuplicateStudent and nothing else, so
a ValueError escapes as an unhandled 500 - "Request failed", no detail, no
field named.

MEASURED 2026-11-15 on learnlens.tech, before the route was passing
middle_name at all:

    ValueError: Middle name is required.   ->   500, "Request failed"

while the IDENTICAL rule in StudentCreate came back as a 422 naming the
field. One rule, two completely different experiences, decided by which layer
happened to run first.

Those checks are unreachable again now that the route passes every field - the
schema validates all of them first - but "unreachable" is a property of today's
code, not a guarantee, and it is exactly the kind of property that stops being
true when someone adds a field.

ORDERING IS SAFE, AND THIS WAS CHECKED RATHER THAN ASSUMED:

    class DuplicateStudent(Exception):

NOT a ValueError subclass, so the two handlers are disjoint and `except
ValueError` cannot swallow a duplicate-number 409. If it ever becomes a
ValueError subclass, move its handler above this one.

Usage:
    cd backend
    python ../apply_2026-11-15_service_valueerror_422.py --dry-run app
    python ../apply_2026-11-15_service_valueerror_422.py           app
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


HANDLER = INSERT_BEFORE + '''except ValueError as e:
    # NEW 2026-11-15. The service re-checks every field and raises plain
    # ValueError; without this they arrive as an unhandled 500 with no
    # detail, while the SAME rule in the schema answers 422 and names the
    # field. 422 is right: the request is well-formed, a value is not.
    #
    # DuplicateStudent is NOT a ValueError subclass - checked, not assumed -
    # so this cannot swallow the 409 below.
    raise HTTPException(status_code=422, detail=str(e))'''

ROUTES = [
    (["scope:async def add_student(", "except student_service.DuplicateStudent as dup:"],
     HANDLER),
    (["scope:async def edit_student(", "except student_service.DuplicateStudent as dup:"],
     HANDLER),
]

TARGETS = [
    ("api/routes/students.py", ROUTES, "except ValueError as e:"),
]


if __name__ == "__main__":
    sys.exit(run(TARGETS, STAMP, sys.argv[1:], __doc__))
