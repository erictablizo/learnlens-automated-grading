#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
measure/2026-11-24_recheck_all.py                                 2026-11-24
============================================================================
Proves apply_2026-11-24_recheck_all.py — the "Re-check all papers" button
Sir Alex Passion asked for at 8:09 AM.

WHAT THIS CAN AND CANNOT SAY
  CAN     the tool applies, lands code that compiles, and REFUSES every file
          it should refuse
  CANNOT  that the button works in a browser. There is no Chromium harness
          for the View Exam page — it needs usePapers, PapersTable,
          AnswerTable, BatchUploadModal and ConfirmDialog, none of which are
          in this tree. Stated rather than implied.
  CANNOT  that it will apply to Grace's file. The fixture is this tree's
          copy, which is 879 lines where hers is longer. That is WHY the
          tool refuses instead of guessing.

    python measure/2026-11-24_recheck_all.py
"""
import re, shutil, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOOL = ROOT / "apply_2026-11-24_recheck_all.py"
FIX  = ROOT / "fixtures/view_exam_pre_recheck.tsx"

passed = 0
failed = []
def is_(label, cond, detail=""):
    global passed
    if cond: passed += 1
    else: failed.append(f"{label}: {detail}" if detail else label)

def run(path, *extra):
    r = subprocess.run([sys.executable, "-I", str(TOOL), *extra, str(path)],
                       capture_output=True, text=True)
    return r.returncode, r.stdout + r.stderr

def strip(s):
    s = re.sub(r"\{/\*[\s\S]*?\*/\}", "", s)
    s = re.sub(r"/\*[\s\S]*?\*/", "", s)
    return re.sub(r"^\s*//.*$", "", s, flags=re.M)

def main():
    assert TOOL.is_file() and FIX.is_file(), "need the tool and the fixture"
    tmp = Path(tempfile.mkdtemp(prefix="recheck-"))
    before = FIX.read_text(encoding="utf-8")

    dry = tmp / "dry.tsx"; shutil.copy2(FIX, dry)
    rc, out = run(dry, "--dry-run")
    is_("--dry-run succeeds", rc == 0, out.strip()[:200])
    is_("--dry-run writes nothing", dry.read_text(encoding="utf-8") == before)
    is_("--dry-run names all five edits",
        all(k in out for k in ("1  import", "2  re-check state", "3  handleRecheckAll",
                               "4  the button", "5  the confirmation dialog")))

    live = tmp / "page.tsx"; shutil.copy2(FIX, live)
    rc, out = run(live)
    is_("applies", rc == 0, out.strip()[:300])
    after = live.read_text(encoding="utf-8")
    code = strip(after)

    # ── post-conditions, written here INDEPENDENTLY of the tool's own ──────
    is_("the handler landed", "const handleRecheckAll = async () => {" in code)
    is_("the loop is SEQUENTIAL, not Promise.all",
        "for (const p of papers) {" in code and "Promise.all" not in code,
        "a parallel run would queue on the server and have no honest progress")
    is_("it grades through the existing service",
        "paperService.grade(examId, p.paper_id, token)" in code)
    is_("a failed paper does not abort the run",
        re.search(r"catch \{\s*failed\+\+;", code) is not None,
        "one unreadable paper would leave the rest unchecked")
    is_("the stop flag is a ref, read inside the loop",
        "recheckStop = useRef(false)" in code
        and "if (recheckStop.current) break;" in code,
        "a state read inside a running async loop sees a stale value, so Stop "
        "would do nothing until the run finished")
    is_("the list is reloaded afterwards", "await fetchPapers();" in code)
    is_("the dialog states the time cost",
        "40 seconds per page" in after)
    is_("THE WARNING: the dialog says hand corrections are lost",
        "corrected by hand" in after,
        "re-checking overwrites paper_scores, including answers the teacher "
        "fixed through AnswerTable — a teacher must be told before, not after")
    is_("the dialog points at the cheaper path",
        "edit that item instead" in after,
        "editing one key item cascades and PRESERVES corrections; the dialog "
        "should say so")
    is_("the button hides rather than greys when there are no papers",
        "papers.length > 0 && (" in code)
    is_("the button becomes Stop while running",
        "if (recheckBusy) recheckStop.current = true;" in code)
    is_("nothing else in the row was disturbed",
        after.count("Download Excel") == before.count("Download Excel")
        and after.count("Upload class papers") == before.count("Upload class papers")
        and after.count("Data Analytics") == before.count("Data Analytics"))
    is_("every original line survives",
        all(l in after for l in before.splitlines()
            if l.strip() and "useEffect, useState, useCallback" not in l),
        "the patch dropped a line it was not asked to touch")

    # ── refuses a second run ──────────────────────────────────────────────
    rc, out = run(live)
    is_("refuses a second run", rc == 2 and "already" in out.lower(), out[:160])

    # ── refusals, one anchor at a time ────────────────────────────────────
    MUT = [
      ("the react import has another hook",
       'import { useEffect, useState, useCallback } from "react";',
       'import { useEffect, useState, useCallback, useMemo } from "react";'),
      ("the checking state moved",
       "  // Grading\n  const [checking, setChecking] = useState(false);",
       "  const [checking, setChecking] = useState(false);  // Grading"),
      ("the Download Excel button is formatted differently",
       '            <Button variant="secondary" onClick={handleDownloadExcel} disabled={downloading}',
       '            <Button onClick={handleDownloadExcel} variant="secondary" disabled={downloading}'),
      ("the delete-dialog comment is gone",
       "        {/* ── Delete confirm dialog ── */}", "        {/* delete */}"),
    ]
    for why, old, new in MUT:
        assert before.count(old) == 1, why
        p = tmp / f"m{abs(hash(why))}.tsx"
        text = before.replace(old, new, 1)
        p.write_text(text, encoding="utf-8")
        rc, out = run(p)
        is_(f"REFUSES when {why}", rc == 2 and "REFUSED" in out, out.strip()[:160])
        is_(f"REFUSES when {why}: and writes nothing",
            p.read_text(encoding="utf-8") == text)

    # ── refuses a file that is not this screen ────────────────────────────
    other = ROOT / "frontend/src/components/exams/CreateExamForm.tsx"
    if other.is_file():
        p = tmp / "not-view-exam.tsx"; shutil.copy2(other, p)
        rc, out = run(p)
        is_("REFUSES a different screen",
            rc == 2 and "does not look like the View Exam page" in out, out[:160])
    else:
        failed.append("CreateExamForm.tsx missing, so that control did not run")

    # ── NEGATIVE CONTROL: the checks above must be able to fail ───────────
    bad = after.replace("for (const p of papers) {",
                        "await Promise.all(papers.map(async (p) => {", 1)
    before_fail, before_pass = len(failed), passed
    bcode = strip(bad)
    is_("CONTROL(parallel): sequential check", "for (const p of papers) {" in bcode
        and "Promise.all" not in bcode)
    caught = failed[before_fail:]
    del failed[before_fail:]
    globals()["passed"] = before_pass
    is_("CONTROL: a parallel rewrite IS rejected by the checks above",
        len(caught) == 1,
        "the post-conditions accept Promise.all, so the sequential claim is "
        "not actually tested")

    shutil.rmtree(tmp, ignore_errors=True)
    print()
    print(f"  {passed} passed, {len(failed)} failed")
    if failed:
        print()
        for f in failed: print("  FAIL  " + f)
    sys.exit(1 if failed else 0)

if __name__ == "__main__":
    main()