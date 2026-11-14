#!/usr/bin/env python3
"""
fix_models_middle_name.py  -  2026-11-14

Adds the MAPPED COLUMN that apply_2026-11-14_middle_name.py forgot.

The migration added students.middle_name and test_papers.middle_name to the
DATABASE. The services write them. app/models/models.py was never told, so

    TypeError: 'middle_name' is an invalid keyword argument for Student

on every Add Student, every Add Paper, and every batch upload. Reads still
work, because Pydantic falls back to the field's None default when the
attribute is absent - which is why the list renders and only writing fails.

It finds the first_name column INSIDE each class and inserts beside it, so it
does not care how this file spaces or aligns anything.

Usage:
    python fix_models_middle_name.py --dry-run backend/app/models/models.py
    python fix_models_middle_name.py           backend/app/models/models.py

Exit 0 = patched, or already patched. Exit 1 = refused, nothing written.
"""
import re
import sys

CLASSES = ("Student", "TestPaper")


def class_span(lines, name):
    """(start, end) of `class <name>(...)` - end is the next top-level stmt."""
    start = None
    for i, ln in enumerate(lines):
        if re.match(rf"class\s+{name}\s*\(", ln):
            if start is not None:
                return None, f"class {name} appears more than once"
            start = i
    if start is None:
        return None, f"class {name} not found"
    for j in range(start + 1, len(lines)):
        if lines[j].strip() and not lines[j][:1].isspace():
            return (start, j), None
    return (start, len(lines)), None


def plan(lines):
    """[(index_to_insert_after, text)] or an error string."""
    out = []
    for name in CLASSES:
        span, err = class_span(lines, name)
        if err:
            return None, err
        lo, hi = span
        body = lines[lo:hi]
        if any(re.match(r"\s*middle_name\s*=", b) for b in body):
            continue                                   # already done
        hits = [k for k, b in enumerate(body)
                if re.match(r"\s*first_name\s*=\s*Column\(", b)]
        if len(hits) != 1:
            return None, (f"class {name}: expected exactly one "
                          f"`first_name = Column(` line, found {len(hits)}")
        k = hits[0]
        indent = re.match(r"\s*", body[k]).group(0)
        # Line the `=` up with the column above it. This file aligns its
        # assignments, and a line that is one space off is the kind of thing
        # that makes a later anchored patch miss.
        eq = body[k].index("=")
        label = "middle_name".ljust(max(1, eq - len(indent) - 1))
        out.append((lo + k, f"{indent}{label} = Column(String(100))"))
    return out, None


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    dry = "--dry-run" in argv
    if len(args) != 1:
        print(__doc__)
        return 1
    path = args[0]
    try:
        src = open(path, encoding="utf-8", newline="").read()
    except OSError as e:
        print(f"REFUSED: {e}")
        return 1
    crlf = "\r\n" in src
    lines = (src.replace("\r\n", "\n") if crlf else src).split("\n")

    edits, err = plan(lines)
    if err:
        print(f"REFUSED - NOTHING WRITTEN.\n  {err}\n\n"
              f"Send me the class body and the anchor will be re-aimed.")
        return 1
    if not edits:
        print("Already patched - nothing to do.")
        return 0

    for i, textline in sorted(edits, reverse=True):
        lines.insert(i + 1, textline)

    out = "\n".join(lines)
    if crlf:
        out = out.replace("\n", "\r\n")
    if dry:
        print(f"DRY RUN  {path}: {len(edits)} line(s) would be added:")
        for _, t in edits:
            print(f"    {t.strip()}")
        print("\nNothing written.")
        return 0
    bak = f"{path}.bak-2026-11-14"
    open(bak, "w", encoding="utf-8", newline="").write(src)
    open(path, "w", encoding="utf-8", newline="").write(out)
    print(f"PATCHED  {path}  ({len(src)} -> {len(out)} bytes), backup {bak}")
    for _, t in edits:
        print(f"    added: {t.strip()}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
