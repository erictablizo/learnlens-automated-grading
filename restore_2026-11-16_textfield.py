#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
Find the last good textField.ts in git history, and put it back.  2026-11-16

    python restore_2026-11-16_textfield.py                  # list revisions
    python restore_2026-11-16_textfield.py --restore <sha>   # write one back

Run from the repo root.  Listing touches nothing.

WHY.  I delivered frontend/src/lib/textField.ts as a whole file on 2026-11-16.
The copy I was working from was missing NINE exported functions -

    bySurname  paperLastName  paperFirstName  needsNameSplit
    checkExamName  checkDescription  checkSubject  checkSchedule  tidyMultiline

- so it deleted them, and `npx tsc --noEmit` reports 23 TS2305 errors across 6
files.  `git checkout --` does not help once that short copy has been
COMMITTED, because then HEAD is the damaged version too.

This walks every revision of the file, counts its lines and checks which of the
nine it really EXPORTS (an export, not a mention in a comment), so the last
good one is obvious before anything is overwritten.
"""

import re
import subprocess
import sys
from pathlib import Path

PATH = "frontend/src/lib/textField.ts"

EXPECTED = (
    "bySurname", "paperLastName", "paperFirstName", "needsNameSplit",
    "checkExamName", "checkDescription", "checkSubject", "checkSchedule",
    "tidyMultiline",
)


def git(*args):
    r = subprocess.run(["git"] + list(args), capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if r.returncode:
        return None, (r.stderr or r.stdout).strip()
    return r.stdout, None


def exports(text, name):
    return re.search(
        rf"^export\s+(?:async\s+)?"
        rf"(?:function|const|let|var|class|type|interface)\s+{re.escape(name)}\b",
        text, re.M) is not None


def describe(text):
    have = [n for n in EXPECTED if exports(text, n)]
    return len(text.splitlines()), len(have), [n for n in EXPECTED if n not in have]


def main(argv):
    out, err = git("rev-parse", "--is-inside-work-tree")
    if err:
        print("  not a git repository (run this from the repo root)")
        return 2

    if "--restore" in argv:
        i = argv.index("--restore")
        if i + 1 >= len(argv):
            print("  --restore needs a revision, e.g. --restore a1b2c3d")
            return 2
        sha = argv[i + 1]
        text, err = git("show", f"{sha}:{PATH}")
        if err:
            print(f"  cannot read {PATH} at {sha}:\n    {err}")
            return 2
        lines, have, missing = describe(text)
        if missing:
            print(f"  REFUSED. {sha} is missing {len(missing)} of "
                  f"{len(EXPECTED)}: {', '.join(missing)}")
            print("           That is not a good revision. Nothing was written.")
            return 2
        p = Path(PATH)
        backup = p.with_suffix(p.suffix + ".bak-before-restore")
        if p.exists():
            backup.write_bytes(p.read_bytes())
        # Written with the repository's own bytes, so the line endings are
        # whatever git hands back - no newline translation of mine.
        p.write_text(text, encoding="utf-8", newline="")
        print(f"  restored {PATH} from {sha}")
        print(f"           {lines} lines, {have} of {len(EXPECTED)} functions present")
        if p.exists() and backup.exists():
            print(f"           previous contents kept as {backup.name}")
        print("\n  Now re-apply the two-line change and type-check:")
        print(f"    python apply_2026-11-16_comma_hint.py --dry-run {PATH}")
        print(f"    python apply_2026-11-16_comma_hint.py           {PATH}")
        print("    cd frontend && npx tsc --noEmit")
        return 0

    out, err = git("log", "--format=%h%x09%ad%x09%s", "--date=short", "--", PATH)
    if err or not out.strip():
        print(f"  git has no history for {PATH}")
        return 2

    rows = [l.split("\t", 2) for l in out.strip().splitlines()]
    print(f"revisions of {PATH}\n")
    print(f"  {'rev':9} {'date':11} {'lines':>6}  {'of 9':>5}  subject")
    print("  " + "-" * 74)
    good = None
    for sha, date, subject in rows:
        text, e = git("show", f"{sha}:{PATH}")
        if e:
            print(f"  {sha:9} {date:11} {'?':>6}  {'?':>5}  (unreadable)")
            continue
        lines, have, missing = describe(text)
        mark = "  " if have == len(EXPECTED) else "<<"
        print(f"  {sha:9} {date:11} {lines:6}  {have:3}/9 {mark} {subject[:38]}")
        if good is None and have == len(EXPECTED):
            good = (sha, lines)

    # the working file as it stands
    p = Path(PATH)
    if p.exists():
        lines, have, missing = describe(p.read_text(encoding="utf-8"))
        print("\n  working file now:"
              f"  {lines} lines, {have} of {len(EXPECTED)} functions")
        if missing:
            print("    missing: " + ", ".join(missing))

    print()
    if good:
        print(f"  Newest revision with all 9:  {good[0]}  ({good[1]} lines)")
        print(f"    python restore_2026-11-16_textfield.py --restore {good[0]}")
    else:
        print("  NO revision in this file's history has all nine.")
        print("  Say so and paste `git log --oneline -- " + PATH + "` -")
        print("  the file may have been renamed, or the functions may live")
        print("  somewhere this tool is not looking.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
