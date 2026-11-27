/**
 * measure/2026-11-27_majority_twins.mjs                          2026-11-27
 * ==========================================================================
 *
 * `frontend/src/lib/majorityWrong.ts` and `backend/app/ml/majority_wrong.py`
 * decide which items "the majority of the class got wrong", and print the
 * percentage next to each. This runs BOTH, on the same fixtures, and fails
 * if they disagree about anything.
 *
 * WHY THERE IS A PYTHON COPY AT ALL. Ms. Melanie, page 23 requirement 1: the
 * generated Excel must carry that section too, and the screen computes it in
 * the browser. The export has no browser.
 *
 * THE FIXTURES ARE THE BOUNDARIES, not the happy path:
 *
 *   * 2 of 4 — EXACTLY half, which is not a majority. `>=` passes this bench
 *     only if this fixture is here.
 *   * 51 of 101 — the case that forced one decimal. Rounded to a whole
 *     number it prints 50%, under a heading that promises more than 50%.
 *   * 13 of 16 — 812.5 tenths of a percent, landing EXACTLY on .5. JavaScript
 *     rounds half up (813 -> 81.3); Python's round() is banker's rounding and
 *     would give 81.2. Nothing else in these fixtures can tell those apart.
 *   * an item nobody has reached, and an item nobody got wrong.
 *
 * IT LOADS THE REAL FILES BY PATH and exits 2 if either is missing rather
 * than standing anything in for them.
 */
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const PY = join(ROOT, "backend/app/ml/majority_wrong.py");
const TS = join(ROOT, "frontend/src/lib/majorityWrong.ts");

for (const f of [PY, TS]) {
  if (!existsSync(f)) {
    console.error(`MISSING: ${f}`);
    console.error("This bench runs both real files; it does not stub either.");
    process.exit(2);
  }
}

/* ── the page is a caller too, and it must not keep its own copy ──────────
 * The rule lived inside analytics/page.tsx until today. If the import were
 * dropped and the two consts pasted back, every check below would still
 * pass while the screen and the file drifted apart - so the one thing this
 * bench cannot learn from running the modules is asserted here instead. */
const PAGE = join(ROOT, "frontend/src/app/(dashboard)/analytics/page.tsx");
const pageSrc = existsSync(PAGE) ? readFileSync(PAGE, "utf8") : null;

const it = (question_number, answered, correct, wrong) =>
  ({ question_number, answered, correct, wrong, blank: 0, review: 0 });

const FIXTURES = [
  { why: "the ordinary case - one item over the line, two under",
    items: [it(1, 6, 5, 1), it(2, 6, 2, 4), it(3, 6, 6, 0)] },

  { why: "EXACTLY half is not a majority (2 of 4)",
    items: [it(1, 4, 2, 2), it(2, 4, 1, 3)] },

  { why: "one more than half, on the smallest class that can have one",
    items: [it(1, 3, 1, 2), it(2, 2, 1, 1)] },

  { why: "an item nobody has reached cannot be a majority of nobody",
    items: [it(1, 0, 0, 0), it(2, 5, 1, 4)] },

  { why: "nobody got anything wrong - the empty, good outcome",
    items: [it(1, 5, 5, 0), it(2, 5, 5, 0)] },

  { why: "every item missed by everyone",
    items: [it(1, 5, 0, 5), it(2, 5, 0, 5)] },

  { why: "no items at all", items: [] },

  { why: "INPUT ORDER IS KEPT, not sorted by question number",
    items: [it(12, 6, 0, 6), it(3, 6, 0, 6), it(7, 6, 1, 5)] },

  { why: "101 papers, the smallest majority there is",
    items: [it(1, 101, 50, 51), it(2, 101, 51, 50)] },

  { why: "part-graded items are judged on their own denominators",
    items: [it(1, 3, 1, 2), it(2, 40, 30, 10)] },

  /* A ROW THAT CANNOT HAPPEN, and it is here on purpose. analytics_service
   * builds `answered` from the results it counted, so wrong > 0 with
   * answered == 0 is not a state the system produces - which is exactly why
   * it is the only fixture that can falsify the `answered > 0` guard. With
   * the guard, both sides say no; without it on one side only, they
   * disagree and this bench says so. Agreement on garbage is the property
   * being measured, not a claim that the garbage is reachable. */
  { why: "a row claiming wrong answers with nobody having answered",
    items: [it(1, 0, 0, 2), it(2, 4, 1, 3)] },
];

/* wrong_percent is exercised directly as well as through the filter: the
 * rounding cases that matter are not all majorities, and a bench that could
 * only reach the formatter through the predicate could not test them. */
const PERCENT_CASES = [
  [51, 101],   // 50.5  - the reason there is a decimal at all
  [13, 16],    // 81.25 -> 812.5 tenths: half rounds UP, to 81.3
  [1, 16],     //  6.25 -> 62.5 tenths: the same tie, below the line
  [3, 4],      // 75    - and it must print "75%", not "75.0%"
  [2, 2],      // 100
  [7, 9],      // 77.77...
  [1, 3],      // 33.33...
  [2, 3],      // 66.66...
  [1, 1000],   //  0.1  - the smallest this can print
  [999, 1000], // 99.9
];

/* ── TypeScript, with no new dependency ──────────────────────────────────
 * frontend/node_modules/typescript is already there (frontend/tsxsyntax.js
 * uses it) and transpileModule is enough because this lib imports nothing.
 * esbuild is NOT used: it is in no package.json this repo ships, and a
 * bench that cannot run on Grace's machine is not checking anything. */
const require_ = createRequire(import.meta.url);
let tsc;
for (const where of [join(ROOT, "frontend/node_modules/typescript"), "typescript"]) {
  try { tsc = require_(where); break; } catch { /* try the next */ }
}
if (!tsc) {
  console.error("MISSING: typescript. Run `npm install` in frontend/ first.");
  process.exit(2);
}

const js = tsc.transpileModule(readFileSync(TS, "utf8"), {
  compilerOptions: {
    target: tsc.ScriptTarget.ES2020,
    module: tsc.ModuleKind.ESNext,
  },
}).outputText;
if (/\bimport\b/.test(js)) {
  console.error("FATAL: majorityWrong.ts now imports something; this bench "
              + "transpiles one file and cannot resolve it.");
  process.exit(2);
}
const dir = mkdtempSync(join(tmpdir(), "majority-"));
const mod = join(dir, "majorityWrong.mjs");
writeFileSync(mod, js);
const ts = await import(pathToFileURL(mod).href);
for (const needed of ["isMajorityWrong", "majorityWrong", "wrongPercent"]) {
  if (typeof ts[needed] !== "function") {
    console.error(`FATAL: majorityWrong.ts has no ${needed}.`);
    process.exit(2);
  }
}

const fromTs = {
  rows: FIXTURES.map(f => ts.majorityWrong(f.items).map(r => r.question_number)),
  flags: FIXTURES.map(f => f.items.map(r => ts.isMajorityWrong(r))),
  pcts: PERCENT_CASES.map(([w, a]) => ts.wrongPercent(w, a)),
};

// ── the Python side ───────────────────────────────────────────────────────
const driver = join(dir, "driver.py");
writeFileSync(driver, `
import importlib.util, json, os, sys, types

# app.ml.majority_wrong imports app.ml.statistics, so the real package root
# goes on sys.path and the real module is imported - not loaded headless
# from a path with a stand-in for its own dependency.
root = sys.argv[1]
sys.path.insert(0, root)
try:
    import app.ml.majority_wrong as m
except Exception as e:
    # The likeliest failure on a machine other than the one this was written
    # on, and it should say so rather than printing a bare traceback: the
    # import pulls in app/__init__.py and app/ml/__init__.py, and whatever
    # THEY import. Run it from the backend venv.
    print("IMPORT FAILED: " + type(e).__name__ + ": " + str(e), file=sys.stderr)
    print("  importing app.ml.majority_wrong needs the backend's own "
          "dependencies;", file=sys.stderr)
    print("  activate the backend venv (or set PYTHON= to its python) and "
          "run again.", file=sys.stderr)
    raise SystemExit(3)

payload = json.load(sys.stdin)
out = {
    "rows": [[r["question_number"] for r in m.majority_wrong(f["items"])]
             for f in payload["fixtures"]],
    "flags": [[m.is_majority_wrong(r) for r in f["items"]]
              for f in payload["fixtures"]],
    "pcts": [m.wrong_percent(w, a) for w, a in payload["percents"]],
    "refuses_zero": None,
}
try:
    m.wrong_percent(1, 0)
    out["refuses_zero"] = False
except ValueError:
    out["refuses_zero"] = True
except ZeroDivisionError:
    out["refuses_zero"] = "ZeroDivisionError"
print(json.dumps(out))
`);

/* ── NO STALE BYTECODE ────────────────────────────────────────────────────
 * On 2026-11-24 a bench reported failures on a clean tree because a mutation
 * harness had restored a file whose replacement was the same length, and
 * CPython reused the .pyc it had written for the mutant. Nothing here may
 * run against bytecode older than the source. */
function noStaleBytecode(cmd) {
  const probe = spawnSync(cmd, ["-I", "-c",
    "import os,sys,glob\n"
    + "root = sys.argv[1]\n"
    + "bad = []\n"
    + "for d, _, fs in os.walk(root):\n"
    + "    if '__pycache__' not in d: continue\n"
    + "    for f in fs:\n"
    + "        if not f.endswith('.pyc'): continue\n"
    + "        src = os.path.join(os.path.dirname(d), f.split('.')[0] + '.py')\n"
    + "        p = os.path.join(d, f)\n"
    + "        if os.path.exists(src) and os.path.getmtime(p) < os.path.getmtime(src):\n"
    + "            bad.append(p)\n"
    + "print('\\n'.join(bad))\n",
    join(ROOT, "backend/app")], { encoding: "utf8" });
  const stale = String(probe.stdout || "").trim();
  if (stale) {
    console.error("STALE BYTECODE - delete these and run again:\n" + stale);
    process.exit(2);
  }
}

function pythonCmd() {
  const tried = [];
  for (const cmd of [process.env.PYTHON, "python3", "python", "py"].filter(Boolean)) {
    let probe;
    try {
      probe = spawnSync(cmd, ["-c", "import sys;print(sys.version_info[0])"],
                        { encoding: "utf8" });
    } catch (e) { tried.push(`${cmd}: ${e.code || e.message}`); continue; }
    if (probe.status === 0 && String(probe.stdout || "").trim() === "3") return cmd;
    tried.push(`${cmd}: ${probe.error ? (probe.error.code || probe.error.message)
                                      : "exit " + probe.status}`);
  }
  console.error("MISSING: no Python 3 on PATH. Tried - " + tried.join("; "));
  console.error("If it is installed under another name, set PYTHON=<name>.");
  process.exit(2);
}

const cmd = pythonCmd();
noStaleBytecode(cmd);
const py = spawnSync(cmd, ["-I", "-B", driver, join(ROOT, "backend")], {
  input: JSON.stringify({ fixtures: FIXTURES, percents: PERCENT_CASES }),
  encoding: "utf8",
});
if (py.status !== 0) {
  console.error("FATAL: could not run app/ml/majority_wrong.py.\n" + (py.stderr || ""));
  process.exit(2);
}
let pyOut;
try { pyOut = JSON.parse(py.stdout); }
catch {
  console.error("FATAL: the Python driver printed no JSON.\n" + py.stdout);
  process.exit(2);
}

// ── compare ───────────────────────────────────────────────────────────────
let passed = 0;
const failed = [];
const check = (label, cond, detail = "") => {
  if (cond) passed++;
  else failed.push(detail ? `${label}: ${detail}` : label);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

if (pyOut.rows.length !== FIXTURES.length || pyOut.pcts.length !== PERCENT_CASES.length) {
  console.error("FATAL: Python returned a different number of results.");
  process.exit(2);
}

FIXTURES.forEach((f, i) => {
  check(`[${i + 1}] ${f.why} — the same rows`,
        same(fromTs.rows[i], pyOut.rows[i]),
        `ts ${JSON.stringify(fromTs.rows[i])} vs py ${JSON.stringify(pyOut.rows[i])}`);
  check(`[${i + 1}] ${f.why} — the same verdict per item`,
        same(fromTs.flags[i], pyOut.flags[i]),
        `ts ${JSON.stringify(fromTs.flags[i])} vs py ${JSON.stringify(pyOut.flags[i])}`);
});

PERCENT_CASES.forEach(([w, a], i) => {
  check(`[%${i + 1}] ${w} of ${a} prints the same`,
        fromTs.pcts[i] === pyOut.pcts[i],
        `ts "${fromTs.pcts[i]}" vs py "${pyOut.pcts[i]}"`);
});

// ── the fixtures must be the boundaries they claim to be ─────────────────
check("CONTROL: 2 of 4 is excluded by BOTH",
      fromTs.flags[1][0] === false && pyOut.flags[1][0] === false);
check("CONTROL: 3 of 4 is included by BOTH",
      fromTs.flags[1][1] === true && pyOut.flags[1][1] === true);
check("CONTROL: 51 of 101 prints 50.5%, not 50%",
      fromTs.pcts[0] === "50.5%" && pyOut.pcts[0] === "50.5%",
      `ts "${fromTs.pcts[0]}" py "${pyOut.pcts[0]}"`);
check("CONTROL: a .5 tie rounds UP (13 of 16 -> 81.3%)",
      fromTs.pcts[1] === "81.3%" && pyOut.pcts[1] === "81.3%",
      `ts "${fromTs.pcts[1]}" py "${pyOut.pcts[1]}"`);
check("CONTROL: a whole percentage keeps no .0 (3 of 4 -> 75%)",
      pyOut.pcts[3] === "75%", pyOut.pcts[3]);
check("CONTROL: some fixture returns rows and some returns none",
      pyOut.rows.some(r => r.length > 0) && pyOut.rows.some(r => r.length === 0));
check("CONTROL: the order fixture would fail if either side sorted",
      same(pyOut.rows[7], [12, 3, 7]), JSON.stringify(pyOut.rows[7]));
check("CONTROL: wrong_percent refuses answered = 0 instead of dividing",
      pyOut.refuses_zero === true, String(pyOut.refuses_zero));

// ── and the screen must still be a caller, not a second copy ─────────────
if (pageSrc === null) {
  failed.push("analytics/page.tsx is not in this tree, so the two checks "
            + "that it imports the rule rather than keeping its own copy "
            + "could not run");
} else {
  check("the page IMPORTS the rule from @/lib/majorityWrong",
        /from\s+"@\/lib\/majorityWrong"/.test(pageSrc));
  check("the page no longer defines its own isMajorityWrong/wrongPercent",
        !/^const\s+(isMajorityWrong|wrongPercent)\s*=/m.test(pageSrc));
}

console.log();
console.log(`  ${passed} passed, ${failed.length} failed`
          + "   [rev 2026-11-27a — both real files, no esbuild, probes for Python]");
if (failed.length) {
  console.log();
  for (const f of failed) console.log("  FAIL  " + f);
}
console.log();
console.log("  one rule, two implementations, the same fixtures.");
process.exit(failed.length ? 1 : 0);
