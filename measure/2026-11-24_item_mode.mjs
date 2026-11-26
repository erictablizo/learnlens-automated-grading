#!/usr/bin/env node
/**
 * measure/2026-11-24_item_mode.mjs
 * ================================
 *
 * Ms. Melanie, page 18 requirement 9, her definition of Mode:
 *
 *   "Mode: average kung saan item ang pinaka nagkamali lahat at naging tama
 *    lahat"
 *
 * The item the class got wrong most, and the item they got right most.
 * lib/itemExtremes.ts computes it; this runs the real module.
 *
 *   node measure/2026-11-24_item_mode.mjs
 *
 * Exits 2 rather than measure a stand-in.
 */
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SRC = join(ROOT, "frontend/src/lib/itemExtremes.ts");
if (!existsSync(SRC)) {
  console.error(`FATAL: ${SRC} not found. Run this from the repository root.`);
  process.exit(2);
}

/* ── TypeScript compiled WITHOUT esbuild ──────────────────────────────────
 * esbuild is in no package.json this repo ships. It happened to be
 * installed where these benches were written, so on 2026-11-26 they died
 * with ERR_MODULE_NOT_FOUND on Grace's machine - green here, unrunnable
 * there, and therefore checking nothing. frontend/node_modules/typescript
 * is already present; frontend/tsxsyntax.js uses it.
 *
 * `emit` is a two-line stand-in for a bundler, and it handles exactly one
 * thing: a bare `@/lib/x` specifier rewritten to a sibling file emitted
 * beside it. Anything else it cannot resolve makes the bench EXIT, rather
 * than produce a module that silently lacks an import. */
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
function emit(tsc, srcPath, outPath) {
  let js = tsc.transpileModule(readFileSync(srcPath, "utf8"), {
    compilerOptions: {
      target: tsc.ScriptTarget.ES2020,
      module: tsc.ModuleKind.ESNext,
    },
  }).outputText;
  js = js.replace(/from "@\/lib\/([A-Za-z0-9_]+)"/g, 'from "./$1.mjs"');
  if (js.includes('"@/')) {
    console.error(`FATAL: ${srcPath} imports something this bench cannot`);
    console.error("resolve. Emit that file too, or the module will be wrong.");
    process.exit(2);
  }
  writeFileSync(outPath, js);
}

const tmp = mkdtempSync(join(tmpdir(), "itemmode-"));
const out = join(tmp, "itemExtremes.mjs");
emit(loadTs(), SRC, out);
const M = await import(pathToFileURL(out).href);
for (const n of ["itemExtremes", "itemModeLines"]) {
  if (typeof M[n] !== "function") { console.error(`FATAL: no ${n}.`); process.exit(2); }
}

let passed = 0;
const failed = [];
const eq = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) passed++; else failed.push(`${label}\n      got  ${a}\n      want ${b}`);
};
const is = (label, cond, detail = "") =>
  cond ? passed++ : failed.push(detail ? `${label}: ${detail}` : label);

const it = (q, wrong, correct, answered = 7) =>
  ({ question_number: q, wrong, correct, answered });

// Grace's class: 7 students. Items 3 and 4 tie for most-missed; item 2 is the
// only one everybody got right.
const CLASS = [it(1, 1, 6), it(2, 0, 7), it(3, 6, 1), it(4, 6, 1), it(5, 3, 4)];

{
  const x = M.itemExtremes(CLASS);
  eq("the items most got wrong — both of them", x.mostWrong, [3, 4]);
  eq("how many got them wrong", x.wrongCount, 6);
  eq("the item most got right", x.mostRight, [2]);
  eq("how many got it right", x.rightCount, 7);
  eq("the Mode cell, as two lines", M.itemModeLines(x), [
    "Most missed: items 3, 4 — 6 of 7 wrong",
    "Most correct: item 2 — 7 of 7 right",
  ]);
}

// ---- one item each way --------------------------------------------------
{
  const x = M.itemExtremes([it(9, 5, 2), it(10, 1, 6)]);
  eq("a single most-missed item reads 'item', not 'items'",
     M.itemModeLines(x)[0], "Most missed: item 9 — 5 of 7 wrong");
  eq("and a single most-correct item too",
     M.itemModeLines(x)[1], "Most correct: item 10 — 6 of 7 right");
}

// ---- nothing to report --------------------------------------------------
eq("no items at all is a dash, not an invented item",
   M.itemModeLines(M.itemExtremes([])), ["—"]);
eq("null is the same", M.itemModeLines(M.itemExtremes(null)), ["—"]);
eq("undefined is the same", M.itemModeLines(M.itemExtremes(undefined)), ["—"]);

// An item nobody has reached is not an item nobody got right.
eq("items with no answered papers are dropped",
   M.itemExtremes([it(1, 0, 0, 0), it(2, 3, 4, 7)]).mostWrong, [2]);
eq("and if that is all there is, there is nothing to say",
   M.itemModeLines(M.itemExtremes([it(1, 0, 0, 0)])), ["—"]);

// ---- a perfect class, and a disastrous one ------------------------------
eq("nobody got anything wrong — said plainly, not as 'item 1'",
   M.itemModeLines(M.itemExtremes([it(1, 0, 7), it(2, 0, 7)]))[0],
   "Most missed: none — every item was answered correctly by everyone");
eq("nobody got anything right",
   M.itemModeLines(M.itemExtremes([it(1, 7, 0), it(2, 7, 0)]))[1],
   "Most correct: none — no item was answered correctly by anyone");

// ---- the denominator is the one being claimed ---------------------------
// Part-graded papers give items different `answered` counts; the printed "of
// N" must be true of every item named, so it is the lowest of them.
{
  const x = M.itemExtremes([it(1, 4, 1, 5), it(2, 4, 3, 7)]);
  eq("both items tie on 4 wrong", x.mostWrong, [1, 2]);
  eq("and the denominator is the lower of the two", x.wrongOutOf, 5);
  is("so the line cannot overstate the class",
     M.itemModeLines(x)[0].includes("4 of 5"),
     M.itemModeLines(x)[0]);
}

// ---- controls -----------------------------------------------------------
is("CONTROL: a tie really is a tie in the fixture",
   CLASS.filter(i => i.wrong === 6).length === 2,
   "the fixture has one most-missed item, so the tie behaviour is untested");
is("CONTROL: most-missed and most-correct are DIFFERENT items here",
   M.itemExtremes(CLASS).mostWrong[0] !== M.itemExtremes(CLASS).mostRight[0],
   "the fixture cannot tell the two halves apart");
is("CONTROL: the two lines are not the same sentence",
   M.itemModeLines(M.itemExtremes(CLASS))[0] !==
   M.itemModeLines(M.itemExtremes(CLASS))[1]);

console.log();
console.log(`  ${passed} passed, ${failed.length} failed`);
if (failed.length) { console.log(); for (const f of failed) console.log(`  FAIL  ${f}`); process.exit(1); }
console.log("  the real lib/itemExtremes.ts: Mode as Ms. Melanie defines it.");
process.exit(0);
