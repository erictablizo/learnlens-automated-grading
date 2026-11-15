#!/usr/bin/env python3
"""
apply_2026-11-14_screens_use_lists.py

Patches THREE files, and refuses unless ALL THREE match:

    frontend/src/types/profile.ts                   widen College and YearLevel
    frontend/src/app/(dashboard)/profile/page.tsx   read the lists from the API
    frontend/src/app/(auth)/setup/page.tsx          read the lists from the API

This is the last part of the 2026-11-14 reference-lists change. Part 1 made the
three dropdown lists data; Part 2's backend half made the API honour them; this
makes the two screens that show them stop using hardcoded arrays.

WHY MARKERS AND WHOLE-LINE REPLACEMENT, NOT EXACT TEXT
-------------------------------------------------------
Two separate pastes of line 74 of the Edit Profile page differed by ONE SPACE
(`as YearLevel) : ""` versus `as YearLevel): ""`). An exact-text anchor would
refuse on that, and refusing over a space is a worse failure than it sounds -
it trains you to hand-apply, which is the 2026-11-11 page.tsx mistake.

So each edit names one or more MARKER substrings. Exactly one line in the file
must contain all of them; that whole line is replaced, and its original
indentation is reused. Still all-or-nothing, still byte-exact about what it
looks for, but immune to spacing that no compiler cares about.

WHAT CHANGES, AND THE ONE RACE THIS AVOIDS
-------------------------------------------
The lists arrive over HTTP, so for a moment after the screen mounts they are
EMPTY. The old code validated the saved year level against the constants, which
were always there. Validating against a list that has not loaded yet would
answer "invalid" and SILENTLY CLEAR the teacher's saved year level - then save
that blank if they pressed Save.

Two edits exist only to prevent that:

  * the initial load keeps `p.year_level` as-is and does NOT validate it;
  * the pruning effect is a no-op while `lists.loading` is true, and runs for
    real once the lists arrive.

Usage:
    python apply_2026-11-14_screens_use_lists.py --dry-run frontend/src
    python apply_2026-11-14_screens_use_lists.py           frontend/src

Exit 0 = patched, or already patched. Exit 1 = refused, nothing written.
"""
import os
import sys

STAMP = "2026-11-14"
# An edit whose replacement text starts with this is INSERTED BEFORE the
# matched line instead of replacing it. Needed wherever the aim is to annotate
# a declaration rather than rewrite it: whole-line replacement would have to
# reproduce the rest of that line exactly, and getting it subtly wrong is how
# the first version of this script truncated
# `export const COLLEGE_OPTIONS: { value: College; label: string }[] = [`
# down to `export const COLLEGE_OPTIONS` and broke the file.
INSERT_BEFORE = "\x00"
HOOK_IMPORT = 'import { useReferenceLists } from "@/hooks/useReferenceLists";'

# ── types/profile.ts ───────────────────────────────────────────────────────
TYPES = [
    (["export type College =", '"CVMAS"'],
     '''// WIDENED 2026-11-14. Was a union of the four colleges that existed in
// September. They are a TABLE now (migrations/2026-11-14_reference_lists.sql),
// maintained by an administrator, so a type that lists them can only be wrong
// the moment a fifth is added - and would make adding one a compile error in
// every file that touches a college.
//
// Nothing is lost that was protecting anything: the real check is
// reference_service.validate_selection() on the server, which asks the
// database. A union here only ever checked against a copy.
export type College = string;'''),

    (["export type YearLevel ="],
     '''// WIDENED 2026-11-14, same reason. Year levels are per college now and come
// from the `year_levels` table; `user_profiles_year_level_check` still bounds
// them to 1-6 in the database, which is where that rule belongs.
export type YearLevel = number;'''),

    (["export const COLLEGE_OPTIONS"],
     INSERT_BEFORE + '''// ───────────────────────────────────────────────────────────────────────────
// DEPRECATED 2026-11-14 - everything from here to TeachingContext below.
//
// These arrays are a SECOND copy of the three dropdown lists, and the first
// copy is now the database. The Edit Profile and Setup screens no longer read
// them; they call useReferenceLists(), which fetches /api/reference/lists.
//
// They are left in place for one reason only: this script cannot know what
// else imports them. Find out, and then delete what nothing uses:
//
//     grep -rn "COLLEGE_OPTIONS\\|COURSES_BY_COLLEGE\\|MAX_YEAR_BY_COLLEGE\\|YEAR_LABELS\\|yearLevelsFor\\|isValidYear\\|isValidCourse" frontend/src
//
// A SPECIFIC HAZARD while they remain. With College widened to string,
// `COURSES_BY_COLLEGE[college]` is `undefined` for any college an
// administrator has added, so `isValidCourse()` THROWS on `.includes` rather
// than returning false. It is unused by the two screens as of today. If that
// grep finds another caller, move it to the hook before adding a fifth
// college.
// ───────────────────────────────────────────────────────────────────────────'''),
]

# ── (dashboard)/profile/page.tsx ───────────────────────────────────────────
PROFILE = [
    (["COLLEGE_OPTIONS, COURSES_BY_COLLEGE, College, UserProfile,"],
     "College, UserProfile,"),
    (["YearLevel, YEAR_LABELS, yearLevelsFor, isValidYear,"],
     "YearLevel,   // the lists now come from useReferenceLists()"),
    (["setCollege]", "useState<College"],
     '''const [college,   setCollege]   = useState<College | "">("");
  // NEW 2026-11-14. The College / Course / Year Level choices come from the
  // database now, not from COLLEGE_OPTIONS and COURSES_BY_COLLEGE. See
  // hooks/useReferenceLists.ts; the shapes are deliberately the same.
  const lists = useReferenceLists();'''),
    (["setYear(isValidYear(p.college as College, p.year_level)"],
     '''// CHANGED 2026-11-14 - the saved year is kept, NOT validated here.
        //
        // This runs when the profile arrives, which can be BEFORE the lists
        // have. Validating against an empty list would answer "invalid" and
        // silently wipe the teacher's saved year level. The effect below does
        // the validating, once the lists are actually there.
        setYear((p.year_level as YearLevel) ?? "");'''),
    (["setCourse(c => (college && COURSES_BY_COLLEGE[college].includes(c)"],
     '''setCourse(c => (lists.loading ? c
      : (college && lists.coursesFor(college).includes(c) ? c : "")));'''),
    (["setYear(y => (isValidYear(college || null, y)"],
     '''setYear(y => (lists.loading ? y
      : (lists.isValidYear(college || null, y) ? y : "")));'''),
    (["const list = COURSES_BY_COLLEGE[college];"],
     "const list = lists.coursesFor(college);"),
    (["{COLLEGE_OPTIONS.map(o => <option key={o.value}"],
     "{lists.collegeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}"),
    (["{yearLevelsFor(college || null).map(y => ("],
     "{lists.yearLevelsFor(college || null).map(y => ("),
    (["{YEAR_LABELS[y]}</option>"],
     "<option key={y} value={y}>{lists.yearLabel(college || null, y)}</option>"),
]

# ── (auth)/setup/page.tsx ──────────────────────────────────────────────────
SETUP = [
    (["COLLEGE_OPTIONS, COURSES_BY_COLLEGE, College,"],
     "College,"),
    (["YearLevel, YEAR_LABELS, yearLevelsFor,"],
     "YearLevel,   // the lists now come from useReferenceLists()"),
    (["setCollege]", "useState<College"],
     '''const [college,       setCollege]       = useState<College | "">("");
  // NEW 2026-11-14 - see hooks/useReferenceLists.ts.
  const lists = useReferenceLists();'''),
    (["const courseOptions ="],
     "const courseOptions = college ? lists.coursesFor(college) : [];"),
    (["const yearOptions ="],
     "const yearOptions   = lists.yearLevelsFor(college || null);"),
    (["{COLLEGE_OPTIONS.map(o => ("],
     "{lists.collegeOptions.map(o => ("),
    (["{YEAR_LABELS[y]}</option>"],
     "<option key={y} value={y}>{lists.yearLabel(college || null, y)}</option>"),
]

TARGETS = [
    ("types/profile.ts",                   TYPES,   "WIDENED 2026-11-14", False),
    ("app/(dashboard)/profile/page.tsx",   PROFILE, "useReferenceLists",  True),
    ("app/(auth)/setup/page.tsx",          SETUP,   "useReferenceLists",  True),
]


def _dedent(block):
    """Strip the indentation the replacement literal carries of its own.

    These replacements are written inside an indented triple-quoted string, so
    their continuation lines already start with spaces. The matched line's own
    indent is then added to every line - which DOUBLED it, and produced a
    comment sitting four spaces in above a statement at two. Cosmetic, but a
    patch that visibly does not match the file around it is one a reader stops
    trusting.

    The first line is taken to be at column zero (it is, in every literal
    here); the rest are dedented by the smallest indent among them.
    """
    lines = block.split("\n")
    rest = [l for l in lines[1:] if l.strip()]
    if not rest:
        return block
    pad = min(len(l) - len(l.lstrip()) for l in rest)
    return "\n".join([lines[0]] + [l[pad:] if l.strip() else l for l in lines[1:]])


def _norm(s):
    """Collapse every run of whitespace to one space.

    Matching is done on this form, NOT on the raw line. These files align their
    declarations with runs of spaces (`const yearOptions   = ...`), and the
    first version of this script looked for `const yearOptions =` and refused.
    An anchor that breaks on alignment nobody can see is worse than no anchor:
    it pushes you towards hand-applying, which is the 2026-11-11 mistake.
    Nothing a compiler cares about survives this normalisation, so nothing
    this script needs to be exact about is lost."""
    return " ".join(s.split())


def find_line(lines, markers):
    """The index of the ONE line containing every marker. -1 / -2 otherwise."""
    norm = [_norm(m) for m in markers]
    hits = [i for i, ln in enumerate(lines)
            if all(m in _norm(ln) for m in norm)]
    if len(hits) == 1:
        return hits[0]
    return -1 if not hits else -2


def patch(path, edits, done_marker, needs_hook_import, dry):
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
    if needs_hook_import and find_line(lines, ['} from "@/types/profile";']) < 0:
        bad.append('  not found exactly once: } from "@/types/profile";')
    if bad:
        return "refused", f"{path}\n" + "\n".join(bad)

    # Applied back-to-front so earlier indices stay valid, and so an insert
    # cannot shift a line a later edit is still aiming at.
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
    if needs_hook_import:
        j = find_line(lines, ['} from "@/types/profile";'])
        lines.insert(j + 1, HOOK_IMPORT)

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
    root = args[0]
    jobs = [(os.path.join(root, rel), e, d, h) for rel, e, d, h in TARGETS]

    # ALL THREE CHECKED BEFORE ANY IS WRITTEN. A screen patched against an
    # unwidened types/profile.ts does not compile, and a widened types file
    # with unpatched screens still shows the old lists - either half on its
    # own is a broken tree.
    results = [patch(p, e, d, h, dry=True) for p, e, d, h in jobs]
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
    for p, e, d, h in jobs:
        s, m = patch(p, e, d, h, dry=False)
        print(f"{s.upper():8} {m}")
    print("\nNow: npm run build")
    return 0


if __name__ == "__main__":
    sys.exit(main())
