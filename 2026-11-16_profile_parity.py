#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Profile-field parity: the server rule vs the browser rule.        2026-11-16

    python measure/2026-11-16_profile_parity.py \
        backend/app/schemas/_text.py \
        backend/app/schemas/profile.py \
        frontend/src/lib/textField.ts \
        frontend/src/lib/personName.ts

Runs 404 values - real Filipino names, academic ranks, blanks, digits, special
characters, unicode letters, both sides of both length caps - through

    _check_person_name() / _check_position()   in schemas/profile.py   (python)
    checkPersonName()    / checkPosition()     in lib/personName.ts    (node)

and through check_name_part() / checkNamePart(), the STUDENT rule both now
borrow, and compares all three fields verbatim.  1212 checks.

Needs python3 and `npx tsc` (TypeScript).  It compiles the two .ts files into a
throwaway directory under the system temp folder; your repo is only read.

FOUR NEGATIVE CONTROLS run automatically.  A bench that cannot fail is not a
measurement, and this project has shipped two of those: on 2026-11-14 a 32-check
bench passed on a tree that was never deployed, and on 2026-11-15 a 31-check
harness passed on a feature that was broken on arrival because it stubbed the
function under test.  Each control breaks one rule on purpose and the run FAILS
if the bench does not notice.
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

VALUES = [
    "Eric Bernard", "Tablizo", "Admin", "Mark Vincent", "Cristobal",
    "Marilyn", "Rubrica", "Ma. Theresa", "Juan", "e",
    "Dela Cruz-Santos", "O'Brien", "O’Brien", "Reyes-Ramos",
    "Anne-Marie", "Villanueva-Lim", "D'Angelo",
    "Asst. Prof.", "Instructor II", "Teacher 1", "Instructor 2",
    "Associate Professor", "Dean", "Head, Science Dept.",
    "Teacher (Math)", "Teacher/Adviser", "3rd Year Teacher",
    "Asst. Professor - CAST",
    "", " ", "   ", "\t", "\n", " \t\n ",
    "123", "!!!!", "---", "...", "-", ".", "'", "0",
    "<script>alert(1)</script>", "Lim@dlsau", "Tablizo, Eric",
    "Eric#Bernard", "Eric_Bernard", "Eric+Bernard", "Eric&Sons",
    "Eric;Bernard", "Eric:Bernard", "Eric?", "Eric!", 'Eric"B"',
    "Eric[1]", "Eric{a}", "Eric|B", "Eric\\B", "Eric$", "Eric%",
    "Eric*", "Eric=B", "Eric~B", "Eric`B", "Eric^B", "Eric<B",
    "100% Teacher",
    "José", "Ñoño", "Müller", "de la Cruz", "MacDonald",
    "Łukasz", "中文",
    "Eric  Bernard", " Eric Bernard ", "Eric\tBernard", "Eric\nBernard",
    "Eric Bernard",
    "Eric–Bernard", "Eric—Bernard", "Eric‘B", "Eric“B”",
    "A" * 99, "A" * 100, "A" * 101, "A" * 102,
    "A" * 254, "A" * 255, "A" * 256,
    "A" * 100 + "1", "A" * 100 + "@", "B" * 255 + "@",
    "Smith-", "-Smith", "Smith.", ".Smith", "Smith'", "'Smith",
    "Prof. Dr. Juan M. dela Cruz Jr.",
]

PY_HARNESS = r'''
import json, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app.schemas.profile import _check_person_name, _check_position
from app.schemas._text import tidy_text, check_name_part
cases = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                    os.pardir, "corpus.json"), encoding="utf-8"))
def run(fn):
    out = []
    for c in cases:
        try:
            fn(c); out.append(None)
        except ValueError as e:
            out.append(str(e))
    return out
verdicts = run(lambda c: (_check_person_name(c["value"], "First name",
                                             required=c["required"])
                          if c["kind"] == "name"
                          else _check_position(c["value"], required=c["required"])))
student = run(lambda c: check_name_part(c["value"], "Last name"))
tidied = [tidy_text(c["value"]) for c in cases]
json.dump({"verdicts": verdicts, "tidied": tidied, "student": student},
          sys.stdout, ensure_ascii=False)
'''

TS_HARNESS = r'''
import { checkPersonName, checkPosition, tidyName } from "./lib/personName";
import { checkNamePart } from "./lib/textField";
import { CASES } from "./corpus";
// DECLARED, not imported from @types/node: this throwaway tree has no
// node_modules, and the bench must not need an npm install to run.
declare const console: { log(s: string): void };
const verdicts = CASES.map(c => c.kind === "name"
  ? checkPersonName(c.value as string, "First name", c.required)
  : checkPosition(c.value as string, c.required));
const tidied  = CASES.map(c => tidyName(c.value as string));
const student = CASES.map(c => checkNamePart(c.value as string, "Last name"));
console.log(JSON.stringify({ verdicts, tidied, student }));
'''

TSCONFIG = {
    "compilerOptions": {
        "target": "ES2022", "module": "commonjs", "strict": True,
        "esModuleInterop": True, "outDir": "out", "rootDir": ".",
        "skipLibCheck": True, "types": [],
    },
    "include": ["src/**/*.ts"],
}


def build_corpus(root: Path):
    cases = [{"value": v, "kind": k, "required": r}
             for v in VALUES for k in ("name", "position") for r in (False, True)]
    cases += [{"value": None, "kind": k, "required": r}
              for k in ("name", "position") for r in (False, True)]
    (root / "corpus.json").write_text(
        json.dumps(cases, ensure_ascii=False), encoding="utf-8")
    return cases


def stage(root: Path, files: dict):
    """Copy the four real files into a throwaway tree and write the harnesses."""
    for d in ("py/app/schemas", "ts/src/lib"):
        (root / d).mkdir(parents=True, exist_ok=True)
    for f in ("py/app/__init__.py", "py/app/schemas/__init__.py"):
        (root / f).write_text("", encoding="utf-8")
    shutil.copy2(files["_text"], root / "py/app/schemas/_text.py")
    shutil.copy2(files["profile"], root / "py/app/schemas/profile.py")
    shutil.copy2(files["textField"], root / "ts/src/lib/textField.ts")
    shutil.copy2(files["personName"], root / "ts/src/lib/personName.ts")
    (root / "py/harness.py").write_text(PY_HARNESS, encoding="utf-8")
    (root / "ts/src/harness.ts").write_text(TS_HARNESS, encoding="utf-8")
    cases = json.loads((root / "corpus.json").read_text(encoding="utf-8"))
    (root / "ts/src/corpus.ts").write_text(
        "export type Case = { value: string | null; "
        'kind: "name" | "position"; required: boolean };\n'
        "export const CASES: Case[] = "
        + json.dumps(cases, ensure_ascii=False) + ";\n", encoding="utf-8")
    (root / "ts/tsconfig.json").write_text(json.dumps(TSCONFIG), encoding="utf-8")
    # personName.ts imports "@/lib/textField"; inside this throwaway tree the
    # file sits beside it, so the specifier is rewritten in the COPY only.
    p = root / "ts/src/lib/personName.ts"
    p.write_text(p.read_text(encoding="utf-8")
                 .replace('from "@/lib/textField"', 'from "./textField"'),
                 encoding="utf-8")


def run_py(root: Path):
    r = subprocess.run([sys.executable, "-I", str(root / "py/harness.py")],
                       capture_output=True, text=True)
    if r.returncode:
        return None, (r.stderr or r.stdout).strip().splitlines()[-1]
    return json.loads(r.stdout), None


def run_ts(root: Path):
    ts = root / "ts"
    shutil.rmtree(ts / "out", ignore_errors=True)
    npx = shutil.which("npx") or shutil.which("npx.cmd")
    if not npx:
        return None, "npx not found on PATH - install Node.js to run the browser arm"
    r = subprocess.run([npx, "tsc", "-p", "tsconfig.json"],
                       cwd=ts, capture_output=True, text=True)
    if r.returncode:
        return None, "tsc: " + (r.stdout or r.stderr).strip().splitlines()[0]
    node = shutil.which("node") or shutil.which("node.exe")
    r = subprocess.run([node, str(ts / "out/src/harness.js")],
                       capture_output=True, text=True)
    if r.returncode:
        return None, "node: " + (r.stderr or r.stdout).strip().splitlines()[-1]
    return json.loads(r.stdout), None


FIELDS = ("verdicts", "tidied", "student")


def compare(cases, py, ts):
    bad = []
    for i, c in enumerate(cases):
        for f in FIELDS:
            if py[f][i] != ts[f][i]:
                bad.append((i, f, c, py[f][i], ts[f][i]))
    return bad


def shorten(v):
    if v is None:
        return "None/null"
    s = repr(v)
    return s if len(s) <= 46 else s[:43] + "..."


def measure(files, quiet=False):
    root = Path(tempfile.mkdtemp(prefix="ll-profile-parity-"))
    try:
        cases = build_corpus(root)
        stage(root, files)
        py, err = run_py(root)
        if err:
            return None, cases, f"python arm failed: {err}"
        ts, err = run_ts(root)
        if err:
            return None, cases, f"browser arm failed: {err}"
        return (compare(cases, py, ts), py), cases, None
    finally:
        shutil.rmtree(root, ignore_errors=True)


def mutate(files, which, old, new):
    """Copy the four files, break ONE rule in one of them, return new paths."""
    d = Path(tempfile.mkdtemp(prefix="ll-profile-ctrl-"))
    out = {}
    for k, p in files.items():
        q = d / Path(p).name
        text = Path(p).read_text(encoding="utf-8")
        if k == which:
            if text.count(old) != 1:
                shutil.rmtree(d, ignore_errors=True)
                return None, f"control anchor not found once in {Path(p).name}"
            text = text.replace(old, new)
        q.write_text(text, encoding="utf-8")
        out[k] = str(q)
    return (out, d), None


CONTROLS = [
    ("browser cap 100 raised to 255", "personName",
     "export const MAX_NAME_LENGTH = 100;",
     "export const MAX_NAME_LENGTH = 255;"),
    ("browser drops the blank test", "personName",
     "if (!v) return required ? `${label} is required.` : null;",
     "if (!v) return null;"),
    ("server drops its local 100 cap", "profile",
     "    if len(s) > MAX_NAME_LENGTH:",
     "    if False and len(s) > MAX_NAME_LENGTH:"),
    ("server restores the name comma hint on Position", "profile",
     'return check_name_part(s, "Position", comma_hint=False)',
     'return check_name_part(s, "Position")'),
]


def main(argv):
    args = [a for a in argv[1:] if not a.startswith("--")]
    need = ("_text.py", "profile.py", "textField.ts", "personName.ts")
    files = {}
    for a in args:
        n = Path(a).name
        for k, want in zip(("_text", "profile", "textField", "personName"), need):
            if n == want:
                files[k] = a
    if len(files) != 4:
        print(__doc__)
        print("  give all four files; got: " + (", ".join(sorted(files)) or "none"))
        return 2

    for k, p in files.items():
        if not Path(p).exists():
            print(f"  no such file: {p}")
            return 2

    print("LearnLens profile-field parity 2026-11-16\n")
    for k in ("_text", "profile", "textField", "personName"):
        print(f"  reading  {files[k]}")
    print()

    res, cases, err = measure(files)
    if err:
        print("  " + err)
        return 2
    bad, py = res
    n = len(cases)
    print(f"  cases            : {n} values x 3 fields = {n * 3} checks")
    print(f"  disagreements    : {len(bad)}")
    for i, f, c, a, b in bad[:30]:
        print(f"    [{i}] {f}  {c['kind']} required={c['required']}  {shorten(c['value'])}")
        print(f"          server : {shorten(a)}")
        print(f"          browser: {shorten(b)}")

    ver = py["verdicts"]

    def count(pred):
        return sum(1 for i, c in enumerate(cases) if pred(c, ver[i]))

    facts = {
        "accepted":                      count(lambda c, v: v is None),
        "refused":                       count(lambda c, v: v is not None),
        "'... is required.'":            count(lambda c, v: v and v.endswith("is required.")),
        "'at most 100 characters.'":     count(lambda c, v: v and "at most 100" in v),
        "'at most 255 characters.'":     count(lambda c, v: v and "at most 255" in v),
        "'at least one letter.'":        count(lambda c, v: v and "at least one letter" in v),
        "name + comma -> the box hint":  count(lambda c, v: c["kind"] == "name"
                                               and v and "in one." in v),
        "Position + comma -> general":   count(lambda c, v: c["kind"] == "position"
                                               and "," in (c["value"] or "")
                                               and v and v.endswith("' - only.")),
        "the name-part sentence":        count(lambda c, v: v and v.endswith("' - only.")),
    }
    print("\n  what the corpus actually reached (server arm):")
    for k, v in facts.items():
        print(f"    {v:4d}  {k}")
    gaps = [k for k, v in facts.items() if v == 0]
    if gaps:
        print("    CORPUS GAP, these rules were never exercised:", gaps)

    print("\n  negative controls (each breaks one rule; each must be CAUGHT):")
    blind = []
    for name, which, old, new in CONTROLS:
        made, cerr = mutate(files, which, old, new)
        if cerr:
            print(f"    SKIPPED  {name}: {cerr}")
            blind.append(name)
            continue
        mfiles, d = made
        try:
            r, _, merr = measure(mfiles)
            if merr:
                print(f"    SKIPPED  {name}: {merr}")
                blind.append(name)
            else:
                mbad = r[0]
                if mbad:
                    print(f"    caught   {name}  ({len(mbad)} disagreements)")
                else:
                    print(f"    BLIND    {name}  -> the bench did NOT notice")
                    blind.append(name)
        finally:
            shutil.rmtree(d, ignore_errors=True)

    ok = not bad and not gaps and not blind
    print("\n  RESULT:", "PARITY" if ok else "FAIL")
    if not ok and not bad:
        print("  (the two rules agree, but this bench did not prove itself - "
              "read the lines above)")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
