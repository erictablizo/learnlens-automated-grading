#!/usr/bin/env python3
"""
apply_2026-11-15_required_fields.py

Grace, 2026-11-15: "4 Textfields should have asterisk meaning validations."
Decided in the same conversation:

  * all four REQUIRED - Student No., Last Name, First Name, Middle Initial
  * Student No. = digits, letters and the hyphen; no spaces
  * all four screens, and the API agrees with every one of them

THREE backend files. All or nothing.

    schemas/_text.py             check_student_number(); check_middle_name
                                 gains required=
    services/student_service.py  check_number delegates; bulk_create requires
                                 the middle name
    schemas/paper.py             PaperUpdate.middle_name becomes required

schemas/student.py is NOT patched - it is delivered whole, because making
middle_name required changes a field declaration, a validator and a docstring,
and a line-anchored patch cannot express that honestly.

WHAT check_number DID BEFORE
----------------------------
    def check_number(v: str) -> str:
        s = tidy_number(v)
        if not s:
            raise ValueError("Student number is required.")
        return s

Blank, and nothing else. students.student_number is varchar(50) and no length
was checked, so a 51-character number reached PostgreSQL as a driver error -
a 500 instead of a 422 naming the field. Exactly the fault
MAX_MIDDLE_NAME_LENGTH was added to prevent on 2026-11-14.

THE SPACE IS NOW REFUSED, and that is a real narrowing. norm_number()'s own
docstring describes "2021 - 00123" pasted out of a spreadsheet. That value
errors now instead of being stored. Existing rows are untouched - only new
input is checked - but a pasted class list may flag rows it did not flag
yesterday.

FOUR files, BOTH SIDES, all or nothing - run from the REPO ROOT:

    backend/app/schemas/_text.py             check_student_number(),
                                             check_middle_name gains required=
    backend/app/services/student_service.py  check_number delegates; the bulk
                                             path requires a middle name
    backend/app/schemas/paper.py             PaperUpdate.middle_name required
    frontend/src/lib/textField.ts            the BROWSER copies of both rules

The frontend file is in the same patcher ON PURPOSE. _text.py and textField.ts
are a parity pair; if the browser half cannot be patched the server half must
not be either, or the screen and the API disagree about what a valid number is
- the single most repeated bug in this project.

backend/app/schemas/student.py is NOT patched. It is delivered whole, because
making middle_name required changes a declaration, a validator and a
docstring, and a line-anchored patch cannot express that honestly.

Usage:
    python apply_2026-11-15_required_fields.py --dry-run .
    python apply_2026-11-15_required_fields.py           .
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

# ── schemas/_text.py ─────────────────────────────────────────────────────────

NUMBER_RULES = INSERT_BEFORE + '''# ── NEW 2026-11-15 (Grace, post-UAT): the STUDENT NUMBER gets a rule ─────────
#
# check_number() in services/student_service.py has only ever tested for
# blank. MEASURED against the live schema: students.student_number is
# varchar(50) and nothing checked the length, so a 51-character number reached
# PostgreSQL and came back as a driver error - a 500, where every other field
# in this file answers 422 and names itself. The same fault
# MAX_MIDDLE_NAME_LENGTH was added to prevent on 2026-11-14.
#
# A FOURTH SET, and the narrowest in this file: letters, digits, hyphen.
#
#     2021-00123      the panel's own example paper
#     202300000001    the live roster
#     2021-A123       a LETTER is legal, and this is not a guess:
#                     ux_students_owner_number indexes
#                     lower(trim(student_number)), which is only meaningful if
#                     a number can carry one, and AddEditPaperModal's comment
#                     names this exact value as the reason it matches on
#                     lower(trim(...)) too
#
# NO SPACE, and that is a deliberate narrowing agreed with Grace on
# 2026-11-15. norm_number()'s own docstring describes "2021 - 00123" pasted
# out of a spreadsheet; that value is REFUSED from now on rather than stored,
# because a space inside a student number is a spreadsheet artefact and not
# part of the number. Rows already in the database are untouched - only new
# input is checked - so a class list pasted today may flag lines that went in
# silently yesterday.
#
# NO "must contain a letter" test: a student number is normally all digits.
# It must contain at least one LETTER OR DIGIT, which is what stops "---"
# and "--" passing a rule built out of allowed marks.
#
# Matches checkStudentNumber() in frontend/src/lib/textField.ts.
MAX_STUDENT_NUMBER_LENGTH = 50
_STUDENT_NUMBER_MARKS = "-"

STUDENT_NUMBER_SENTENCE = "Use letters, numbers and - only, with no spaces."

'''

NUMBER_FN = INSERT_BEFORE + '''def check_student_number(v: Optional[str]) -> str:
    """The Student No. REQUIRED, capped at the column width, no spaces.

    Mirrors checkStudentNumber() in frontend/src/lib/textField.ts, including
    the ORDER of the tests - required, length, at-least-one-alphanumeric,
    characters - so the two never disagree about which message a bad value
    earns.
    """
    v = tidy_text(v)
    if not v:
        raise ValueError("Student number is required.")
    if len(v) > MAX_STUDENT_NUMBER_LENGTH:
        raise ValueError(
            f"Student number must be at most {MAX_STUDENT_NUMBER_LENGTH} characters.")
    if not any(c.isalnum() for c in v):
        raise ValueError("Student number must contain at least one letter or number.")
    # The SPACE gets its own sentence, before the general character test.
    # _shown() prints any whitespace as "a control character", which is true of
    # a tab and nonsense to a teacher looking at "2021 - 00123" out of a
    # spreadsheet - the single likeliest way this rule gets hit.
    if " " in v:
        raise ValueError(f"Student number cannot contain spaces. {STUDENT_NUMBER_SENTENCE}")
    bad = sorted({c for c in v if not c.isalnum() and c not in _STUDENT_NUMBER_MARKS})
    if bad:
        raise ValueError(
            f"Student number cannot contain {_shown(bad)}. {STUDENT_NUMBER_SENTENCE}")
    return v


'''

MIDDLE_SIG = '''def check_middle_name(v: Optional[str], required: bool = False) -> Optional[str]:'''

# The engine writes every line at the ANCHOR's indent, so continuation lines
# carry none of their own here or they end up twice-indented.
MIDDLE_DOC = '''"""The middle name. Blank is an error ONLY when required=True.

CHANGED 2026-11-15 (Grace, post-UAT): the flag, not a second function. The
roster, the paste and Edit Paper all demand one now; compose and the legacy
read paths still have to tolerate the NULL that every row written before
2026-11-14 carries, and a separate required-variant would be two copies of
one character rule - the drift this module exists to prevent.
"""'''

MIDDLE_BLANK = '''if required:
    raise ValueError("Middle name is required.")
return None'''

TEXT = [
    (["^STRICT_EXAM_NAME = True"], NUMBER_RULES),
    (["def middle_initial(v: Optional[str]) -> str:"], NUMBER_FN),
    (["def check_middle_name(v: Optional[str]) -> Optional[str]:"], MIDDLE_SIG),
    (['"""The middle name, or None. Blank is NOT an error."""'], MIDDLE_DOC),
    (["scope:def check_middle_name(", "^return None"], MIDDLE_BLANK),
]

# ── services/student_service.py ──────────────────────────────────────────────

STUDENT_SERVICE = [
    (["from app.schemas._text import check_name_part, check_middle_name"],
     "from app.schemas._text import (check_name_part, check_middle_name,\n"
     "                              check_student_number)"),

    # NOT the `if not s:` line, and not `s = tidy_number(v)`. Replacing either
    # would leave the other two lines of the old body stranded - an orphaned
    # `raise` at a deeper indent after a `return`, which is an IndentationError.
    # Replacing the RETURN keeps the existing blank check (same message) and
    # adds the length and character rules behind it.
    (["scope:def check_number(", "^return s"],
     '''# CHANGED 2026-11-15: the rule lives in schemas/_text.py beside the other
# field rules, and is mirrored character for character in textField.ts.
# tidy_number first, so what is STORED keeps its case.
return check_student_number(s)'''),

    (["scope:async def create_student(", "middle = check_middle_name(middle_name)"],
     "middle = check_middle_name(middle_name, required=True)"),
    (["scope:async def update_student(", "middle = check_middle_name(middle_name)"],
     "middle = check_middle_name(middle_name, required=True)"),

    # The bulk path reports per row, by line number, instead of 422-ing the
    # whole paste - so a list with no middle-name column flags every line
    # rather than being rejected whole.
    (['middle = check_middle_name(str(raw.get("middle_name", "") or ""))'],
     'middle = check_middle_name(str(raw.get("middle_name", "") or ""), required=True)'),
]

# ── schemas/paper.py ─────────────────────────────────────────────────────────

PAPER = [
    (["scope:class PaperUpdate(BaseModel):", "^middle_name: Optional[str] = None"],
     '''# CHANGED 2026-11-15: REQUIRED. Edit Paper sends all three name parts on
# every save, and rename_paper writes the column unconditionally - an
# omitted key would be pydantic's default None, which is a "clear it" the
# teacher never asked for.
middle_name: str'''),
    (["scope:class PaperUpdate(BaseModel):",
      "def _middle(cls, v: Optional[str]) -> Optional[str]:"],
     "def _middle(cls, v: str) -> str:"),
    (["scope:class PaperUpdate(BaseModel):", "^return check_middle_name(v)"],
     'return check_middle_name(v, required=True) or ""'),
]

# ── frontend/src/lib/textField.ts ────────────────────────────────────────────

TS_RULES = INSERT_BEFORE + r'''/**
 * THE STUDENT NUMBER, NEW 2026-11-15 (Grace, post-UAT).
 *
 * The browser had no rule for this field at all - check_number() on the
 * server tested only for blank, and nothing here tested anything. MEASURED:
 * students.student_number is varchar(50) with no length check anywhere, so a
 * 51-character number reached PostgreSQL as a driver error, a 500 rather than
 * a 422 naming the field.
 *
 * A FOURTH class, and the narrowest in this file: letters, digits, hyphen.
 *
 *     2021-00123      the panel's own example paper
 *     202300000001    the live roster
 *     2021-A123       a LETTER is legal - ux_students_owner_number indexes
 *                     lower(trim(student_number)), which is only meaningful
 *                     if a number can carry one
 *
 * NO SPACE, deliberately. norm_number()'s docstring describes "2021 - 00123"
 * pasted out of a spreadsheet; that is refused from now on rather than
 * stored. Rows already in the database are untouched.
 *
 * \p{N} and \p{L} rather than [0-9A-Za-z], to stay consistent with every
 * other class here. Hyphen LAST so it is a literal hyphen, not a range.
 * Matches _STUDENT_NUMBER_MARKS in backend/app/schemas/_text.py.
 */
export const MAX_STUDENT_NUMBER_LENGTH = 50;
const NOT_IN_STUDENT_NUMBER = /[^\p{L}\p{N}-]/gu;

/** Matches STUDENT_NUMBER_SENTENCE in backend/app/schemas/_text.py. */
export const STUDENT_NUMBER_SENTENCE =
  "Use letters, numbers and - only, with no spaces.";

/**
 * Mirrors check_student_number() in _text.py, including the ORDER of the
 * tests - required, length, at-least-one-alphanumeric, characters - so the
 * two never disagree about which message a bad value earns.
 *
 * There is no "must contain a letter" test: a student number is normally all
 * digits. The alphanumeric test is what stops "---" passing a rule built out
 * of allowed marks.
 */
export function checkStudentNumber(raw: string): string | null {
  const v = tidyText(raw);
  if (!v) return "Student number is required.";
  if (v.length > MAX_STUDENT_NUMBER_LENGTH) {
    return `Student number must be at most ${MAX_STUDENT_NUMBER_LENGTH} characters.`;
  }
  if (!/[\p{L}\p{N}]/u.test(v)) {
    return "Student number must contain at least one letter or number.";
  }
  // The SPACE gets its own sentence, before the general character test -
  // badCharMessage prints whitespace as "a control character", which is
  // nonsense to a teacher looking at "2021 - 00123" out of a spreadsheet.
  if (v.includes(" ")) {
    return `Student number cannot contain spaces. ${STUDENT_NUMBER_SENTENCE}`;
  }
  const bad = listBad(v, NOT_IN_STUDENT_NUMBER);
  if (bad.length) {
    return badCharMessage("Student number", bad, STUDENT_NUMBER_SENTENCE);
  }
  return null;
}

'''

TEXTFIELD = [
    (["export function checkMiddleName(raw: string): string | null {"],
     """export function checkMiddleName(raw: string, required = false): string | null {"""),
    (["scope:export function checkMiddleName(", "if (!v) return null;"],
     '''// CHANGED 2026-11-15: required= rather than a second function, matching
  // check_middle_name(v, required) on the server.
  if (!v) return required ? "Middle name is required." : null;'''),
    (["export function composeStudentName(lastName: string, firstName: string,"], TS_RULES),
]

TARGETS = [
    ("backend/app/schemas/_text.py",             TEXT,            "check_student_number"),
    ("backend/app/services/student_service.py",  STUDENT_SERVICE, "check_student_number"),
    ("backend/app/schemas/paper.py",             PAPER,           "required=True"),
    ("frontend/src/lib/textField.ts",            TEXTFIELD,       "checkStudentNumber"),
]


if __name__ == "__main__":
    sys.exit(run(TARGETS, STAMP, sys.argv[1:], __doc__))
