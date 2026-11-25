/**
 * measure/2026-11-25_teacher_corrections_ui.mjs                            2026-11-25
 * ==========================================================================
 * Proves the Corrections-by-teacher front end against the REAL backend files
 * it claims to mirror — Ms. Melanie, Recommendations page 19, requirement 1,
 * "Admin side can monitor how many the teachers recorrected answer".
 *
 *     node measure/2026-11-25_teacher_corrections_ui.mjs
 *
 * THE POINT OF THIS BENCH IS THE CROSS-FILE CHECKS. types/adminUser.ts says
 * it is "a FIELD-FOR-FIELD mirror of backend/app/schemas/admin_user.py" and
 * adminUserService.ts says its paths are admin_users.py's routes. Both are
 * CLAIMS ABOUT ANOTHER FILE, and nothing in a TypeScript build can check
 * either: a field missing from the interface reads as `undefined` on screen,
 * and a wrong path is a 404 at the defence. So this bench reads the Python
 * and compares.
 *
 * Every file is loaded from the tree by path. If one is missing the bench
 * EXITS 2 rather than skipping the property, because a skipped property
 * reads as a passing one in a count.
 */
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const FILES = {
  types:   "frontend/src/types/teacherCorrection.ts",
  service: "frontend/src/services/teacherCorrectionService.ts",
  comp:    "frontend/src/components/admin/TeacherCorrections.tsx",
  schema:  "backend/app/schemas/teacher_correction.py",
  routes:  "backend/app/api/routes/admin_teacher_corrections.py",
  svcPy:   "backend/app/services/teacher_correction_service.py",
};

const src = {};
for (const [k, rel] of Object.entries(FILES)) {
  const p = resolve(ROOT, rel);
  if (!existsSync(p)) {
    console.log(`  MISSING: ${rel}`);
    console.log("  This bench reads the real files; it does not stub them.");
    process.exit(2);
  }
  src[k] = readFileSync(p, "utf8");
}

/**
 * CODE WITH THE COMMENTS REMOVED, for the checks that are about BEHAVIOUR.
 *
 * Measured 2026-11-25: the check "the component never calls setAuth" failed
 * on a component that does not call it. The header comment EXPLAINS why it
 * must not — "/register ... ends in setAuth() with the new account's token"
 * — and a text search cannot tell an explanation from a call. A comment that
 * describes the bug is not the bug.
 *
 * Stripped with the TypeScript transpiler rather than a regex. A regex for
 * block comments eats the same delimiters where they appear inside string
 * literals, and this file's tooltip text quotes backend sentences. Writing
 * that delimiter out here would also have closed THIS comment four lines
 * early - which it did, on the first attempt, 2026-11-25.
 *
 * THE LIMIT, stated because it bit this project on 2026-11-24: comment
 * stripping is structurally blind to a JSX comment that is itself a syntax
 * error, since the parser never gets that far. That is what
 * frontend/tsxsyntax.js is for, and it is a separate run on purpose.
 */
const require_ = createRequire(import.meta.url);
const ts = require_(resolve(ROOT, "frontend/node_modules/typescript"));
const stripped = (text, tsx) => ts.transpileModule(text, {
  compilerOptions: {
    removeComments: true,
    target: ts.ScriptTarget.ES2020,
    jsx: tsx ? ts.JsxEmit.Preserve : undefined,
  },
  fileName: tsx ? "x.tsx" : "x.ts",
}).outputText;

const code = {
  comp:    stripped(src.comp, true),
  service: stripped(src.service, false),
};

/**
 * EACH FILE MUST ACTUALLY BE THE FILE, not merely present.
 *
 * Measured 2026-11-25: an empty frontend/src/types/adminUser.ts produced
 * TWENTY-FOUR failures - every mirror check, every service path, every
 * component property - each phrased as its own defect. The reader's problem
 * is then to notice that one cause explains all of them, which is exactly
 * the work a harness is supposed to do.
 *
 * existsSync is not enough: an editor creates the file the moment you open a
 * tab to paste into. So the signature export of each is checked, and a file
 * that is missing it stops the run with ONE named reason.
 */
const SIGNATURE = {
  types:   "export interface TeacherCorrectionCount",
  service: "export const teacherCorrectionService",
  comp:    "export default function TeacherCorrections",
};
const unpopulated = Object.entries(SIGNATURE)
  .filter(([k, sig]) => !src[k].includes(sig))
  .map(([k, sig]) => `${FILES[k]}  (${src[k].length} bytes, no "${sig}")`);
if (unpopulated.length) {
  console.log();
  console.log("  NOT THE DELIVERED FILE(S) - nothing below was measured:");
  for (const u of unpopulated) console.log(`    ${u}`);
  console.log();
  console.log("  The path exists but the contents are not the file this bench");
  console.log("  was written against. An empty file is the usual cause: an");
  console.log("  editor creates it as soon as you open a tab to paste into.");
  console.log();
  console.log(`  0 passed, ${unpopulated.length} failed`);
  for (const u of unpopulated) console.log(`  FAIL  ${u.split("  ")[0]} is not populated`);
  process.exit(1);
}

let passed = 0;
const failed = [];
const check = (label, cond, detail = "") => {
  if (cond) passed++;
  else failed.push(detail ? `${label}: ${detail}` : label);
};

/** Field names of a pydantic class body, in order. */
function pyFields(text, cls) {
  const m = text.match(new RegExp(`class ${cls}\\(BaseModel\\):([\\s\\S]*?)(?=\\nclass |\\n*$)`));
  if (!m) return null;
  const out = [];
  for (const line of m[1].split("\n")) {
    const f = line.match(/^ {4}([a-z_][a-z0-9_]*)\s*:/i);
    if (f && !f[1].startsWith("model_")) out.push(f[1]);
  }
  return out;
}

/** Field names of a TS interface body, in order. */
function tsFields(text, name) {
  const m = text.match(new RegExp(`interface ${name} \\{([\\s\\S]*?)\\n\\}`));
  if (!m) return null;
  const out = [];
  for (const line of m[1].split("\n")) {
    const f = line.match(/^ {2}([a-z_][a-z0-9_]*)\??\s*:/i);
    if (f) out.push(f[1]);
  }
  return out;
}

// ── 1. THE MIRROR CLAIM ────────────────────────────────────────────────────
for (const name of ["TeacherCorrectionCount", "CorrectedAnswer",
                    "TeacherCorrectionDetail"]) {
  const a = pyFields(src.schema, name);
  const b = tsFields(src.types, name);
  check(`${name} mirrors the pydantic class field-for-field`,
        a && b && a.length === b.length && a.every((f, i) => f === b[i]),
        `python ${JSON.stringify(a)} vs ts ${JSON.stringify(b)}`);
}

// ── 2. THE PATH CLAIM ──────────────────────────────────────────────────────
const prefix = (src.routes.match(/APIRouter\(prefix="([^"]+)"/) || [])[1];
check("the router prefix is /admin/teacher-corrections",
      prefix === "/admin/teacher-corrections", String(prefix));
check("  ...which is NOT the recogniser's /admin/corrections router",
      prefix !== "/admin/corrections", String(prefix));

const verbs = [...src.routes.matchAll(/@router\.(get|post|put|delete)\("([^"]*)"/g)];
check("the router is read-only: two GETs and nothing else",
      verbs.length === 2 && verbs.every(v => v[1] === "get"),
      verbs.map(v => `${v[1].toUpperCase()} ${v[2]}`).join(", "));

const CALLS = [
  ["counts", 'api.get("/admin/teacher-corrections", token)'],
  ["detail", 'api.get(`/admin/teacher-corrections/${userId}`, token)'],
];
for (const [what, call] of CALLS) {
  check(`the service's ${what} call matches the router`,
        code.service.includes(call), `expected exactly: ${call}`);
}
check("no service path carries its own /api prefix",
      !/["`]\/api\//.test(code.service),
      "BASE_URL already supplies it");

// ── 3. THE NUMBER MEANS WHAT THE SCREEN SAYS IT MEANS ──────────────────────
// The backend counts paper_scores.ocr_confidence IS NULL, NOT the samples
// table. Measured on production 2026-11-25: 10 corrected answers, 1 sample.
// A drift back to the samples count would under-report tenfold and nothing
// on screen would look wrong.
check("the backend counts corrected ANSWERS, not kept samples",
      src.svcPy.includes("PaperScore.ocr_confidence.is_(None)"),
      "the tally no longer reads ocr_confidence IS NULL");
check("  ...and the detail LEFT joins the samples table",
      src.svcPy.includes(".outerjoin(OCRCorrectionSample,"),
      "an inner join would make the list shorter than the count");

// ── 4. BOTH NUMBERS ARE ON SCREEN, AND THE GAP IS EXPLAINED ────────────────
check("the screen shows the total corrections", code.comp.includes("r.corrections"));
check("  ...and the kept-as-evidence count beside it", code.comp.includes("r.samples"));
check("  ...and explains the gap in one place, not two",
      (src.comp.match(/const NOT_KEPT/g) || []).length === 1
      && (code.comp.match(/NOT_KEPT/g) || []).length >= 3,
      "the explanation is written more than once, so the two can drift");

// ── 5. THE DRILL-DOWN ──────────────────────────────────────────────────────
check("a correction with no kept sample is still shown",
      src.comp.includes("not recorded") && code.comp.includes("reader_saw === null"),
      "a row with no sample would render blank");
check("the reader's confidence is shown where it exists",
      code.comp.includes("reader_confidence"),
      "Sir Alex's point 5 - was the reader confident when it was wrong?");
check("a truncated list says so", code.comp.includes("truncated"));
check("no View button on a teacher with nothing to show",
      code.comp.includes("r.corrections > 0 &&"),
      "an empty list behind a button looks like a failure");

// ── 6. ERRORS ──────────────────────────────────────────────────────────────
check("an ApiError's own message is shown, not replaced",
      /e instanceof ApiError \? e\.message/.test(code.comp));
check("the section is read-only: no post, put or delete",
      !/api\.(post|put|delete)/.test(code.service),
      "this section must not change anything");

console.log();
console.log(`  ${passed} passed, ${failed.length} failed`);
if (failed.length) {
  console.log();
  for (const f of failed) console.log("  FAIL  " + f);
}
console.log();
console.log("  the real frontend files, compared against the real");
console.log("  teacher_correction schema, router and service from the tree.");
process.exit(failed.length ? 1 : 0);
