#!/usr/bin/env python3
"""
apply_2026-11-14_profile_db_colleges.py

Patches TWO files, and it refuses unless BOTH match:

    backend/app/schemas/profile.py       EDIT 1, 2, 3
    backend/app/services/profile_service.py   EDIT 4, 5

This is PART 2 of the 2026-11-14 reference-lists change. Part 1 made the three
dropdown lists data and gave an administrator a screen to maintain them. This
is the half that makes the application actually honour them.

WHAT IT CHANGES, AND WHY EACH ONE IS LOAD-BEARING
--------------------------------------------------
EDIT 1  `ProfileSetup.college` stops being `CollegeEnum`.

        The enum lists the four colleges that existed in September. A college
        an administrator adds today would be refused by pydantic with a 422
        BEFORE any of the new code was reached - so without this edit, Part 1
        is a screen that adds colleges nobody can choose.

EDIT 2  A validator on that field: trimmed, and capped at 20 characters,
        which is what `user_profiles.college` is declared as. A longer code
        would otherwise be refused by PostgreSQL rather than by a sentence.

EDIT 3  `CollegeEnum` is KEPT but marked. Deleting it would break any other
        module that imports it, and this script cannot know what does. It is
        no longer the gate; the comment says so, in the file, where the next
        person to look will be.

EDIT 4  `profile_service` imports `reference_service`.

EDIT 5  `update_profile()` calls `validate_selection()` BEFORE it writes
        anything. This is where the dropped database CHECK constraint went.
        Without it the column accepts any 20-character string, because the
        2026-11-14 migration removed `user_profiles_college_check` - a CHECK
        cannot reference another table. THIS EDIT IS THE REPLACEMENT RULE. Skip
        it and profiles are less validated than they were yesterday.

ORDER MATTERS. Run the migration and install the five Part 1 backend files
FIRST; this patcher's EDIT 5 imports a module that does not otherwise exist,
and the backend will not start without it.

Usage:
    python apply_2026-11-14_profile_db_colleges.py --dry-run backend/app
    python apply_2026-11-14_profile_db_colleges.py           backend/app

The argument is the `app` directory; the two files are found beneath it.
Exit 0 = patched, or already patched. Exit 1 = refused, nothing written.
"""
import os
import sys

STAMP = "2026-11-14"

# ── schemas/profile.py ─────────────────────────────────────────────────────

S_A1 = """class ProfileSetup(BaseModel):
    first_name: Optional[str] = None
    last_name:  Optional[str] = None
    college:    Optional[CollegeEnum] = None"""
S_N1 = """class ProfileSetup(BaseModel):
    first_name: Optional[str] = None
    last_name:  Optional[str] = None
    # CHANGED 2026-11-14 - was Optional[CollegeEnum].
    #
    # The colleges are a TABLE now (migrations/2026-11-14_reference_lists.sql),
    # maintained by an administrator on the Admin page. An enum frozen in
    # September cannot express that: a college added this morning would be
    # refused here, by pydantic, with a 422 - before any of the new code ran.
    #
    # The real check has not gone away, it has MOVED. update_profile() calls
    # reference_service.validate_selection(), which asks the database whether
    # this college exists and is active, and does the same for the course and
    # the year level. That is a strictly stronger rule than the enum: it also
    # catches a course that is not listed under the chosen college, which the
    # enum never looked at.
    college:    Optional[str] = None"""

S_A2 = """    @field_validator("year_level")
    @classmethod
    def _year(cls, v: Optional[int]) -> Optional[int]:
        return _check_year_level(v)"""
S_N2 = """    @field_validator("year_level")
    @classmethod
    def _year(cls, v: Optional[int]) -> Optional[int]:
        return _check_year_level(v)

    # NEW 2026-11-14. Shape only - "is this a plausible code at all" - not
    # membership, which needs the database and happens in update_profile().
    #
    # The cap is 20 because user_profiles.college is varchar(20). Without it a
    # longer code reaches PostgreSQL and comes back as a driver error instead
    # of a sentence a teacher can read. Blank becomes None, the same rule the
    # three text fields follow, so "Skip for now" on /setup keeps working.
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
        return s"""

S_A3 = """class CollegeEnum(str, Enum):"""
S_N3 = """# NO LONGER THE GATE, as of 2026-11-14.
#
# The colleges live in the `colleges` table and are validated against it by
# reference_service.validate_selection(). This enum is KEPT only because other
# modules may still import the name, and removing it would break them at import
# time rather than visibly.
#
# DO NOT reintroduce it as a type on ProfileSetup.college: doing so re-freezes
# the list at these four values and silently breaks every college an
# administrator has added since. Check whether anything still needs it with
#
#     grep -rn "CollegeEnum" backend/app
#
# and if the only hit is this file, delete the class.
#
# The cap below is user_profiles.college's own varchar(20).
MAX_COLLEGE_CODE_LENGTH = 20


class CollegeEnum(str, Enum):"""

# ── services/profile_service.py ────────────────────────────────────────────

V_A4 = """from app.models.profile import UserProfile"""
V_N4 = """from app.models.profile import UserProfile
# NEW 2026-11-14. Imported as a module rather than by name so that the call
# site below reads `reference_service.validate_selection(...)` - at a glance,
# in a file about profiles, it is obvious the rule lives elsewhere.
from app.services import reference_service"""

V_A5 = """    profile = await get_or_create_profile(db, user_id)

    if first_name is not None: profile.first_name = first_name.strip() or None"""
V_N5 = """    # NEW 2026-11-14 - and this call is where a database constraint used to be.
    #
    # migrations/2026-11-14_reference_lists.sql DROPPED
    # `user_profiles_college_check`, because a CHECK cannot reference another
    # table and the colleges are a table now. So the column itself will accept
    # any 20-character string. THIS LINE is what refuses one.
    #
    # Before the write, not after: a 422 must leave the stored profile exactly
    # as it was. And each field is checked only when it is being set, which is
    # the same rule the assignments below follow - a PUT that omits a field
    # leaves it alone rather than blanking it (2026-11-03).
    await reference_service.validate_selection(db, college, course, year_level)

    profile = await get_or_create_profile(db, user_id)

    if first_name is not None: profile.first_name = first_name.strip() or None"""

SCHEMA_EDITS = [
    ("1  ProfileSetup.college is a str", S_A1, S_N1),
    ("2  college shape validator",       S_A2, S_N2),
    ("3  CollegeEnum marked, cap added", S_A3, S_N3),
]
SERVICE_EDITS = [
    ("4  reference_service import",      V_A4, V_N4),
    ("5  validate_selection() call",     V_A5, V_N5),
]

SCHEMA_DONE  = "MAX_COLLEGE_CODE_LENGTH"
SERVICE_DONE = "reference_service.validate_selection"


def patch(path, edits, done_marker, dry):
    """All anchors or none, per file. Returns (status, message)."""
    if not os.path.isfile(path):
        return "refused", f"no such file: {path}"
    src = open(path, encoding="utf-8").read()
    if done_marker in src:
        return "already", f"already patched: {path}"
    crlf = "\r\n" in src
    work = src.replace("\r\n", "\n") if crlf else src

    bad = [f"  EDIT {n}: found {work.count(o)} times, need exactly 1"
           for n, o, _ in edits if work.count(o) != 1]
    if bad:
        return "refused", f"{path}\n" + "\n".join(bad)

    for _n, o, w in edits:
        work = work.replace(o, w, 1)
    out = work.replace("\n", "\r\n") if crlf else work
    if dry:
        return "dry", f"{path}: all {len(edits)} anchors matched (+{len(out)-len(src)} bytes)"
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
    targets = [
        (os.path.join(app, "schemas", "profile.py"), SCHEMA_EDITS, SCHEMA_DONE),
        (os.path.join(app, "services", "profile_service.py"), SERVICE_EDITS, SERVICE_DONE),
    ]

    # BOTH FILES ARE CHECKED BEFORE EITHER IS WRITTEN. Half of this change is
    # worse than none of it: the schema edit alone lets any string through with
    # nothing validating it, and the service edit alone calls a validator the
    # enum has already made unreachable.
    results = [patch(p, e, d, dry=True) for p, e, d in targets]
    if any(s == "refused" for s, _ in results):
        print("REFUSED - NOTHING WRITTEN. These did not match:\n")
        for s, m in results:
            if s == "refused":
                print(m)
        print("\nYour files are not the ones this script was written against.")
        print("Send them and the edits will be re-anchored; do NOT hand-apply.")
        return 1
    if all(s == "already" for s, _ in results):
        print("Already patched - nothing to do.")
        return 0
    if dry:
        for s, m in results:
            print(f"DRY RUN  {m}")
        print("\nNothing written.")
        return 0
    for p, e, d in targets:
        s, m = patch(p, e, d, dry=False)
        print(f"{s.upper():8} {m}")
    print("\nNow restart the backend. If it fails to import app.services."
          "reference_service, install the Part 1 files first.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
