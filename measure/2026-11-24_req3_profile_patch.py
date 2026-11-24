#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
measure/2026-11-24_req3_profile_patch.py                          2026-11-24
============================================================================

Proves apply_2026-11-24_req3_profile.py, which is the only way requirement 3
can reach Edit Profile from here: the screen is not in this working tree and
the copy stored in the project is the 2026-10-01 original, three patches
behind.

WHAT THIS CAN AND CANNOT SAY
  CAN     the tool applies correctly, lands code that satisfies
          measure/2026-11-24_req3_screens.mjs, type-checks, and REFUSES
          every file it should refuse
  CANNOT  that it will apply to Grace's file.  Nothing here has seen it.
          That is why the tool refuses instead of guessing - the check that
          matters runs on her machine, at apply time.

TWO FIXTURES, deliberately.  Fixture A is the 2026-10-01 original.  Fixture B
is A moved on by the three patches that landed after it (see
fixtures/make_fixture_b.py).  A tool that only works on the file its anchors
were read from is a tool that works on nobody's file.

    python measure/2026-11-24_req3_profile_patch.py
"""
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOOL = ROOT / "apply_2026-11-24_req3_profile.py"
FIX  = ROOT / "fixtures"

passed = 0
failed = []


def is_(label, cond, detail=""):
    global passed
    if cond:
        passed += 1
    else:
        failed.append(f"{label}: {detail}" if detail else label)


def run(path, *extra):
    r = subprocess.run([sys.executable, "-I", str(TOOL), *extra, str(path)],
                       capture_output=True, text=True)
    return r.returncode, r.stdout + r.stderr


def strip_comments(s):
    s = re.sub(r"\{/\*[\s\S]*?\*/\}", "", s)
    s = re.sub(r"/\*[\s\S]*?\*/", "", s)
    s = re.sub(r"^\s*//.*$", "", s, flags=re.M)
    return s


# ── the post-conditions, written here INDEPENDENTLY of the tool's own ──────
# If these were imported from the tool, the tool would be grading itself.
def check_applied(name, text):
    code = strip_comments(text)
    is_(f"{name}: imports advanceOnEnter",
        'import { advanceOnEnter } from "@/lib/formNav";' in code)
    is_(f"{name}: declares cardRef",
        "const cardRef = useRef<HTMLDivElement>(null);" in code)
    is_(f"{name}: the card carries ref={{cardRef}}",
        "ref={cardRef}" in code)
    is_(f"{name}: the card keeps its class",
        'className="create-exam-form"' in code)
    is_(f"{name}: Enter is scoped to the card, not the document",
        re.search(r'advanceOnEnter\(e,\s*cardRef\.current,\s*"\.form-input"\)', code)
        is not None)
    is_(f"{name}: exactly one autoFocus",
        code.count("autoFocus") == 1, f"found {code.count('autoFocus')}")
    # Attribute ORDER is not the question - autoFocus sits above id= now -
    # so this walks back from id="first-name" to the <input that opens its tag
    # rather than assuming which attribute comes first.
    j = code.find('id="first-name"')
    tag = code[code.rfind("<input", 0, j):code.find(">", j)] if j >= 0 else ""
    is_(f"{name}: autoFocus is inside the first-name tag",
        "autoFocus" in tag, f"tag was {tag[:120]!r}")
    # ...and that box really is the first one Enter will walk, which is what
    # "the 1st Column of the First Input Box" means. The selector is
    # ".form-input", so DOM order of that class is the order she described.
    ids = re.findall(r'id="([a-z-]+)"[^>]*className="form-input"'
                     r'|className="form-input"[^>]*id="([a-z-]+)"', code)
    first = next((a or b for a, b in ids), None)
    is_(f"{name}: first-name is the first .form-input on the card",
        first == "first-name", f"the first one is {first!r}")
    is_(f"{name}: nothing else gained a ref",
        code.count("useRef(") + code.count("useRef<") ==
        3,  # router? no: fileRef, loaded, cardRef
        f"{code.count('useRef(') + code.count('useRef<')} useRef calls")
    is_(f"{name}: Save still exists and Enter does not call it",
        "handleSave" in code and "advanceOnEnter(e, cardRef.current" in code
        and not re.search(r"if\s*\(!advanceOnEnter", code))
    # the checklist bench's OWN regexes, so this cannot drift from it
    is_(f"{name}: would satisfy 2026-11-24_req3_screens.mjs (autoFocus)",
        re.search(r"\bautoFocus\b", code) is not None)
    is_(f"{name}: would satisfy 2026-11-24_req3_screens.mjs (call)",
        re.search(r"advanceOnEnter\(", code) is not None)
    is_(f"{name}: would satisfy 2026-11-24_req3_screens.mjs (scoping)",
        re.search(r"advanceOnEnter\(e,\s*(\w+Ref\.current|e\.currentTarget)", code)
        is not None)


def main():
    global passed
    assert TOOL.is_file(), TOOL
    tmp = Path(tempfile.mkdtemp(prefix="req3profile-"))

    # ── 1. the happy paths ────────────────────────────────────────────────
    for fixture, name in ((FIX / "profile_2026-10-01.tsx", "A (2026-10-01)"),
                          (FIX / "profile_modern.tsx",     "B (patched since)")):
        before = fixture.read_text(encoding="utf-8")

        dry = tmp / f"dry-{fixture.name}"
        shutil.copy2(fixture, dry)
        rc, out = run(dry, "--dry-run")
        is_(f"{name}: --dry-run succeeds", rc == 0, out.strip()[:200])
        is_(f"{name}: --dry-run writes nothing",
            dry.read_text(encoding="utf-8") == before)
        is_(f"{name}: --dry-run names all four edits",
            all(k in out for k in ("1  import", "2  const cardRef",
                                   "3  card", "4  first box")), out[:200])

        live = tmp / fixture.name
        shutil.copy2(fixture, live)
        rc, out = run(live)
        is_(f"{name}: applies", rc == 0, out.strip()[:300])
        after = live.read_text(encoding="utf-8")
        is_(f"{name}: the file changed", after != before)
        is_(f"{name}: a backup was written",
            (tmp / (fixture.name + ".bak-2026-11-24")).is_file())
        check_applied(name, after)
        is_(f"{name}: every original line survives",
            all(l in after for l in before.splitlines() if l.strip()
                and 'className="create-exam-form"' not in l
                and '<input id="first-name"' not in l),
            "the patch dropped a line it was not asked to touch")

        # ── 2. refuses to run twice ───────────────────────────────────────
        rc, out = run(live)
        is_(f"{name}: refuses a second run", rc == 2 and "already" in out.lower(),
            out.strip()[:200])
        is_(f"{name}: the second run changed nothing",
            live.read_text(encoding="utf-8") == after)

    # ── 3. refusals: every anchor, one at a time ──────────────────────────
    base = (FIX / "profile_modern.tsx").read_text(encoding="utf-8")
    MUTATIONS = [
        ("the auth import is gone",
         'import { getToken, isAuthenticated } from "@/lib/auth";',
         'import { getToken } from "@/lib/auth";\nimport { isAuthenticated } from "@/lib/auth";'),
        ("fileRef is declared differently",
         "  const fileRef = useRef<HTMLInputElement>(null);",
         "  const fileRef = useRef<HTMLInputElement | null>(null);"),
        ("the card has another attribute on its line",
         '            <div className="create-exam-form">',
         '            <div className="create-exam-form" id="profile-card">'),
        ("the first box is on one line with its label",
         '              <input id="first-name" className="form-input" value={firstName} disabled={saving}',
         '              <input className="form-input" id="first-name" value={firstName} disabled={saving}'),
        ("there are two cards at the same indent",
         '            <div className="create-exam-form">',
         '            <div className="create-exam-form">\n            <div className="create-exam-form">'),
        # NOT the same test.  Two cards at the SAME indent are also caught by
        # the replace loop's `out.count(old) != 1` guard, so that case passes
        # even with the regex uniqueness check removed - measured: the
        # mutation "anchors no longer have to be unique" survived until this
        # line existed.  A tab-indented twin gives the regex two DIFFERENT
        # matched strings, each unique in the file, and only the
        # `len(ms) != 1` check stands between that and a silent half-patch.
        ("there are two cards, one indented with a tab",
         '            <div className="create-exam-form">',
         '\t<div className="create-exam-form">\n            <div className="create-exam-form">'),
    ]
    for why, old, new in MUTATIONS:
        assert base.count(old) == 1, why
        p = tmp / f"mut-{abs(hash(why))}.tsx"
        text = base.replace(old, new, 1)
        p.write_text(text, encoding="utf-8")
        rc, out = run(p)
        is_(f"REFUSES when {why}", rc == 2 and "REFUSED" in out, out.strip()[:200])
        is_(f"REFUSES when {why}: and writes nothing",
            p.read_text(encoding="utf-8") == text
            and not list(tmp.glob(p.name + ".bak*")))

    # ── 4. refuses the OTHER page.tsx ─────────────────────────────────────
    # The real setup screen, under a NEUTRAL name.  This check used to live in
    # a temp file called setup-page.tsx and asserted "SETUP" in the output -
    # which the path itself satisfied, so it passed with the fingerprint check
    # deleted.  A control that its own filename can satisfy is not a control.
    setup = ROOT / "frontend/src/app/setup/page.tsx"
    if setup.is_file():
        p = tmp / "other-screen.tsx"
        shutil.copy2(setup, p)
        rc, out = run(p)
        is_("REFUSES the setup screen — both files are called page.tsx",
            rc == 2 and "does not look like Edit Profile" in out,
            out.strip()[:200])
    else:
        failed.append("setup/page.tsx is not in the tree, so that control did not run")

    # And the case FINGERPRINT_MUST_NOT is actually for: a file that passes the
    # must-have fingerprint and is still the wrong screen, which is what a
    # copy-paste between the two page.tsx files produces.
    hybrid = base.replace("<h1 className=\"page-title\">Edit Profile</h1>",
                          "<h1 className=\"page-title\">Set up your profile</h1>", 1)
    is_("the hybrid fixture is built", hybrid != base)
    p = tmp / "hybrid.tsx"
    p.write_text(hybrid, encoding="utf-8")
    rc, out = run(p)
    is_("REFUSES a file carrying BOTH fingerprints",
        rc == 2 and "SETUP screen" in out, out.strip()[:200])
    is_("REFUSES a file carrying BOTH fingerprints: and writes nothing",
        p.read_text(encoding="utf-8") == hybrid)

    # ── 5. NEGATIVE CONTROL: the checks above must be able to fail ────────
    # A plausible WRONG wiring — the walk unscoped — must not pass them.
    bad = base.replace('            <div className="create-exam-form">',
                       '            <div className="create-exam-form" ref={cardRef}\n'
                       '              onKeyDown={e => { advanceOnEnter(e, document); }}>', 1)
    bad = bad.replace('              <input id="first-name"',
                      '              <input autoFocus id="first-name"', 1)
    bad = bad.replace('import { getToken, isAuthenticated } from "@/lib/auth";',
                      'import { getToken, isAuthenticated } from "@/lib/auth";\n'
                      'import { advanceOnEnter } from "@/lib/formNav";', 1)
    before_fail, before_pass = len(failed), passed
    check_applied("CONTROL(unscoped)", bad)
    caught = failed[before_fail:]
    del failed[before_fail:]              # its failures are the POINT, not a result
    passed = before_pass                  # and its passes are not credit either
    is_("CONTROL: an unscoped Enter walk is REJECTED by the checks above",
        any("scoped to the card" in c for c in caught),
        "the post-conditions passed a wiring that lets Enter jump across the "
        "whole page — they are not testing what they claim to")

    # ── 6. it type-checks ─────────────────────────────────────────────────
    # BEFORE vs AFTER, not "zero errors".  This bench tree's Navbar.tsx and
    # types/profile.ts are not Grace's - they have no PROFILE_UPDATED_EVENT and
    # no COLLEGE_OPTIONS - so the fixture reports five errors whether it is
    # patched or not.  Blaming those on the patch would be a red herring; the
    # question is whether the patch ADDS one.  Line numbers move when four
    # lines are inserted, so they are dropped and the messages compared.
    tsc = ROOT / "frontend/node_modules/typescript/bin/tsc"
    dest = ROOT / "frontend/src/app/(dashboard)/profile"
    if tsc.is_file():
        dest.mkdir(parents=True, exist_ok=True)

        def tsc_errors(src):
            shutil.copy2(src, dest / "page.tsx")
            r = subprocess.run(["node", str(tsc), "--noEmit", "-p",
                                str(ROOT / "tsconfig.json")],
                               capture_output=True, text=True, cwd=ROOT)
            out = []
            for l in (r.stdout + r.stderr).splitlines():
                if "profile/page.tsx" in l:
                    out.append(re.sub(r"\(\d+,\d+\)", "", l).strip())
            return out

        before_errs = tsc_errors(FIX / "profile_modern.tsx")
        after_errs  = tsc_errors(tmp / "profile_modern.tsx")
        added   = [e for e in after_errs if e not in before_errs]
        is_("the patch adds no type error", not added, "\n    ".join(added[:6]))
        is_("CONTROL: tsc really is looking at this file",
            len(before_errs) > 0 or len(after_errs) > 0,
            "tsc reported nothing at all for profile/page.tsx, so a type error "
            "there would not have been seen either")
        is_("the patch fixes nothing by accident either",
            all(e in after_errs for e in before_errs),
            "an error disappeared, which means the patch changed more than the "
            "four lines it claims")
        (dest / "page.tsx").unlink()
        try:
            dest.rmdir()
        except OSError:
            pass
    else:
        failed.append("tsc is not in this tree, so the typecheck did not run")

    shutil.rmtree(tmp, ignore_errors=True)

    print()
    print(f"  {passed} passed, {len(failed)} failed")
    if failed:
        print()
        for f in failed:
            print("  FAIL  " + f)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()