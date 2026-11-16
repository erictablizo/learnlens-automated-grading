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

    frontend/src/app/(auth)/setup/page.tsx          "Set up your profile"
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

import re
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

# ── ADDED 2026-11-16, after the dry run on the real Edit Profile screen ────
#
# MEASURED on Grace's file:
#     141:    if (!firstName.trim()) { setError("First name is required."); return; }
#     169:        first_name: firstName.trim(),
#
# So that screen carries the 2026-10-22 CHARACTER block (or the anchor above
# would not have matched) but NOT that patch's PAYLOAD fix. Whatever the
# history, apply_2026-10-22_profile_screens_fix.py cannot repair it: that tool
# exits early when "@/lib/personName" is already in the file, which it is. It
# would print "already done" and change nothing.
#
# WHY IT MATTERS, and it is small but real. The browser validates the TIDIED
# value and then posts the TRIMMED one, so "Eric  Bernard" is shown as
# acceptable, posted with two spaces, and stored by the server as
# "Eric Bernard" - a silent difference between what the teacher typed, what she
# was told was fine, and what the sidebar then shows her on every screen.
#
# THESE THREE ARE OPTIONAL. A screen that already had the 2026-10-22 payload
# fix applied has none of them, and that is a clean pass, not a problem. What
# is NOT optional is the selfcheck below: if a .trim() is still feeding the
# payload after this runs, the file is refused.
#
# REGEX, not an exact string, for the alignment only - `last_name:  ` carries
# two spaces in one file and one in another. The captured whitespace is put
# back unchanged; nothing else in the line is allowed to differ.
PAYLOAD_EDITS = [
    ("first_name", re.compile(r"(first_name:\s*)firstName\.trim\(\),"),
     r"\1tidyName(firstName),"),
    ("last_name", re.compile(r"(last_name:\s*)lastName\.trim\(\),"),
     r"\1tidyName(lastName),"),
    ("position", re.compile(r"(position:\s*)position\.trim\(\)"),
     r"\1tidyName(position)"),
]


# The import, as both screens carry it after 2026-10-22 - the names in braces
# and the module on the NEXT line:
#
#     import { checkPersonName, checkPosition, tidyName }
#       from "@/lib/personName";
#
# This is tested against the text as READ, never against the patched text.
# FOUND BY THE AUDIT 2026-11-16: the first version of this guard asked whether
# "tidyName" appeared in the patched text - which it always does, because the
# comment this patch inserts says "empty after tidyName()". The guard was
# reading my own comment, so it could not fail, and it let a fixture WITHOUT
# the import through to a file that calls tidyName() and does not compile.
# Exactly the shape this project keeps finding: a check that passes because it
# is measuring the wrong text.
PERSONNAME_IMPORT = re.compile(
    r"import\s*\{([^}]*)\}\s*from\s*[\"']@/lib/personName[\"']")


def imports_tidyname(original: str) -> bool:
    m = PERSONNAME_IMPORT.search(original)
    return bool(m) and "tidyName" in m.group(1)


FINGERPRINTS = {
    "setup": ("Set up your profile",
              'the Setup screen  ("Set up your profile")'),
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

    grep -rn "earLevel\\|year_level" frontend/src/app

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
    # NARROWED 2026-11-16, same day, after a FALSE REFUSAL on the real Edit
    # Profile screen. This used to test for `firstName.trim()` ANYWHERE in the
    # file, which refused a file whose handleSave() was patched perfectly
    # because something else on the screen - an initials preview, a
    # has-it-changed comparison - legitimately calls .trim() too. The two
    # things that really must be gone are the blank check this patch replaces
    # and the save payload the 2026-10-22 patch replaced. Nothing else.
    if "if (!firstName.trim())" in text:
        return "the old `if (!firstName.trim())` blank check survived."
    for field, call in (("first_name", "firstName.trim()"),
                        ("last_name", "lastName.trim()"),
                        ("position", "position.trim()")):
        if re.search(rf"{field}:\s*{re.escape(call)}", text):
            return f"the save payload still sends {call}."
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

    # Computed BEFORE the replacement, from the text as read.
    tidy_ok = imports_tidyname(work)

    work = work.replace(OLD, NEW, 1)
    done = ["the handleSave() validation block"]

    for name, rx, repl in PAYLOAD_EDITS:
        hits = len(rx.findall(work))
        if hits > 1:
            print(f"  REFUSED  {path}\n           the {name} payload line occurs "
                  f"{hits} times, expected 0 or 1.\n           Nothing was written.")
            return 2
        if hits == 1:
            if not tidy_ok:
                print(f"  REFUSED  {path}")
                print(f"           the {name} payload needs tidyName(), which this "
                      f"screen does not import.")
                print('           Add it to the import from "@/lib/personName" and '
                      "run this again.")
                print("           Nothing was written.")
                return 2
            work = rx.sub(repl, work, count=1)
            done.append(f"{name}: .trim() -> tidyName()")

    problem = selfcheck(work)
    if problem:
        print(f"  REFUSED  {path}\n           {problem}\n"
              f"           Nothing was written.")
        return 2

    out = work.replace("\n", "\r\n") if crlf else work
    if dry:
        print(f"  WOULD PATCH  {path}\n               {label}"
              f"{'   (CRLF preserved)' if crlf else ''}")
        for d in done:
            print(f"                 - {d}")
    else:
        backup = path.with_suffix(path.suffix + f".bak-{STAMP}")
        shutil.copy2(path, backup)
        path.write_bytes(out.encode("utf-8"))
        print(f"  patched  {path}   ({len(done)} "
              f"edit{'' if len(done) == 1 else 's'}, backup: {backup.name})")
        print(f"             {label}")
        for d in done:
            print(f"               - {d}")
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