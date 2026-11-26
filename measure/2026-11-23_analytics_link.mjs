#!/usr/bin/env node
/**
 * measure/2026-11-23_analytics_link.mjs
 * =====================================
 *
 * Ms. Melanie, page 18 requirement 7a: View Exam's "Data Analytics" button
 * WRITES a link and the analytics page READS it. Two screens, one string.
 *
 * WHY THIS IS A SEPARATE BENCH. measure/2026-11-23_analytics_page.mjs renders
 * the receiving end and proves it follows the link. It cannot render the
 * SENDING end: exams/[id]/page.tsx imports fourteen components that are not
 * in this tree, so nothing can mount it here. What can be checked is the
 * contract between them — that what analyticsHref() writes is exactly what
 * examFromSearch() reads back — and that is what this does.
 *
 *   node measure/2026-11-23_analytics_link.mjs
 *
 * Runs the REAL lib/analyticsLink.ts from the tree; exits 2 rather than
 * measure a stand-in.
 */
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SRC = join(ROOT, "frontend/src/lib/analyticsLink.ts");
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

const tmp = mkdtempSync(join(tmpdir(), "link-"));
const bundle = join(tmp, "analyticsLink.mjs");
{
  const tsc = loadTs();
  // analyticsLink.ts imports readParam from "@/lib/classListReturn", so that
  // file is emitted alongside and the specifier rewritten to point at it.
  const dep = join(ROOT, "frontend/src/lib/classListReturn.ts");
  if (!existsSync(dep)) {
    console.error(`FATAL: ${dep} not found; analyticsLink.ts imports it.`);
    process.exit(2);
  }
  emit(tsc, dep, join(tmp, "classListReturn.mjs"));
  emit(tsc, SRC, bundle);
}
const L = await import(pathToFileURL(bundle).href);
for (const needed of ["analyticsHref", "examFromSearch", "backHref", "EXAM_PARAM"]) {
  if (L[needed] === undefined) {
    console.error(`FATAL: lib/analyticsLink.ts has no ${needed}.`);
    process.exit(2);
  }
}

let passed = 0;
const failed = [];
const eq = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) passed++;
  else failed.push(`${label}\n      got  ${a}\n      want ${b}`);
};
const is = (label, cond, detail = "") =>
  cond ? passed++ : failed.push(detail ? `${label}: ${detail}` : label);

// ---- the round trip, which is the whole point ---------------------------
for (const id of [1, 4, 7, 42, 1000]) {
  eq(`exam ${id}: what the button writes is what the page reads`,
     L.examFromSearch(new URL(`https://x${L.analyticsHref(id)}`).search), id);
}
eq("the link itself", L.analyticsHref(4), "/analytics?exam=4");

// ---- a link with no exam on it ------------------------------------------
eq("exam 0 is not an exam, so no parameter is written", L.analyticsHref(0), "/analytics");
eq("and neither is a negative id", L.analyticsHref(-3), "/analytics");
eq("the sidebar's plain arrival reads as no exam", L.examFromSearch(""), null);
eq("so does a missing search string", L.examFromSearch(undefined), null);
eq("so does an unrelated parameter", L.examFromSearch("?from=9"), null);

// ---- junk must not become an exam id ------------------------------------
// A hand-edited or truncated URL reaching the page as a number would make it
// fetch an exam that does not exist and show an error instead of a picker.
for (const junk of ["?exam=", "?exam=abc", "?exam=1.5", "?exam=1e3", "?exam=-4",
                    "?exam=0", "?exam=4x", "?exam=4 5"]) {
  eq(`junk rejected: ${junk}`, L.examFromSearch(junk), null);
}
/* SURROUNDING WHITESPACE IS ACCEPTED, deliberately, and this check exists
 * because the reader's own comment used to say otherwise. readParam tests
 * `raw.trim()`, so "?exam= 4 " reads as 4 — which is what you want from a
 * hand-edited address bar. The comment in lib/classListReturn.ts was
 * corrected on 2026-11-23 to describe the code that is actually there. */
eq("a stray space around the number still names the exam",
   L.examFromSearch("?exam= 4 "), 4);
eq("a leading ? is optional", L.examFromSearch("exam=4"), 4);
eq("and other parameters alongside do not confuse it",
   L.examFromSearch("?from=9&exam=4&list=2"), 4);

// ---- the back button ----------------------------------------------------
eq("arrived by deep link, still on that exam: back goes to the exam",
   L.backHref(4, 4), "/exams/4");
eq("arrived by deep link, then changed exam: back goes to the list",
   L.backHref(4, 7), "/exams");
eq("arrived from the sidebar: back goes to the list",
   L.backHref(null, 4), "/exams");
eq("nothing shown yet: back goes to the list",
   L.backHref(4, null), "/exams");

// ---- controls -----------------------------------------------------------
is("CONTROL: the parameter is the one both sides name", L.EXAM_PARAM === "exam",
   `EXAM_PARAM is ${JSON.stringify(L.EXAM_PARAM)}`);
is("CONTROL: the href actually contains that parameter",
   L.analyticsHref(4).includes(`${L.EXAM_PARAM}=`),
   "the link is built from a different name than the reader uses");
// Without this, a backHref that always returned "/exams" would pass three of
// the four cases above and look healthy.
is("CONTROL: backHref is not simply constant",
   L.backHref(4, 4) !== L.backHref(4, 7));

console.log();
console.log(`  ${passed} passed, ${failed.length} failed`);
if (failed.length) { console.log(); for (const f of failed) console.log(`  FAIL  ${f}`); process.exit(1); }
console.log("  the real lib/analyticsLink.ts: what the button writes, the page reads.");
process.exit(0);
