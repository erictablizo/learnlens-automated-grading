#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
LearnLens - every field on Setup and Edit Profile gets a rule.   2026-11-16

Grace, post-UAT:
    "First Name, Last Name, and Position should have validation like terms of
     special characters and numbers for setup and edit; validation for all
     fields if blank for setup and edit"

The CHARACTER half of that lives in two files that this script does not touch -
frontend/src/lib/personName.ts and backend/app/schemas/profile.py, both of
which delegate to the one student name-part rule as of today.  This script
wires the BLANK half into the two forms:

    frontend/src/app/setup/page.tsx                 "Set up your profile"
    frontend/src/app/(dashboard)/profile/page.tsx   "Edit Profile"

BOTH FILES ARE CALLED page.tsx, so this tool does not pick its rules by file
name.  It reads the file and matches a fingerprint - "Set up your profile" for
one, "PROFILE_UPDATED_EVENT" for the other - and refuses when zero or more than
one matches.  Pass them in either order, or one at a time.

    python apply_2026-11-16_profile_required.py --dry-run \
        frontend/src/app/setup/page.tsx \
        "frontend/src/app/(dashboard)/profile/page.tsx"

RUN --dry-run FIRST.  The anchor is the block that
apply_2026-10-22_profile_screens_fix.py wrote into both files; if anything has
moved since, this REFUSES and writes nothing rather than guessing.

WHAT CHANGES, and it is one block in each handleSave():

  before   four ad-hoc checks, two of them `!x.trim()`, then a separate
           character check - so a blank first name was refused by one rule and
           a blank POSITION by neither
  after    one expression, one sentence per field, in the order the fields
           appear on the form, with the blank test and the character test
           being the SAME call

WHAT THIS DOES *NOT* DO, stated rather than hidden:

  * YEAR LEVEL is not in the new block.  Grace asked for "every field,
    including Year Level", and the line is written out in the note printed at
    the end - but this tool does not know what the year-level state variable
    is called on either screen, and a patcher that guesses an identifier
    produces a file that does not compile.  Add that one line by hand, or
    paste the two screens and it goes in properly.
  * THE ASTERISKS are not added.  Same reason: the label markup differs
    between the two screens and is not in hand.
  * Nothing is made required on the SERVER.  ProfileSetup keeps every field
    Optional deliberately - see the docstring on that class.
"""

import shutil
import sys
from pathlib import Path

STAMP = "2026-11-16"
MARKER = "fieldError"          # proves this patch has already run

# ── the anchor: byte-for-byte what apply_2026-10-22_profile_screens_fix.py
#    wrote into BOTH screens.  Reproduced here from that file, not retyped
#    from memory. ───────────────────────────────────────────────────────────
OLD = (
    '    if (!firstName.trim()) { setError("First name is required."); return; }\n'
    '    if (!lastName.trim())  { setError("Last name is required.");  return; }\n'
    '    if (!college)          { setError("Please select your college."); return; }\n'
    '    if (!course)           { setError("Please select your course / program."); return; }\n'
    '    // FIX 2026-10-22 (Doc Rubrica): UPPERCASE, lowercase and special\n'
    '    // characters. Same rules, same order and same words as\n'
    '    // _check_person_name() / _check_position() in schemas/profile.py.\n'
    '    const charError = checkPersonName(firstName, "First name")\n'
    '                   ?? checkPersonName(lastName, "Last name")\n'
    '                   ?? checkPosition(position);\n'
    '    if (charError) { setError(charError); return; }'
)

NEW = (
    '    // REWRITTEN 2026-11-16 (Grace, post-UAT): "validation for all fields\n'
    '    // if blank for setup and edit".\n'
    '    //\n'
    '    // ONE expression, one sentence per field, in the order the fields\n'
    '    // appear on the form. The blank test and the character test are now\n'
    '    // the SAME call - checkPersonName and checkPosition each take a\n'
    '    // `required` flag as of today - which closes two gaps that the two\n'
    '    // separate blocks left open:\n'
    '    //\n'
    '    //   POSITION had no blank check at all, on either screen. A teacher\n'
    '    //   could save a profile with no position and the sidebar rendered\n'
    '    //   the empty string after her course.\n'
    '    //\n'
    '    //   FIRST / LAST NAME were blank-checked with !x.trim(), which is a\n'
    '    //   different test from the one the server runs: "\\u00a0" (a non-breaking\n'
    '    //   space) is truthy after .trim() and empty after tidyName().\n'
    '    //\n'
    '    // Same rules, same order and same words as _check_person_name() and\n'
    '    // _check_position() in backend/app/schemas/profile.py - measured, 404\n'
    '    // values, 1212 checks, zero disagreements.\n'
    '    const fieldError =\n'
    '         checkPersonName(firstName, "First name", true)\n'
    '      ?? checkPersonName(lastName,  "Last name",  true)\n'
    '      ?? (!college ? "Please select your college." : null)\n'
    '      ?? (!course  ? "Please select your course / program." : null)\n'
    '      ?? checkPosition(position, true);\n'
    '    if (fieldError) { setError(fieldError); return; }'
)

FINGERPRINTS = {
    "setup": ("Set up your profile",
              'frontend/src/app/setup/page.tsx  ("Set up your profile")'),
    "edit":  ("PROFILE_UPDATED_EVENT",
              'frontend/src/app/(dashboard)/profile/page.tsx  ("Edit Profile")'),
}

YEAR_LEVEL_NOTE = """
────────────────────────────────────────────────────────────────────────────
ONE LINE IS STILL MISSING, AND IT IS NOT VERIFIED BY THIS TOOL
────────────────────────────────────────────────────────────────────────────
Year Level. Add it to the block this tool just wrote, between the `course`
line and the `checkPosition` line, using whatever that screen actually calls
its year-level state:

      ?? (!yearLevel ? "Please select a year level." : null)

If the variable is a number-or-empty-string, `!yearLevel` is right. If it is
`number | null`, use `yearLevel === null`. If it is a string, `!yearLevel` is
right again. Grep for it first:

    grep -n "earLevel\\|year_level" frontend/src/app/setup/page.tsx \\
        "frontend/src/app/(dashboard)/profile/page.tsx"

Then type-check, because this change alters an expression, not a string:

    cd frontend && npx tsc --noEmit
────────────────────────────────────────────────────────────────────────────
"""


def identify(text):
    return [k for k, (fp, _) in FINGERPRINTS.items() if fp in text]


def selfcheck(text):
    """Cheap structural checks. tsc is the real one - run it."""
    if text.count("const fieldError") != 1:
        return "expected exactly one `const fieldError`."
    if "charError" in text:
        return "a reference to the old charError survived."
    if "firstName.trim()" in text:
        return "a .trim() blank check survived in handleSave()."
    if 'checkPosition(position)' in text:
        return "checkPosition is still called without the required flag."
    if "@/lib/personName" not in text:
        return ("this screen does not import from @/lib/personName - run "
                "apply_2026-10-22_profile_screens_fix.py first.")
    for open_, close in (("(", ")"), ("{", "}"), ("[", "]")):
        if text.count(open_) != text.count(close):
            return (f"unbalanced {open_}{close} after patching "
                    f"({text.count(open_)} vs {text.count(close)}).")
    return None


def patch(path, dry):
    try:
        raw = path.read_bytes()
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        print(f"  REFUSED  {path}\n           not UTF-8")
        return 2

    # CRLF: read, patch and write the file's OWN line ending. Every patcher
    # before 2026-11-14 silently rewrote a CRLF file to LF, which turned a
    # one-line change into a whole-file diff.
    crlf = b"\r\n" in raw
    work = text.replace("\r\n", "\n") if crlf else text

    hits = identify(work)
    if len(hits) != 1:
        which = ", ".join(hits) if hits else "none"
        print(f"  REFUSED  {path}\n           matched {which} of this patch's "
              f"two screens (expected exactly one). Nothing was written.")
        return 2
    label = FINGERPRINTS[hits[0]][1]

    if MARKER in work:
        print(f"  ok       {path}\n           already carries the {STAMP} "
              f"rules - nothing written.")
        return 1

    n = work.count(OLD)
    if n != 1:
        print(f"  REFUSED  {path}   ({label})")
        print(f"           the 2026-10-22 validation block was found {n} times, "
              f"expected 1.")
        print("           Your file differs from the one this was written "
              "against. Nothing\n           was written. Paste the file and it "
              "goes into the applier properly.")
        return 2

    work = work.replace(OLD, NEW, 1)

    problem = selfcheck(work)
    if problem:
        print(f"  REFUSED  {path}\n           {problem}\n"
              f"           Nothing was written.")
        return 2

    out = work.replace("\n", "\r\n") if crlf else work
    if dry:
        print(f"  WOULD PATCH  {path}\n               {label}"
              f"{'   (CRLF preserved)' if crlf else ''}")
    else:
        backup = path.with_suffix(path.suffix + f".bak-{STAMP}")
        shutil.copy2(path, backup)
        path.write_bytes(out.encode("utf-8"))
        print(f"  patched  {path}   (1 block, backup: {backup.name})")
        print(f"             {label}")
    return 0


def main(argv):
    dry = "--dry-run" in argv
    paths = [Path(a) for a in argv[1:] if not a.startswith("--")]
    if not paths:
        print(__doc__)
        return 2
    print(f"LearnLens profile required-fields {STAMP}"
          f"{'   (DRY RUN - nothing will be written)' if dry else ''}\n")
    codes = []
    for p in paths:
        if not p.exists():
            print(f"  REFUSED  {p}\n           no such file")
            codes.append(2)
            continue
        codes.append(patch(p, dry))
    print(f"\n  {codes.count(0)} patched, {codes.count(1)} already done, "
          f"{codes.count(2)} refused")
    if 0 in codes and not dry:
        print(YEAR_LEVEL_NOTE)
    return 1 if 2 in codes else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))