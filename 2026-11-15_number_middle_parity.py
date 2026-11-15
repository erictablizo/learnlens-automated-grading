"""2026-11-15 — the browser and the server must say the same thing.

Runs check_student_number() and check_middle_name(required=) from the PATCHED
backend/app/schemas/_text.py against the output of the PATCHED
frontend/src/lib/textField.ts, over the same corpus. Compares both the
verdict AND the exact message: a screen that refuses a value with different
words than the API is the drift this module pair exists to prevent.
"""
import json
import pathlib
import sys
import importlib.util

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("_text", ROOT / "backend/app/schemas/_text.py")
t = importlib.util.module_from_spec(spec)
spec.loader.exec_module(t)

corpus = json.loads((ROOT / "bench/corpus.json").read_text())
browser = json.loads((ROOT / "bench/browser.json").read_text())


def server(fn, v, **kw):
    """The message, or None when accepted — the shape the browser returns."""
    try:
        fn(v, **kw)
        return None
    except ValueError as e:
        return str(e)


ok = fail = 0
def compare(section, label, fn, values, **kw):
    global ok, fail
    print(f"\n-- {label} --")
    for v in values:
        s = server(fn, v, **kw)
        b = browser[section][v]
        same = s == b
        if same:
            ok += 1
        else:
            fail += 1
        verdict = "accepted" if s is None else "refused"
        shown = v if len(v) <= 28 else f"{v[:25]}...({len(v)})"
        if same:
            print(f"  ok   {shown!r:34} {verdict:9} {(s or '')[:48]}")
        else:
            print(f"  FAIL {shown!r:34}\n         server: {s!r}\n         browser: {b!r}")


compare("numbers", "check_student_number / checkStudentNumber",
        t.check_student_number, corpus["numbers"])
compare("middles", "check_middle_name(required=True) / checkMiddleName(v, true)",
        t.check_middle_name, corpus["middles"], required=True)
compare("middles_optional", "check_middle_name() / checkMiddleName(v) — unchanged",
        t.check_middle_name, corpus["middles"])

print(f"\n{ok} agree, {fail} DISAGREE")
sys.exit(1 if fail else 0)
