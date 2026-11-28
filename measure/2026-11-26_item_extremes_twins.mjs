/**
 * measure/2026-11-26_item_extremes_twins.mjs                     2026-11-26
 * ==========================================================================
 *
 * `backend/app/ml/item_extremes.py` and `frontend/src/lib/itemExtremes.ts`
 * compute the Mode cell of the Data Analytics table. This runs BOTH, on the
 * same fixtures, and fails if they disagree about anything.
 *
 * The same shape as measure/2026-11-23_stats_twins.mjs and for the same
 * reason, which that file states: "Two implementations of one definition is
 * a liability unless something holds them together, and reading them side by
 * side is not that something."
 *
 * WHY THERE IS A PYTHON COPY AT ALL. Ms. Melanie, page 22 requirement 3: the
 * new Excel document must carry the Data Analytics contents, and the screen
 * computes them in the browser. The export has no browser.
 *
 * THE FIXTURES ARE THE DISAGREEMENTS, not the happy path. Ties, part-graded
 * items, an item nobody reached, an item nobody got wrong, an item nobody got
 * right, and an empty list. The happy path is fixture 1 and it has never been
 * the one that breaks.
 */
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const PY = join(ROOT, "backend/app/ml/item_extremes.py");
const TS = join(ROOT, "frontend/src/lib/itemExtremes.ts");

for (const f of [PY, TS]) {
  if (!existsSync(f)) {
    console.error(`MISSING: ${f}`);
    console.error("This bench runs both real files; it does not stub either.");
    process.exit(2);
  }
}

// blank defaults to 0 so the older fixtures below read unchanged - and so
// that the `blank ?? 0` path is exercised by every one of them.
const it = (question_number, answered, correct, wrong, blank) =>
  blank === undefined
    ? ({ question_number, answered, correct, wrong })
    : ({ question_number, answered, correct, wrong, blank });

const FIXTURES = [
  { why: "the ordinary case", items: [
      it(1, 6, 5, 1), it(2, 6, 2, 4), it(3, 6, 6, 0)] },

  { why: "a tie on BOTH ends - every tied item must be listed, lowest first",
    items: [it(1, 6, 1, 5), it(2, 6, 5, 1), it(3, 6, 1, 5), it(4, 6, 5, 1)] },

  { why: "an item nobody has reached is dropped, not treated as all-wrong",
    items: [it(1, 6, 4, 2), it(2, 0, 0, 0), it(3, 6, 3, 3)] },

  { why: "part-graded items: the denominator is the LOWEST answered among "
         + "the named ones, not the highest",
    items: [it(1, 4, 0, 4), it(2, 7, 0, 4), it(3, 6, 6, 0)] },

  { why: "nobody got anything wrong", items: [it(1, 5, 5, 0), it(2, 5, 5, 0)] },

  { why: "nobody got anything right", items: [it(1, 5, 0, 5), it(2, 5, 0, 5)] },

  { why: "no items at all", items: [] },

  { why: "every item unanswered - same as none", items: [it(1, 0, 0, 0)] },

  { why: "one item only", items: [it(9, 3, 1, 2)] },

  /* ── the 2026-11-28 blank figure ──────────────────────────────────────
   * Ms. Melanie: the line said "missed" over a number counting wrong, and
   * blanks were hidden inside it. These four fixtures are the four shapes
   * the new clause can take. */
  { why: "blanks inside the wrong count - the clause appears",
    items: [it(11, 39, 16, 23, 7), it(1, 39, 33, 6, 0)] },

  { why: "wrong but NOTHING blank - the clause must NOT appear",
    items: [it(11, 39, 16, 23, 0), it(1, 39, 33, 6, 0)] },

  { why: "a tie whose items DISAGREE about blanks - a range, never a sum",
    items: [it(3, 7, 1, 6, 2), it(4, 7, 1, 6, 5)] },

  { why: "a tie that agrees about blanks - one number, not a range",
    items: [it(3, 7, 1, 6, 4), it(4, 7, 1, 6, 4)] },

  { why: "every wrong answer was blank",
    items: [it(1, 5, 0, 5, 5)] },

  { why: "out-of-order question numbers must still sort ascending",
    items: [it(12, 6, 0, 6), it(3, 6, 0, 6), it(7, 6, 0, 6)] },
];


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

// ── the TypeScript side ───────────────────────────────────────────────────
const tsc = loadTs();
const js = tsc.transpileModule(readFileSync(TS, "utf8"), {
  compilerOptions: {
    target: tsc.ScriptTarget.ES2020,
    module: tsc.ModuleKind.ESNext,
  },
}).outputText;
const dir = mkdtempSync(join(tmpdir(), "twins-"));
const mod = join(dir, "itemExtremes.mjs");
writeFileSync(mod, js);
const { itemExtremes, itemModeLines } = await import(pathToFileURL(mod).href);
for (const needed of ["itemExtremes", "itemModeLines"]) {
  if (typeof { itemExtremes, itemModeLines }[needed] !== "function") {
    console.error(`FATAL: itemExtremes.ts has no ${needed}.`);
    process.exit(2);
  }
}

const fromTs = FIXTURES.map(f => {
  const x = itemExtremes(f.items);
  return {
    extremes: x && {
      most_wrong: x.mostWrong, wrong_count: x.wrongCount,
      most_right: x.mostRight, right_count: x.rightCount,
      wrong_out_of: x.wrongOutOf, right_out_of: x.rightOutOf,
      // ADDED 2026-11-28. The Python side is dumped with asdict(), so a new
      // field appears there automatically; here it has to be named. A field
      // left out of this map is a field the two sides can disagree about
      // while the bench reports green.
      wrong_blank_low: x.wrongBlankLow, wrong_blank_high: x.wrongBlankHigh,
    },
    lines: itemModeLines(x),
  };
});

// ── the Python side ───────────────────────────────────────────────────────
const driver = join(dir, "driver.py");
writeFileSync(driver, `
import importlib.util, json, sys, dataclasses
spec = importlib.util.spec_from_file_location("ie", sys.argv[1])
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
out = []
for f in json.load(sys.stdin):
    x = m.item_extremes(f["items"])
    out.append({
        "extremes": dataclasses.asdict(x) if x is not None else None,
        "lines": m.item_mode_lines(x),
    })
print(json.dumps(out))
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

const py = spawnSync(pythonCmd(), ["-I", driver, PY],
                     { input: JSON.stringify(FIXTURES), encoding: "utf8" });
if (py.status !== 0) {
  console.error("FATAL: could not run app/ml/item_extremes.py.\n" + (py.stderr || ""));
  process.exit(2);
}
let fromPy;
try { fromPy = JSON.parse(py.stdout); }
catch {
  console.error("FATAL: the Python driver printed no JSON.\n" + py.stdout);
  process.exit(2);
}
if (fromPy.length !== FIXTURES.length) {
  console.error("FATAL: Python returned a different number of results.");
  process.exit(2);
}

// ── compare ───────────────────────────────────────────────────────────────
let passed = 0;
const failed = [];
const check = (label, cond, detail = "") => {
  if (cond) passed++;
  else failed.push(detail ? `${label}: ${detail}` : label);
};

FIXTURES.forEach((f, i) => {
  const a = fromTs[i], b = fromPy[i];
  check(`[${i + 1}] ${f.why} — the extremes agree`,
        JSON.stringify(a.extremes) === JSON.stringify(b.extremes),
        `ts ${JSON.stringify(a.extremes)} vs py ${JSON.stringify(b.extremes)}`);
  check(`[${i + 1}] ${f.why} — the Mode lines agree`,
        JSON.stringify(a.lines) === JSON.stringify(b.lines),
        `ts ${JSON.stringify(a.lines)} vs py ${JSON.stringify(b.lines)}`);
});

// A control: the fixtures must actually exercise both branches of each
// sentence, or "they agree" would mean "they agree about nothing".
const allLines = fromTs.flatMap(r => r.lines).join(" | ");
check("CONTROL: the fixtures produce a 'Most wrong: none' case",
      allLines.includes("Most wrong: none"), allLines.slice(0, 120));
check("CONTROL: ...and a 'Most right: none' case",
      allLines.includes("Most right: none"));
check("CONTROL: ...and a plural 'items a, b' case",
      /items \d+, \d+/.test(allLines));
check("CONTROL: ...and a singular 'item n' case",
      /(^|\| )Most wrong: item \d+ /.test(allLines + " "));

// ── the 2026-11-28 clause, in all four of its shapes ────────────────────
check("CONTROL: a wrong line WITH a blank figure",
      /Most wrong: item 11 — 23 of 39 wrong, 7 left blank/.test(allLines),
      allLines.slice(0, 200));
check("CONTROL: a wrong line with NO blank figure, as she asked",
      /Most wrong: item 11 — 23 of 39 wrong(?!,)/.test(allLines));
check("CONTROL: a tie that disagrees prints a RANGE",
      /items 3, 4 — 6 of 7 wrong, 2 to 5 left blank/.test(allLines));
check("CONTROL: a tie that agrees prints ONE number",
      /items 3, 4 — 6 of 7 wrong, 4 left blank/.test(allLines));
check("CONTROL: the old wording is gone from both lines",
      !allLines.includes("Most missed") && !allLines.includes("Most correct"),
      allLines.slice(0, 160));

console.log();
console.log(`  ${passed} passed, ${failed.length} failed`  + "   [rev 2026-11-26c — no esbuild, finds Python by probing]");
if (failed.length) {
  console.log();
  for (const f of failed) console.log("  FAIL  " + f);
}
console.log();
console.log("  both real implementations, on the same fixtures.");
process.exit(failed.length ? 1 : 0);