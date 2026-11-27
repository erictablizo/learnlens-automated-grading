#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
measure/2026-11-27_specimen_removed_mutations.py                  2026-11-27
============================================================================

Breaks the tree on purpose, AFTER the removal, and requires
measure/2026-11-27_specimen_removed.py to FAIL on each.

    python measure/2026-11-27_specimen_removed_mutations.py

MOST OF THESE MUTATIONS REMOVE TOO MUCH, which is the failure this whole
bench exists for. Taking out `ocr_correction_samples` along with
`ocr_corrections` does not raise: the "Corrections by teacher" panel goes on
rendering, with a column of zeroes. M1, M2, M3 and M8 are that failure in
four shapes, and each must be caught.

The rest break the two functions that were carried across the split, which
is the other way this could have gone wrong quietly: the text moves, the
behaviour does not survive the move.

It writes to the real files and restores them in a `finally`, recovering any
`.mutbak` left by an interrupted run BEFORE it reads the originals - or the
mutant becomes the baseline, which has happened.
"""
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT  = Path(__file__).resolve().parent.parent
BENCH = ROOT / "measure/2026-11-27_specimen_removed.py"

CS   = ROOT / "backend/app/services/correction_service.py"
MOD  = ROOT / "backend/app/models/models.py"
REG  = ROOT / "backend/app/api/routes/__init__.py"
PAS  = ROOT / "backend/app/services/paper_answer_service.py"
PAGE = ROOT / "frontend/src/app/(dashboard)/admin/page.tsx"

TARGETS = [CS, MOD, REG, PAS, PAGE]
COUNT_RE = re.compile(r"(\d+) passed, (\d+) failed")

# (target, why, old, new).  new=None means "append old to the file" - for the
# mutations that put something BACK.
MUTATIONS = [
    (MOD, "M1 the removal took ocr_correction_samples with it - the panel "
          "renders zeroes and nothing raises",
     "class OCRCorrectionSample(Base):", "class _RemovedTooMuch(Base):"),

    (MOD, "M2 the samples TABLE NAME goes, so a fresh create_all() database "
          "has nowhere to record what teachers overruled",
     '__tablename__ = "ocr_correction_samples"',
     '__tablename__ = "ocr_corrections_v2"'),

    (REG, "M3 the teacher-corrections router is unregistered along with the "
          "specimen one - Ms. Melanie's page 19 requirement 1 goes dark",
     # The registration line, not the bare name: the name appears on the
     # import line too, and an anchor that matches twice is reported as not
     # applied rather than run.
     "router.include_router(admin_teacher_corrections_router)",
     "# router.include_router(admin_teacher_corrections_router)"),

    (CS, "M4 build_sample does not survive the split, so every override "
         "stops being recorded",
     "def build_sample(", "def build_sample_REMOVED("),

    (CS, "M5 norm_seen stops upper-casing, so 'a' and 'A' read as a real "
         "correction and one teacher's typing manufactures evidence",
     'return (v or "").strip().upper()', 'return (v or "").strip()'),

    (CS, "M6 the confidence check goes, so an ALREADY corrected item counts "
         "as evidence about the reader",
     "    if confidence is None:\n        return False\n", ""),

    (CS, "M7 the blank-glyph refusal goes, so an unanswered item becomes a "
         "labelled training pair",
     "    if a == norm_seen(BLANK) or b == norm_seen(BLANK):\n"
     "        return False\n", ""),

    (CS, "M8 the contested-reading refusal goes, so 'A|B' is recorded as "
         "one mark",
     "    if CONTESTED_SEP in a or CONTESTED_SEP in b:\n        return False\n",
     ""),

    (CS, "M9 the truncation goes, so a reading longer than the column "
         "raises on insert instead of being cut",
     '        seen=(seen or "").strip()[:100],\n'
     '        means=(means or "").strip()[:100],',
     '        seen=(seen or "").strip(),\n'
     '        means=(means or "").strip(),'),

    (CS, "M10 a piece of the withdrawn feature survives the split",
     "def norm_seen(v: str) -> str:",
     "def apply_corrections(detected, corrections):\n"
     "    return detected, []\n\n\ndef norm_seen(v: str) -> str:"),

    (PAS, "M11 overriding an answer stops recording the pair, so the panel "
          "never gains another row",
     "from app.services.correction_service import build_sample",
     "from app.services.correction_service import norm_seen"),

    (PAGE, "M12 the panel is still on the admin screen",
     "      <ManageUsers />", "      <ManageUsers />\n      <SpecimenCorrections />"),
]


def run_bench():
    env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")
    r = subprocess.run([sys.executable, "-B", str(BENCH)],
                       capture_output=True, text=True, env=env, cwd=str(ROOT))
    m = None
    for line in r.stdout.splitlines():
        hit = COUNT_RE.search(line)
        if hit:
            m = hit
    if m is None:
        last = (r.stdout.strip().splitlines() or [""])[-1]
        err = (r.stderr.strip().splitlines() or ["no stderr"])[-1]
        return "crashed", f"no count line; last line: {(last or err)[:110]}"
    npass, nfail = int(m.group(1)), int(m.group(2))
    named = [l.strip() for l in r.stdout.splitlines() if l.strip().startswith("FAIL")]
    if r.returncode == 0 and nfail == 0:
        return "clean", f"{npass} passed, 0 failed"
    if nfail == 0:
        return "crashed", f"{npass} passed, 0 failed but exit {r.returncode}"
    return "failed", f"{nfail} failed: {named[0][6:] if named else '(unnamed)'}"


def main():
    for f in [BENCH] + TARGETS:
        if not f.is_file():
            print(f"  MISSING: {f.relative_to(ROOT)}")
            print("  Run apply_2026-11-27_specimen_removal.py --apply first.")
            sys.exit(2)

    for t in TARGETS:
        bak = t.with_suffix(t.suffix + ".mutbak")
        if bak.is_file():
            print(f"  recovered a .mutbak left by an earlier run: {t.name}")
            shutil.copy2(bak, t)
            bak.unlink()
    for d in (ROOT / "backend").rglob("__pycache__"):
        shutil.rmtree(d, ignore_errors=True)

    original = {t: t.read_bytes() for t in TARGETS}

    verdict, detail = run_bench()
    if verdict != "clean":
        print(f"REFUSING TO RUN: the bench {verdict} on the unmutated tree.")
        print(f"  {detail}")
        sys.exit(2)
    print(f"  baseline clean  ({detail})")
    print(f"  {len(MUTATIONS)} mutations across {len(TARGETS)} files")

    survived, crashed = [], []
    try:
        for target, why, old, new in MUTATIONS:
            label = " ".join(why.split())
            src = original[target].decode("utf-8")
            text = src.replace("\r\n", "\n")
            if text.count(old) != 1:
                survived.append(f"{label}\n      [DID NOT APPLY: anchor found "
                                f"{text.count(old)} times]")
                continue
            mutated = text.replace(old, new, 1)
            if "\r\n" in src:
                mutated = mutated.replace("\n", "\r\n")
            target.write_bytes(mutated.encode("utf-8"))
            for d in (ROOT / "backend").rglob("__pycache__"):
                shutil.rmtree(d, ignore_errors=True)
            verdict, detail = run_bench()
            if verdict == "failed":
                print(f"  caught: {label}\n            -> {detail[:150]}")
            elif verdict == "crashed":
                crashed.append(f"{label}\n      [CRASHED: {detail}]")
            else:
                survived.append(f"{label}\n      [SURVIVED: {detail}]")
            target.write_bytes(original[target])
    finally:
        for t in TARGETS:
            t.write_bytes(original[t])
        for d in (ROOT / "backend").rglob("__pycache__"):
            shutil.rmtree(d, ignore_errors=True)

    print("\n=== restored ===")
    verdict, detail = run_bench()
    print(f"  {detail}")
    if verdict != "clean":
        print("  THE RESTORE DID NOT TAKE. Do not trust the tree.")
        sys.exit(1)
    for title, rows in (("CRASHED THE BENCH", crashed),
                        ("THE BENCH DID NOT CATCH", survived)):
        if rows:
            print(f"\n{len(rows)} MUTATION(S) {title}:")
            for s in rows:
                print(f"  - {s}")
    if survived or crashed:
        sys.exit(1)
    print(f"\n  all {len(MUTATIONS)} mutations caught; every file restored "
          f"and verified")


if __name__ == "__main__":
    main()
