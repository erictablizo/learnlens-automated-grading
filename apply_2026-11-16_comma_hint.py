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
REAL_FILE_MARKERS = ("bySurname", "paperLastName", "paperFirstName", "needsNameSplit")


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

    if MARKER in work:
        print(f"  ok       {path}\n           already carries the {STAMP} "
              f"commaHint flag - nothing written.")
        return 1

    missing = [m for m in REAL_FILE_MARKERS if m not in work]
    if len(missing) == len(REAL_FILE_MARKERS):
        print(f"  REFUSED  {path}")
        print("           This file has none of bySurname / paperLastName /")
        print("           paperFirstName / needsNameSplit, so it is the SHORT copy")
        print("           I wrongly delivered, not your real file. Patching it would")
        print("           leave analytics/page.tsx broken.")
        print("\n             git checkout -- frontend/src/lib/textField.ts")
        print("\n           then run this again. Nothing was written.")
        return 2
    if missing:
        print(f"  note     {path}")
        print(f"           these are absent but expected: {', '.join(missing)}")
        print("           Patching anyway - say so if that is a surprise.")

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
        for m in REAL_FILE_MARKERS:
            if m in work:
                print(f"             kept: {m}()")
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
