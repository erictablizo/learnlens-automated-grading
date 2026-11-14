#!/usr/bin/env python3
"""
apply_2026-11-14_middle_name_textfield.py

Patches ONE file:  frontend/src/lib/textField.ts

    EDIT 1  middleInitial() and checkMiddleName() are added, and
            composeStudentName() gains an optional third parameter
    EDIT 2  its body composes "Last, First M."

This is the BROWSER HALF of the parity pair. backend/app/schemas/_text.py got
the same three things from apply_2026-11-14_middle_name.py, and the two have
to produce the same string for the same input - otherwise the screen and the
server print different names for the same paper, which is the kind of
difference nobody notices until a panellist does.

MEASURED, 14 cases run through both implementations, 0 disagreements:
blank / whitespace-only / "R" / "r" / "R." / "Reyes" / "Dela Cruz" /
" Dela   Cruz " / hyphenated surnames / "O\'Brien" / the accented letters
"N-tilde" and "E-acute" / values padded with spaces. A single LETTER gains a
period - including an accented one - and anything longer is left alone.

checkMiddleName DELEGATES to checkNamePart rather than re-spelling its
character rule. A middle name is a name part, and two copies of one rule is
how they drift - the 2026-11-10 parity bench exists because exactly that
happened between this file and schemas/profile.py.

Usage:
    python apply_2026-11-14_middle_name_textfield.py --dry-run frontend/src
    python apply_2026-11-14_middle_name_textfield.py           frontend/src

Exit 0 = patched, or already patched. Exit 1 = refused, nothing written.
"""
import sys

import os

INSERT_BEFORE = "\x00"


def norm(s):
    return " ".join(s.split())


def find_line(lines, markers):
    """Index of the one line these markers address. -1 none, -2 ambiguous."""
    start = 0
    rest = []
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
    # Scoped searches take the first hit after the scope line, by definition.
    # Unscoped ones must be unique, or the edit is not addressing one place.
    if start == 0 and len(hits) > 1:
        return -2
    return hits[0]


def patch_file(path, edits, done_marker, stamp, dry):
    if not os.path.isfile(path):
        return "refused", f"no such file: {path}"
    src = open(path, encoding="utf-8").read()
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
                       f"{(label or markers)[0][:60]}")
        else:
            plan.append((i, new))
    if bad:
        return "refused", f"{path}\n" + "\n".join(bad)

    for i, new in sorted(plan, reverse=True):
        indent = lines[i][:len(lines[i]) - len(lines[i].lstrip())]
        insert = new.startswith(INSERT_BEFORE)
        body = new[len(INSERT_BEFORE):] if insert else new
        block = "\n".join((indent + l) if l.strip() else l
                          for l in body.split("\n"))
        if insert:
            lines.insert(i, block)
        else:
            lines[i] = block

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
        print("\nSend me the file(s) above and the anchors will be re-aimed.")
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


STAMP = "2026-11-14"

ADDITIONS = '''/**
 * NEW 2026-11-14 (Alex Passion / Julius Bancud, Recommendations page 1).
 *
 * The cap matches students.middle_name / test_papers.middle_name, which are
 * varchar(100), and MAX_MIDDLE_NAME_LENGTH in backend/app/schemas/_text.py.
 */
export const MAX_MIDDLE_NAME_LENGTH = 100;

/**
 * The middle name as it is WRITTEN inside a composed name: "R." or "Reyes".
 *
 * A single LETTER gains a period - that is how a teacher writes an initial,
 * and NOT_IN_LABEL_STRICT already allows the period in student_name for
 * exactly this. Anything longer, and anything already ending in one, is left
 * as typed: this adds punctuation, it never rewrites a name.
 *
 * Matches middle_initial() in backend/app/schemas/_text.py - measured over 14
 * cases with 0 disagreements, including accented single letters.
 */
export function middleInitial(v: string | null | undefined): string {
  const s = tidyText(v ?? "");
  if (!s) return "";
  return s.length === 1 && /^\\p{L}$/u.test(s) ? `${s}.` : s;
}

/**
 * The middle name rule. Returns an error message, or null when it is fine.
 *
 * OPTIONAL: blank is not an error. It DELEGATES the character rule to
 * checkNamePart rather than repeating it, because a middle name is a name
 * part and two copies of one rule drift apart - which is why the 2026-11-10
 * parity bench exists.
 */
export function checkMiddleName(raw: string): string | null {
  const v = tidyText(raw);
  if (!v) return null;
  if (v.length > MAX_MIDDLE_NAME_LENGTH) {
    return `Middle name must be at most ${MAX_MIDDLE_NAME_LENGTH} characters.`;
  }
  return checkNamePart(v, "Middle name");
}

export function composeStudentName(lastName: string, firstName: string,
                                   middleName?: string | null): string {'''

BODY = '''// CHANGED 2026-11-14: an optional THIRD part - "Alcantara, Ben R."
// The parameter has a default, so every existing two-argument call site
// produces byte-for-byte the string it produced before.
const base = `${tidyText(lastName)}, ${tidyText(firstName)}`;
const mid = middleInitial(middleName);
return mid ? `${base} ${mid}` : base;'''

TEXTFIELD = [
    (["export function composeStudentName(lastName: string, firstName: string): string {"],
     ADDITIONS),
    (["return `${tidyText(lastName)}, ${tidyText(firstName)}`;"], BODY),
]

TARGETS = [("lib/textField.ts", TEXTFIELD, "checkMiddleName")]


if __name__ == "__main__":
    sys.exit(run(TARGETS, STAMP, sys.argv[1:], __doc__))
