#!/usr/bin/env node
/**
 * measure/2026-11-23_stats_twins.mjs
 * ==================================
 *
 * `backend/app/ml/statistics.py` and `frontend/src/lib/scoreStats.ts` compute
 * the same three numbers for Ms. Melanie's requirement 9. This runs BOTH, on
 * the same fixtures, and fails if they disagree about anything.
 *
 * WHY THIS BENCH EXISTS. The screen computes the statistics in the browser,
 * for the reason written at the top of scoreStats.ts. The Python module stays
 * because the Excel export will want the same numbers without a browser. Two
 * implementations of one definition is a liability unless something holds
 * them together, and reading them side by side is not that something — this
 * is. It caught nothing on the day it was written, which is the point: it is
 * for the day somebody changes one of them.
 *
 * THE ROUNDING IS THE WHOLE RISK. Python's round(x, 1) breaks an exact tie to
 * the even digit; JavaScript's Math.round breaks it upward. A mean of 48.25
 * is 48.2 in Python and 48.3 under Math.round, and both numbers can appear on
 * one screen. Fixture 7 below is exactly that case.
 *
 *   node measure/2026-11-23_stats_twins.mjs
 *
 * Runs the REAL modules from the tree; exits 2 rather than measure a stand-in.
 */
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const PY = join(ROOT, "backend/app/ml/statistics.py");
const TS = join(ROOT, "frontend/src/lib/scoreStats.ts");

for (const f of [PY, TS]) {
  if (!existsSync(f)) {
    console.error(`FATAL: ${f} not found. Run this from the repository root.`);
    process.exit(2);
  }
}

/* The fixtures. Every one is a shape that actually occurs in a class list,
 * plus the two that only a bench would think of. */
const FIXTURES = [
  { why: "Grace's own screen: 7 students out of 65", xs: [65, 65, 63, 58, 44, 39, 21], outOf: 65 },
  { why: "every score distinct — there is NO mode",   xs: [10, 20, 30, 40], outOf: 40 },
  { why: "one mode",                                  xs: [10, 20, 20, 30], outOf: 30 },
  { why: "bimodal — BOTH modes are reported",         xs: [40, 40, 40, 55, 55, 55, 12], outOf: 60 },
  { why: "three modes",                               xs: [1, 1, 2, 2, 3, 3], outOf: 3 },
  { why: "a class of one HAS a mode",                 xs: [42], outOf: 50 },
  { why: "the rounding tie: mean 48.25 -> 48.2, not 48.3", xs: [48, 48, 49, 48], outOf: 65 },
  { why: "even count — the median averages the middle two", xs: [1, 2, 3, 4], outOf: 4 },
  { why: "a zero is a real score and counts",         xs: [0, 0, 10], outOf: 10 },
  { why: "an unchecked paper arrives as null and is DROPPED", xs: [10, null, 20], outOf: 20 },
  { why: "nothing to summarise at all",               xs: [], outOf: 65 },
  { why: "every paper unchecked",                     xs: [null, null], outOf: 65 },
];

// ---- the TypeScript side -------------------------------------------------

/* ── TypeScript, compiled WITHOUT a new dependency ────────────────────────
 *
 * This used esbuild, which is in no package.json this repo ships: it
 * happened to be installed where the bench was written and nowhere else, so
 * on 2026-11-26 it failed with ERR_MODULE_NOT_FOUND on Grace's machine. A
 * bench that cannot run is not checking anything, however green it looked
 * where it was written.
 *
 * frontend/node_modules/typescript is already there - frontend/tsxsyntax.js
 * uses it - and transpileModule is enough here because both of these lib
 * files import nothing, so there is no bundling to do.
 */
const require_ = createRequire(import.meta.url);
function loadTs() {
  let ts;
  for (const where of [join(ROOT, "frontend/node_modules/typescript"), "typescript"]) {
    try { ts = require_(where); break; } catch { /* try the next */ }
  }
  if (!ts) {
    console.error("MISSING: typescript. Run `npm install` in frontend/ first.");
    process.exit(2);
  }
  return ts;
}

const tmp = mkdtempSync(join(tmpdir(), "twins-"));
const bundle = join(tmp, "scoreStats.mjs");
const tsc = loadTs();
writeFileSync(bundle, tsc.transpileModule(readFileSync(TS, "utf8"), {
  compilerOptions: {
    target: tsc.ScriptTarget.ES2020,
    module: tsc.ModuleKind.ESNext,
  },
}).outputText);
const ts = await import(pathToFileURL(bundle).href);
for (const needed of ["summariseScores", "asRows", "modeText"]) {
  if (typeof ts[needed] !== "function") {
    console.error(`FATAL: scoreStats.ts has no ${needed}.`);
    process.exit(2);
  }
}

// ---- the Python side -----------------------------------------------------
const driver = join(tmp, "driver.py");
writeFileSync(driver, `
import importlib.util, json, os, sys, types
ROOT = sys.argv[1]
SRC = os.path.join(ROOT, "backend", "app", "ml", "statistics.py")
for name, path in (("app", os.path.join(ROOT, "backend", "app")),
                   ("app.ml", os.path.join(ROOT, "backend", "app", "ml"))):
    if name not in sys.modules:
        pkg = types.ModuleType(name); pkg.__path__ = [path]; sys.modules[name] = pkg
spec = importlib.util.spec_from_file_location("app.ml.statistics", SRC)
m = importlib.util.module_from_spec(spec); sys.modules["app.ml.statistics"] = m
spec.loader.exec_module(m)
out = []
for f in json.load(sys.stdin):
    s = m.summarise_scores(f["xs"], out_of=f["outOf"])
    out.append({
        "count": s.count, "mean": s.mean, "median": s.median,
        "mode": list(s.mode), "outOf": s.out_of,
        "modeText": s.mode_text(),
        "rows": [dict(r) for r in m.as_rows(s)],
    })
json.dump(out, sys.stdout)
`);

/* ── FINDING PYTHON, rather than assuming it ──────────────────────────────
 * This spawned "python3". On Windows that name is an App Execution Alias
 * that prints a Microsoft Store advertisement and fails, so on 2026-11-26
 * this bench died there while passing here - the second time in one day a
 * bench depended on something that happened to be true of my machine.
 *
 * Candidates are tried in order and the first that reports Python 3 wins.
 * PYTHON= overrides, for a venv under any other name. */
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

const py = spawnSync(pythonCmd(), ["-I", driver, ROOT],
                     { input: JSON.stringify(FIXTURES), encoding: "utf8" });
if (py.status !== 0) {
  console.error("FATAL: could not run app/ml/statistics.py.\n" + (py.stderr || ""));
  process.exit(2);
}
let fromPython;
try { fromPython = JSON.parse(py.stdout); }
catch { console.error("FATAL: the Python driver printed no JSON.\n" + py.stdout); process.exit(2); }

if (fromPython.length !== FIXTURES.length) {
  console.error("FATAL: Python returned a different number of results.");
  process.exit(2);
}

// ---- compare -------------------------------------------------------------
let passed = 0;
const failed = [];
const same = (label, a, b) => {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x === y) passed++;
  else failed.push(`${label}\n      TypeScript ${x}\n      Python     ${y}`);
};

FIXTURES.forEach((f, i) => {
  const p = fromPython[i];
  const t = ts.summariseScores(f.xs, f.outOf);
  same(`${f.why} — count`,  t.count,  p.count);
  same(`${f.why} — mean`,   t.mean,   p.mean);
  same(`${f.why} — median`, t.median, p.median);
  same(`${f.why} — mode`,   t.mode,   p.mode);
  same(`${f.why} — Mode cell`, ts.modeText(t), p.modeText);
  same(`${f.why} — the three rows`, ts.asRows(t), p.rows);
});

// ---- controls ------------------------------------------------------------
// Without these, a comparison of two modules that both return nothing would
// pass and prove nothing.
{
  const her = ts.summariseScores([65, 65, 63, 58, 44, 39, 21], 65);
  const r = ts.asRows(her);
  if (JSON.stringify(r.map(x => x.measure)) === JSON.stringify(["Mean", "Median", "Mode"])) passed++;
  else failed.push("CONTROL: the three rows are not in her order");
  if (r[0].value === "50.7" && r[1].value === "58" && r[2].value === "65") passed++;
  else failed.push(`CONTROL: her class reads ${JSON.stringify(r.map(x => x.value))}, not ["50.7","58","65"]`);

  // The tie, asserted outright on the TypeScript side so the fixture cannot
  // quietly stop exercising it.
  if (ts.summariseScores([48, 48, 49, 48]).mean === 48.2) passed++;
  else failed.push(`CONTROL: the 48.25 tie came out ${ts.summariseScores([48,48,49,48]).mean}, not 48.2 — ` +
                   "JavaScript's Math.round is being used where Python's round(x, 1) is required");
  if (Math.round(482.5) === 483) passed++;
  else failed.push("CONTROL: Math.round no longer rounds 482.5 up, so the tie test proves nothing");
}

console.log();
console.log(`  ${passed} passed, ${failed.length} failed`  + "   [rev 2026-11-26c — no esbuild, finds Python by probing]");
if (failed.length) { console.log(); for (const f of failed) console.log(`  FAIL  ${f}`); process.exit(1); }
console.log("  the real statistics.py and the real scoreStats.ts agree on every fixture.");
process.exit(0);