#!/usr/bin/env python3
"""
apply_2026-11-14_profile_db_colleges.py   (v2, re-anchored 2026-11-14)

Patches TWO files, and refuses unless BOTH match:

    backend/app/schemas/profile.py            EDIT 1, 2, 3
    backend/app/services/profile_service.py   EDIT 4, 5

This is the backend half of Part 2 of the reference-lists change. Part 1 made
the three dropdown lists data; this makes the profile save honour them.

WHY v2 EXISTS - TWO DEFECTS IN v1, BOTH FOUND BY RUNNING IT ON THE REAL FILE
-----------------------------------------------------------------------------
1. v1 anchored EDIT 5 on an exact three-line block containing an EMPTY line.
   The real file's "blank" lines inside update_profile() are a SINGLE SPACE,
   so the match failed and the script refused. Refusing over invisible
   whitespace is a bad failure: it teaches you to hand-apply, which is the
   2026-11-11 page.tsx mistake.

   v2 matches MARKER substrings with every run of whitespace collapsed, the
   way apply_2026-11-14_screens_use_lists.py does. Nothing a compiler cares
   about survives that normalisation.

2. v1's EDIT 5 anchor contained `profile = await get_or_create_profile(db,
   user_id)` - which appears TWICE in the real file, in update_profile() and
   again in upload_avatar(). It could never have matched uniquely, and had the
   whitespace been right it might have matched the WRONG ONE, putting the
   validation inside the avatar upload. v2 anchors on `if first_name is not
   None`, which occurs exactly once, and inserts before it.

   That placement is also correct on its own terms: it sits after
   get_or_create_profile() - which only ensures a row exists, as every GET of
   the profile already does - and BEFORE the first field is written. A 422
   therefore leaves every stored field exactly as it was.

WHAT IT CHANGES
---------------
EDIT 1  `ProfileSetup.college` stops being `CollegeEnum`. The enum lists the
        four colleges that existed in September; a college an administrator
        adds today would be refused with a 422 before any new code ran.
EDIT 2  A shape validator on that field - trimmed, blank to None, capped at
        20, which is what `user_profiles.college` is declared as.
EDIT 3  `CollegeEnum` is KEPT but marked. Deleting it would break anything
        else that imports it, and this script cannot know what does.
EDIT 4  `profile_service` imports `reference_service`.
EDIT 5  `update_profile()` calls `validate_selection()` before writing.
        THIS IS WHERE THE DROPPED DATABASE CHECK CONSTRAINT WENT. The
        2026-11-14 migration removed `user_profiles_college_check`, because a
        CHECK cannot reference another table. Skip this edit and profiles are
        LESS validated than they were yesterday.

ORDER MATTERS. Run the migration and install the five Part 1 backend files
first; EDIT 5 imports a module that does not otherwise exist.

Usage:
    python apply_2026-11-14_profile_db_colleges.py --dry-run app
    python apply_2026-11-14_profile_db_colleges.py           app

Exit 0 = patched, or already patched. Exit 1 = refused, nothing written.
"""
import os
import sys

STAMP = "2026-11-14"
INSERT_BEFORE = "\x00"


def _norm(s):
    """Collapse every run of whitespace to one space.

    Matching happens on this form. The real profile_service.py separates
    blocks with lines containing a single space rather than nothing at all,
    and v1 refused because of it."""
    return " ".join(s.split())


def _dedent(block):
    """Strip the indentation the replacement literal carries of its own, so
    the matched line's indent is not added on top of it and doubled."""
    lines = block.split("\n")
    rest = [l for l in lines[1:] if l.strip()]
    if not rest:
        return block
    pad = min(len(l) - len(l.lstrip()) for l in rest)
    return "\n".join([lines[0]] + [l[pad:] if l.strip() else l for l in lines[1:]])


def find_line(lines, markers):
    norm = [_norm(m) for m in markers]
    hits = [i for i, ln in enumerate(lines) if all(m in _norm(ln) for m in norm)]
    if len(hits) == 1:
        return hits[0]
    return -1 if not hits else -2


# ── schemas/profile.py ─────────────────────────────────────────────────────
SCHEMA = [
    (["college:", "Optional[CollegeEnum]"],
     '''# CHANGED 2026-11-14 - was Optional[CollegeEnum].
#
# The colleges are a TABLE now (migrations/2026-11-14_reference_lists.sql),
# maintained by an administrator on the Admin page. An enum frozen in
# September cannot express that: a college added this morning would be
# refused here, by pydantic, with a 422 - before any of the new code ran.
#
# The real check has not gone away, it has MOVED. update_profile() calls
# reference_service.validate_selection(), which asks the database whether this
# college exists and is active, and does the same for the course and the year
# level. That is strictly stronger than the enum: it also catches a course
# that is not listed under the chosen college, which the enum never looked at.
college:    Optional[str] = None'''),

    # ANCHORED ON THE NEXT DECORATOR, NOT ON THE RETURN ABOVE IT.
    #
    # v2's first attempt inserted after `return _check_year_level(v)`, which
    # sits at METHOD-BODY indent (8). Every inserted line inherited that, so
    # `@field_validator("college")` and `def _college` landed INSIDE `_year`
    # as a nested function. It parsed perfectly and pydantic never saw it -
    # the field went completely unvalidated, silently. ast.parse() cannot see
    # that; only running it could, and the 20-check bench caught it.
    #
    # `@field_validator("first_name")` is at CLASS-BODY indent (4), which is
    # where a validator belongs, and occurs exactly once.
    (["@field_validator(\"first_name\")"],
     INSERT_BEFORE + '''

# NEW 2026-11-14. Shape only - "is this a plausible code at all" - not
# membership, which needs the database and happens in update_profile().
#
# The cap is 20 because user_profiles.college is varchar(20). Without it a
# longer code reaches PostgreSQL and comes back as a driver error instead of a
# sentence a teacher can read. Blank becomes None, the same rule the three
# text fields follow, so "Skip for now" on /setup keeps working.
@field_validator("college")
@classmethod
def _college(cls, v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    s = " ".join(str(v).split())
    if not s:
        return None
    if len(s) > MAX_COLLEGE_CODE_LENGTH:
        raise ValueError(
            f"College code must be at most {MAX_COLLEGE_CODE_LENGTH} characters.")
    return s

'''),

    (["class CollegeEnum(str, Enum):"],
     INSERT_BEFORE + '''# NO LONGER THE GATE, as of 2026-11-14.
#
# The colleges live in the `colleges` table and are validated against it by
# reference_service.validate_selection(). This enum is KEPT only because other
# modules may still import the name, and removing it would break them at
# import time rather than visibly.
#
# DO NOT reintroduce it as a type on ProfileSetup.college: that re-freezes the
# list at these four values and silently breaks every college an administrator
# has added since. Check what still needs it with
#
#     grep -rn "CollegeEnum" backend/app
#
# and if the only hit is this file, delete the class.
#
# The cap below is user_profiles.college's own varchar(20).
MAX_COLLEGE_CODE_LENGTH = 20

'''),
]

# ── services/profile_service.py ────────────────────────────────────────────
SERVICE = [
    (["from app.models.profile import UserProfile"],
     '''from app.models.profile import UserProfile
# NEW 2026-11-14. Imported as a module rather than by name so the call site
# below reads `reference_service.validate_selection(...)` - at a glance, in a
# file about profiles, it is obvious the rule lives elsewhere.
from app.services import reference_service'''),

    (["if first_name is not None"],
     INSERT_BEFORE + '''# NEW 2026-11-14 - and this call is where a database constraint used to be.
#
# migrations/2026-11-14_reference_lists.sql DROPPED
# `user_profiles_college_check`, because a CHECK cannot reference another
# table and the colleges are a table now. So the column itself will accept any
# 20-character string. THIS LINE is what refuses one.
#
# Placed after get_or_create_profile() - which only ensures a row exists, as
# every GET of the profile already does - and BEFORE the first field is
# written, so a 422 leaves every stored value exactly as it was. Each field is
# checked only when it is being set, the same rule the assignments below
# follow: a PUT that omits a field leaves it alone (2026-11-03).
await reference_service.validate_selection(db, college, course, year_level)
'''),
]

TARGETS = [
    ("schemas/profile.py",       SCHEMA,  "MAX_COLLEGE_CODE_LENGTH"),
    ("services/profile_service.py", SERVICE, "reference_service.validate_selection"),
]


def patch(path, edits, done_marker, dry):
    if not os.path.isfile(path):
        return "refused", f"no such file: {path}"
    src = open(path, encoding="utf-8").read()
    if _norm(done_marker) in _norm(src):
        return "already", f"already patched: {path}"
    crlf = "\r\n" in src
    lines = (src.replace("\r\n", "\n") if crlf else src).split("\n")

    plan, bad = [], []
    for markers, new in edits:
        i = find_line(lines, markers)
        if i < 0:
            bad.append(f"  {'not found' if i == -1 else 'found more than once'}: "
                       f"{markers[0][:58]}")
        else:
            plan.append((i, new))
    if bad:
        return "refused", f"{path}\n" + "\n".join(bad)

    for i, new in sorted(plan, reverse=True):
        indent = lines[i][:len(lines[i]) - len(lines[i].lstrip())]
        insert = new.startswith(INSERT_BEFORE)
        body = new[len(INSERT_BEFORE):] if insert else new
        block = "\n".join((indent + l) if l.strip() else l
                          for l in _dedent(body).split("\n"))
        if insert:
            lines.insert(i, block)
        else:
            lines[i] = block

    out = "\n".join(lines)
    if crlf:
        out = out.replace("\n", "\r\n")
    if dry:
        return "dry", f"{path}: all {len(edits)} markers matched once"
    bak = f"{path}.bak-{STAMP}"
    if not os.path.exists(bak):
        open(bak, "w", encoding="utf-8", newline="").write(src)
    open(path, "w", encoding="utf-8", newline="").write(out)
    return "patched", f"{path}  ({len(src)} -> {len(out)} bytes), backup {bak}"


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv[1:]
    if len(args) != 1:
        print(__doc__)
        return 1
    app = args[0]
    jobs = [(os.path.join(app, rel), e, d) for rel, e, d in TARGETS]

    # BOTH FILES CHECKED BEFORE EITHER IS WRITTEN. Half of this change is worse
    # than none: the schema edit alone lets any string through with nothing
    # validating it, and the service edit alone calls a validator the enum has
    # already made unreachable.
    results = [patch(p, e, d, dry=True) for p, e, d in jobs]
    if any(s == "refused" for s, _ in results):
        print("REFUSED - NOTHING WRITTEN. These did not match:\n")
        for s, m in results:
            if s == "refused":
                print(m)
        print("\nSend me the file(s) above and the markers will be re-aimed.")
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
        s, m = patch(p, e, d, dry=False)
        print(f"{s.upper():8} {m}")
    print("\nNow rebuild the backend. If it fails to import "
          "app.services.reference_service, install the Part 1 files first.")
    return 0


if __name__ == "__main__":
    sys.exit(main())