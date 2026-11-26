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
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as esbuild from "esbuild";

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

const it = (question_number, answered, correct, wrong) =>
  ({ question_number, answered, correct, wrong });

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

  { why: "out-of-order question numbers must still sort ascending",
    items: [it(12, 6, 0, 6), it(3, 6, 0, 6), it(7, 6, 0, 6)] },
];

// ── the TypeScript side ───────────────────────────────────────────────────
const built = esbuild.buildSync({
  entryPoints: [TS], bundle: true, format: "esm", write: false,
  platform: "neutral",
});
const dir = mkdtempSync(join(tmpdir(), "twins-"));
const mod = join(dir, "itemExtremes.mjs");
writeFileSync(mod, built.outputFiles[0].text);
const { itemExtremes, itemModeLines } = await import(pathToFileURL(mod).href);

const fromTs = FIXTURES.map(f => {
  const x = itemExtremes(f.items);
  return {
    extremes: x && {
      most_wrong: x.mostWrong, wrong_count: x.wrongCount,
      most_right: x.mostRight, right_count: x.rightCount,
      wrong_out_of: x.wrongOutOf, right_out_of: x.rightOutOf,
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

const py = spawnSync("python3", ["-I", driver, PY],
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
check("CONTROL: the fixtures produce a 'Most missed: none' case",
      allLines.includes("Most missed: none"), allLines.slice(0, 120));
check("CONTROL: ...and a 'Most correct: none' case",
      allLines.includes("Most correct: none"));
check("CONTROL: ...and a plural 'items a, b' case",
      /items \d+, \d+/.test(allLines));
check("CONTROL: ...and a singular 'item n' case",
      /(^|\| )Most missed: item \d+ /.test(allLines + " "));

console.log();
console.log(`  ${passed} passed, ${failed.length} failed`);
if (failed.length) {
  console.log();
  for (const f of failed) console.log("  FAIL  " + f);
}
console.log();
console.log("  both real implementations, on the same fixtures.");
process.exit(failed.length ? 1 : 0);
