#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
LearnLens - the comma_hint flag, as a PATCH instead of a file.    2026-11-16

    python apply_2026-11-16_comma_hint.py --dry-run \
        frontend/src/lib/textField.ts

WHY THIS EXISTS, and it is an apology in executable form.

I delivered frontend/src/lib/textField.ts as a WHOLE FILE.  The copy I was
working from was missing four functions that the real one has -

    bySurname   paperLastName   paperFirstName   needsNameSplit

- so copying mine over yours deleted them, and analytics/page.tsx stopped
compiling with three TS2305 "has no exported member" errors.  A whole-file
delivery silently discards anything the copy does not know about.  The two
lines I actually needed to change are below; nothing else in the file is
touched.

RESTORE YOUR FILE FIRST:

    git checkout -- frontend/src/lib/textField.ts

then run this.  It refuses and writes nothing if the file is not the one it
was written against - including if it is still my short copy, which it names.

WHAT IT CHANGES - two edits, both in checkNamePart():

  1. a third parameter, `commaHint = true`, so every existing call site keeps
     the behaviour it has today
  2. the comma hint is used only when that flag is set

WHY.  schemas/profile.py and lib/personName.ts now borrow checkNamePart() for
the teacher's POSITION field, and on that field NAME_PART_COMMA_HINT - "enter
the surname and the first name in their own boxes" - describes two boxes the
Position field does not have.  MEASURED: "Head, Science Dept." earned exactly
that message.  The comma is still refused, with the general sentence.

Matches check_name_part(..., comma_hint=) in backend/app/schemas/_text.py.
"""

import re
import shutil
import sys
from pathlib import Path

STAMP = "2026-11-16"
MARKER = "commaHint"

OLD_SIG = 'export function checkNamePart(raw: string, label: string): string | null {'
NEW_SIG = (
    '/**\n'
    ' * `commaHint` is NEW 2026-11-16, defaulting to the old behaviour so every\n'
    ' * existing call site is unchanged. lib/personName.ts passes false for the\n'
    " * teacher's POSITION, where NAME_PART_COMMA_HINT names boxes that field has\n"
    ' * no copy of. Matches check_name_part(..., comma_hint=) in _text.py.\n'
    ' */\n'
    'export function checkNamePart(raw: string, label: string,\n'
    '                              commaHint = true): string | null {'
)

OLD_TAIL = '    const tail = bad.includes(",") ? NAME_PART_COMMA_HINT : NAME_PART_SENTENCE;'
NEW_TAIL = ('    const tail = (bad.includes(",") && commaHint)\n'
            '      ? NAME_PART_COMMA_HINT : NAME_PART_SENTENCE;')

# The four functions my short copy was missing. If none of them is present the
# file is almost certainly that short copy rather than the real one, and
# patching it would leave the build broken in exactly the way this tool exists
# to undo.
REAL_FILE_MARKERS = (
    # the paper/roster helpers
    "bySurname", "paperLastName", "paperFirstName", "needsNameSplit",
    # the exam-form rules - the browser halves of check_exam_name(),
    # check_description(), check_subject(), check_schedule() and
    # tidy_multiline() in backend/app/schemas/_text.py
    "checkExamName", "checkDescription", "checkSubject", "checkSchedule",
    "tidyMultiline",
)


def exports(text: str, name: str) -> bool:
    """Is `name` really EXPORTED here?

    NOT a substring test. `name in text` was the first version and it is wrong
    twice over: "checkSchedule" is satisfied by "checkScheduleX", and any of
    these names mentioned in a COMMENT would satisfy it too - the same mistake
    that made the tidyName guard in apply_2026-11-16_profile_required.py
    unable to fail, on the same day.
    """
    return re.search(
        rf"^export\s+(?:async\s+)?"
        rf"(?:function|const|let|var|class|type|interface)\s+{re.escape(name)}\b",
        text, re.M) is not None


def patch(path: Path, dry: bool) -> int:
    raw = path.read_bytes()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        print(f"  REFUSED  {path}\n           not UTF-8")
        return 2

    crlf = b"\r\n" in raw
    work = text.replace("\r\n", "\n") if crlf else text

    if "export function checkNamePart" not in work:
        print(f"  REFUSED  {path}\n           this is not textField.ts - it has "
              f"no checkNamePart().\n           Nothing was written.")
        return 2

    # COMPLETENESS FIRST. This used to run AFTER the "already patched" check,
    # which meant the single most dangerous file - my short copy with the flag
    # already in it - was reported as "already done" and the damage stayed
    # invisible. MEASURED 2026-11-16: that is exactly what happened, and the
    # real damage was NINE missing functions and 23 TS2305 errors in 6 files.
    missing = [m for m in REAL_FILE_MARKERS if not exports(work, m)]
    if missing:
        print(f"  REFUSED  {path}")
        print(f"           {len(missing)} of {len(REAL_FILE_MARKERS)} expected "
              f"functions are NOT in this file:")
        line = "             "
        for m in missing:
            if len(line) + len(m) > 74:
                print(line); line = "             "
            line += m + "  "
        if line.strip():
            print(line)
        print("           This is the SHORT copy I wrongly delivered on 2026-11-16,")
        print("           not your real textField.ts. Patching it would leave the")
        print("           frontend broken.")
        print("")
        print("           `git checkout --` will NOT help if the short copy was")
        print("           committed. Find the last good revision by line count:")
        print("")
        print("             git log --format=%h -- frontend/src/lib/textField.ts |")
        print("               while read c; do echo \"$c $(git show "
              "$c:frontend/src/lib/textField.ts | wc -l)\"; done")
        print("")
        print("           then restore it:")
        print("")
        print("             git show <good>:frontend/src/lib/textField.ts \\")
        print("               > frontend/src/lib/textField.ts")
        print("")
        print("           Nothing was written.")
        return 2

    if MARKER in work:
        print(f"  ok       {path}\n           complete ({len(REAL_FILE_MARKERS)} "
              f"of {len(REAL_FILE_MARKERS)} functions present) and already "
              f"carries\n           the {STAMP} commaHint flag - nothing written.")
        return 1

    todo = []
    for old, new, what in ((OLD_SIG, NEW_SIG, "the checkNamePart signature"),
                           (OLD_TAIL, NEW_TAIL, "the comma-hint line")):
        n = work.count(old)
        if n != 1:
            print(f"  REFUSED  {path}")
            print(f"           {what} was found {n} times, expected 1:")
            print(f"             {old.strip()[:70]}")
            print("           Nothing was written.")
            return 2
        todo.append((old, new))

    for old, new in todo:
        work = work.replace(old, new, 1)

    # structural self-check
    if work.count("commaHint") != 3:
        print(f"  REFUSED  {path}\n           expected commaHint 3 times "
              f"(comment, parameter, use), got {work.count('commaHint')}.\n"
              f"           Nothing was written.")
        return 2
    for o, c in (("(", ")"), ("{", "}"), ("[", "]")):
        if work.count(o) != work.count(c):
            print(f"  REFUSED  {path}\n           unbalanced {o}{c} "
                  f"({work.count(o)} vs {work.count(c)}).\n"
                  f"           Nothing was written.")
            return 2

    out = work.replace("\n", "\r\n") if crlf else work
    if dry:
        print(f"  WOULD PATCH  {path}   (2 edits"
              f"{', CRLF preserved' if crlf else ''})")
    else:
        backup = path.with_suffix(path.suffix + f".bak-{STAMP}")
        shutil.copy2(path, backup)
        path.write_bytes(out.encode("utf-8"))
        print(f"  patched  {path}   (2 edits, backup: {backup.name})")
        print(f"             all {len(REAL_FILE_MARKERS)} other exports kept: "
              f"{', '.join(REAL_FILE_MARKERS)}")
    return 0


def main(argv):
    dry = "--dry-run" in argv
    paths = [Path(a) for a in argv[1:] if not a.startswith("--")]
    if not paths:
        print(__doc__)
        return 2
    print(f"LearnLens commaHint {STAMP}"
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
        print("\nThen type-check the WHOLE frontend, not just the open file:\n"
              "    cd frontend && npx tsc --noEmit\n")
    return 1 if 2 in codes else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))