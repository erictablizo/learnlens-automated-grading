#!/usr/bin/env python3
"""
apply_2026-11-15_section_required.py

Grace, 2026-11-15, second pass:

    "Middle Initial should not be R. it should be the Full Middle Name.
     Section should also be validated like blank or other special characters."

Decided in the same conversation: the middle name is a WORDING change only -
"R." is still a legal value and nothing stored breaks - and SECTION becomes
REQUIRED with a character rule.

THREE files, both sides, all or nothing - run from the REPO ROOT:

    backend/app/schemas/_text.py             check_section()
    backend/app/services/student_service.py  the bulk path validates it
    frontend/src/lib/textField.ts            the browser copy

The wording changes and the two screens are delivered as whole files beside
this script; they are label and JSX edits that a line-anchored patch would
express badly.

WHY THE BULK EDIT MOVES A LINE RATHER THAN ADDING ONE
------------------------------------------------------
bulk_create computes

    row_section = " ".join(str(raw.get("section", "") or "").split()) or sect_default

AFTER the try/except that catches a bad field and reports it with its line
number. Validating it there would raise past that handler and fail the whole
paste on one bad section - the exact thing that function's docstring says it
exists to prevent ("a 35-row paste with one bad line must not throw away the
other 34"). So the computation MOVES INSIDE the try, and the old line becomes
a comment saying where it went.

THE SECTION SET IS THE SHARED LABEL SET, not a fifth one. A section is a
label - "BSCS 3A", "BSCS 3A, morning" - and _STRICT_MARKS already covers it.
THE COMMA MATTERS: lib/studentPaste.ts deliberately rejoins a trailing comma
into the section so "BSCS 3A, morning" survives a comma-separated paste, and a
rule that refused commas would make that feature dead weight.

Usage:
    python apply_2026-11-15_section_required.py --dry-run .
    python apply_2026-11-15_section_required.py           .
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


# ── backend/app/schemas/_text.py ─────────────────────────────────────────────

SECTION_RULES = INSERT_BEFORE + '''# ── NEW 2026-11-15 (Grace, post-UAT): the SECTION gets a rule ───────────────
#
# It had none. _section() in schemas/student.py collapsed whitespace, capped
# the length and turned blank into NULL - which is storage hygiene, not
# validation. "@@@" and "<script>" both went straight into the column.
#
# THE SET IS THE SHARED LABEL SET. A section is a label - "BSCS 3A",
# "BSCS 3A, morning" - and _STRICT_MARKS already describes exactly that:
# letters, numbers, space and . , ( ) - and nothing else.
#
# THE COMMA IS LOAD-BEARING HERE, not merely tolerated.
# lib/studentPaste.ts rejoins everything after the section column back into
# the section precisely so "BSCS 3A, morning" survives a comma-separated
# paste. A rule refusing commas would leave that code in place doing nothing.
#
# ONE DELIBERATE DEVIATION from every other field in this file: the test is
# "at least one letter OR DIGIT", not "at least one letter". A section can
# legitimately be "101". The test still refuses "---" and "...", which is what
# it is there for.
MAX_SECTION_LENGTH = 255
STRICT_SECTION = True

'''

SECTION_FN = INSERT_BEFORE + '''def check_section(v: Optional[str], required: bool = False) -> Optional[str]:
    """The section, or None. Blank is an error ONLY when required=True.

    The flag, not a second function, for the same reason check_middle_name
    carries one: StudentCreate.section is required from 2026-11-15, but
    StudentBulkRequest.section is a DEFAULT applied to rows that carry none,
    and requiring that would 422 a whole paste whose rows each name their own.

    Mirrors checkSection() in frontend/src/lib/textField.ts, including the
    order of the tests - required, length, at-least-one-alphanumeric,
    characters.
    """
    v = tidy_text(v)
    if not v:
        if required:
            raise ValueError("Section is required.")
        return None
    if len(v) > MAX_SECTION_LENGTH:
        raise ValueError(f"Section must be at most {MAX_SECTION_LENGTH} characters.")
    if not any(c.isalnum() for c in v):
        raise ValueError("Section must contain at least one letter or number.")
    bad = _bad_chars(v, STRICT_SECTION)
    if bad:
        raise ValueError(
            f"Section cannot contain {_shown(bad)}. {_allowed(STRICT_SECTION)}")
    return v


'''

TEXT = [
    (["^STRICT_EXAM_NAME = True"], SECTION_RULES),
    (["def middle_initial(v: Optional[str]) -> str:"], SECTION_FN),
]

# ── backend/app/services/student_service.py ──────────────────────────────────

STUDENT_SERVICE = [
    (["from app.schemas._text import (check_name_part, check_middle_name,"],
     "from app.schemas._text import (check_name_part, check_middle_name,\n"
     "                              check_section,"),

    # MOVED, not added. See the module docstring: computing it here puts the
    # check inside the try that reports a bad row by line number.
    ([r'middle = check_middle_name(str(raw.get("middle_name", "") or ""), required=True)'],
     '''middle = check_middle_name(str(raw.get("middle_name", "") or ""), required=True)
# NEW 2026-11-15. INSIDE the try on purpose - the old computation sat
# below the per-row handler, so a bad section would have raised past it
# and failed the whole paste. The docstring above promises the opposite:
# "a 35-row paste with one bad line must not throw away the other 34".
row_section = check_section(
    " ".join(str(raw.get("section", "") or "").split()) or (sect_default or ""),
    required=True)'''),

    ([r'row_section = " ".join(str(raw.get("section", "") or "").split()) or sect_default'],
     '''# CHANGED 2026-11-15: row_section is computed AND validated inside the
# try block above, so a bad section is reported with its line number like
# every other field instead of escaping the handler.'''),
]

# ── frontend/src/lib/textField.ts ────────────────────────────────────────────

TS_SECTION = INSERT_BEFORE + r'''/**
 * THE SECTION, NEW 2026-11-15 (Grace, post-UAT).
 *
 * It had no rule on either side. _section() on the server collapsed
 * whitespace and capped the length; the browser did not look at it at all.
 *
 * It reuses the LABEL class, not a new one - a section is a label, and
 * NOT_IN_LABEL_STRICT already means letters, numbers, space and . , ( ) -
 *
 * THE COMMA IS LOAD-BEARING: lib/studentPaste.ts rejoins a trailing comma
 * into the section so "BSCS 3A, morning" survives a comma-separated paste.
 *
 * ONE DEVIATION from the other label checks: at least one letter OR DIGIT,
 * because a section can legitimately be "101". It still refuses "---".
 *
 * Matches check_section() in backend/app/schemas/_text.py.
 */
export const MAX_SECTION_LENGTH = 255;

export function checkSection(raw: string, required = false): string | null {
  const v = tidyText(raw);
  if (!v) return required ? "Section is required." : null;
  if (v.length > MAX_SECTION_LENGTH) {
    return `Section must be at most ${MAX_SECTION_LENGTH} characters.`;
  }
  if (!/[\p{L}\p{N}]/u.test(v)) {
    return "Section must contain at least one letter or number.";
  }
  const bad = listBad(v, labelRe(STRICT_EXAM_NAME));
  if (bad.length) {
    return badCharMessage("Section", bad, allowedSentence(STRICT_EXAM_NAME));
  }
  return null;
}

'''

TEXTFIELD = [
    (["export function composeStudentName(lastName: string, firstName: string,"], TS_SECTION),
]

TARGETS = [
    ("backend/app/schemas/_text.py",            TEXT,            "check_section"),
    ("backend/app/services/student_service.py", STUDENT_SERVICE, "check_section"),
    ("frontend/src/lib/textField.ts",           TEXTFIELD,       "checkSection"),
]


if __name__ == "__main__":
    sys.exit(run(TARGETS, STAMP, sys.argv[1:], __doc__))
