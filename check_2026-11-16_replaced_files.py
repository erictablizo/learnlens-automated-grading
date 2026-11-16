#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
Did a whole-file delivery delete something?                       2026-11-16

    python check_2026-11-16_replaced_files.py

Run from the repo root.  Reads only; writes nothing.

WHY THIS EXISTS.  On 2026-11-16 I delivered four files as WHOLE FILES:

    backend/app/schemas/_text.py        frontend/src/lib/textField.ts
    backend/app/schemas/profile.py      frontend/src/lib/personName.ts

The copy of textField.ts I was working from was missing four functions the
real one has - bySurname, paperLastName, paperFirstName, needsNameSplit - so
copying mine over yours DELETED them and analytics/page.tsx stopped compiling.

`npx tsc --noEmit` catches that for the two .ts files.  NOTHING catches it for
the two .py files until the code runs, because python resolves a name at call
time.  This walks every .py under backend/app, finds everything imported FROM
those two modules, and checks each name is actually defined there.

It also lists what each file exports, so a name that vanished can be spotted by
eye even if nothing imports it yet.
"""

import ast
import re
import sys
from pathlib import Path

PY_TARGETS = {
    "app.schemas._text": Path("backend/app/schemas/_text.py"),
    "app.schemas.profile": Path("backend/app/schemas/profile.py"),
}
TS_TARGETS = {
    "@/lib/textField": Path("frontend/src/lib/textField.ts"),
    "@/lib/personName": Path("frontend/src/lib/personName.ts"),
}


def py_defined(path: Path):
    """Top-level names a module provides: defs, classes and assignments."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    names = set()
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names.add(node.name)
        elif isinstance(node, ast.Assign):
            for t in node.targets:
                if isinstance(t, ast.Name):
                    names.add(t.id)
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            names.add(node.target.id)
        elif isinstance(node, (ast.Import, ast.ImportFrom)):
            for a in node.names:
                names.add(a.asname or a.name.split(".")[0])
    return names


def ts_exported(path: Path):
    """Names this module exports. Good enough for `export const/function/type`."""
    text = path.read_text(encoding="utf-8")
    names = set(re.findall(
        r"^export\s+(?:async\s+)?(?:function|const|let|var|class|type|interface)\s+"
        r"([A-Za-z_$][\w$]*)", text, re.M))
    for block in re.findall(r"^export\s*\{([^}]*)\}", text, re.M):
        for part in block.split(","):
            part = part.strip()
            if part:
                names.add(part.split(" as ")[-1].strip())
    return names


def scan_py_imports(root: Path):
    """-> list of (file, lineno, module, [names])"""
    out = []
    for p in sorted(root.rglob("*.py")):
        if "__pycache__" in p.parts:
            continue
        try:
            tree = ast.parse(p.read_text(encoding="utf-8"))
        except (SyntaxError, UnicodeDecodeError) as e:
            print(f"  (could not parse {p}: {e})")
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module:
                mod = node.module
                # a relative "from ._text import x" inside app/schemas/
                if node.level and p.parent.name == "schemas":
                    mod = "app.schemas." + mod.lstrip(".")
                if mod in PY_TARGETS:
                    out.append((p, node.lineno, mod,
                                [a.name for a in node.names]))
    return out


TS_IMPORT = re.compile(
    r"import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*[\"']([^\"']+)[\"']", re.S)


def scan_ts_imports(root: Path):
    out = []
    for p in sorted(root.rglob("*.ts*")):
        if "node_modules" in p.parts:
            continue
        try:
            text = p.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for m in TS_IMPORT.finditer(text):
            mod = m.group(2)
            if mod in TS_TARGETS:
                names = [n.strip().split(" as ")[0].strip()
                         for n in m.group(1).split(",") if n.strip()]
                line = text[:m.start()].count("\n") + 1
                out.append((p, line, mod, names))
    return out


def main():
    missing_files = [str(p) for p in list(PY_TARGETS.values()) + list(TS_TARGETS.values())
                     if not p.exists()]
    if missing_files:
        print("Run this from the repo root. Not found:")
        for f in missing_files:
            print("  " + f)
        return 2

    print("Whole-file delivery check, 2026-11-16\n")

    provides = {}
    for mod, p in PY_TARGETS.items():
        provides[mod] = py_defined(p)
    for mod, p in TS_TARGETS.items():
        provides[mod] = ts_exported(p)

    print("  what each replaced file provides now:")
    for mod, p in list(PY_TARGETS.items()) + list(TS_TARGETS.items()):
        public = sorted(n for n in provides[mod] if not n.startswith("_")
                        or mod.endswith("profile"))
        print(f"    {p}  ({len(public)})")
        line = "      "
        for n in public:
            if len(line) + len(n) > 76:
                print(line); line = "      "
            line += n + "  "
        if line.strip():
            print(line)
    print()

    broken = []
    rows = scan_py_imports(Path("backend/app")) + scan_ts_imports(Path("frontend/src"))
    for path, lineno, mod, names in rows:
        for n in names:
            if n == "*":
                continue
            if n not in provides[mod]:
                broken.append((path, lineno, mod, n))

    print(f"  import sites checked : {len(rows)}")
    print(f"  names checked        : {sum(len(n) for _, _, _, n in rows)}")
    print(f"  NOT PROVIDED         : {len(broken)}")
    for path, lineno, mod, n in broken:
        print(f"    {path}:{lineno}")
        print(f"      imports `{n}` from {mod}, which no longer defines it")

    print()
    if broken:
        print("  RESULT: SOMETHING WAS DELETED BY A WHOLE-FILE DELIVERY.")
        print("          Restore that file and re-apply the change as a patch:")
        print("            git checkout -- <the file>")
        return 1
    print("  RESULT: every imported name is still provided.")
    print("          (This does not replace `cd frontend && npx tsc --noEmit`,")
    print("           which also checks types, not just names.)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
