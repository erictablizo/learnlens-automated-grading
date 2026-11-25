/**
 * measure/2026-11-25_manage_users.mjs                            2026-11-25
 * ==========================================================================
 * Proves the Manage Users front end against the REAL backend files it claims
 * to mirror — Ms. Melanie, Recommendations page 19, requirements 1 and 3b-5.
 *
 *     node measure/2026-11-25_manage_users.mjs
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
  types:   "frontend/src/types/adminUser.ts",
  service: "frontend/src/services/adminUserService.ts",
  comp:    "frontend/src/components/admin/ManageUsers.tsx",
  schema:  "backend/app/schemas/admin_user.py",
  routes:  "backend/app/api/routes/admin_users.py",
  svcPy:   "backend/app/services/admin_user_service.py",
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
  types:   "export interface AdminUserRow",
  service: "export const adminUserService",
  comp:    "export default function ManageUsers",
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
for (const [py, ts] of [["AdminUserRow", "AdminUserRow"],
                        ["AdminUserCreate", "AdminUserCreate"],
                        ["AdminUserUpdate", "AdminUserUpdate"],
                        ["AdminUserDeleteResponse", "AdminUserDeleteResponse"]]) {
  const a = pyFields(src.schema, py);
  const b = tsFields(src.types, ts);
  check(`${ts} mirrors ${py} field-for-field`,
        a && b && a.length === b.length && a.every((f, i) => f === b[i]),
        `python ${JSON.stringify(a)} vs ts ${JSON.stringify(b)}`);
}

// ── 2. THE PATH CLAIM ──────────────────────────────────────────────────────
const prefix = (src.routes.match(/APIRouter\(prefix="([^"]+)"/) || [])[1];
check("the router prefix was found", Boolean(prefix), String(prefix));
check("  ...and it is /admin/users", prefix === "/admin/users", String(prefix));

const verbs = [...src.routes.matchAll(/@router\.(get|post|put|delete)\("([^"]*)"/g)]
  .map(m => `${m[1].toUpperCase()} ${prefix}${m[2]}`);
check("the backend exposes exactly four routes", verbs.length === 4, verbs.join(", "));

// EXACT CALLS, read from the comment-and-type-stripped service so each path
// is independently falsifiable.
//
// The first version of this checked for the template path and `api.put` as
// two SEPARATE substrings anywhere in the file - which the DELETE line
// satisfied on its own. A mutation pointing PUT at the collection, so every
// edit would write to /admin/users instead of /admin/users/3, SURVIVED.
// Measured 2026-11-25. Two loose checks are not one strict one.
const CALLS = [
  ["GET",    'api.get("/admin/users", token)'],
  ["POST",   'api.post("/admin/users", body, token)'],
  ["PUT",    'api.put(`/admin/users/${userId}`, body, token)'],
  ["DELETE", 'api.delete(`/admin/users/${userId}`, token)'],
];
for (const [method, call] of CALLS) {
  check(`the service's ${method} call matches the router`,
        code.service.includes(call), `expected exactly: ${call}`);
}

// NO /api PREFIX. lib/api.ts prepends BASE_URL, which already ends in /api,
// so a path written "/api/admin/users" reaches /api/api/admin/users — a 404
// that looks like an unregistered router.
check("no service path carries its own /api prefix",
      !/["`]\/api\//.test(code.service),
      "a path starts with /api/, which BASE_URL already supplies");

// ── 3. THE WHOLE REASON THE ENDPOINT EXISTS ────────────────────────────────
// /register signs the admin out. If this component ever reaches for the
// public register path, the bug is back and it is invisible until an admin
// creates an account and finds themselves logged in as them.
check("the component creates via adminUserService, not the register path",
      code.comp.includes("adminUserService.create("),
      "no call to adminUserService.create");
check("  ...and never imports useAuth or authService",
      !/from "@\/hooks\/useAuth"/.test(code.comp)
      && !/from "@\/services\/authService"/.test(code.comp),
      "it imports the hook or service whose register() calls setAuth()");
check("  ...and never calls setAuth",
      !code.comp.includes("setAuth("),
      "setAuth would replace the administrator's own session");

// ── 4. STATUS, AND HER NOTE ────────────────────────────────────────────────
check("status uses the shared constants, not bare strings",
      src.comp.includes("USER_ACTIVE") && src.comp.includes("USER_RESIGNED"),
      "a literal 'active'/'resigned' here can drift from the CHECK constraint");
const ckConstraint = src.svcPy.includes('ACTIVE') && src.svcPy.includes('RESIGNED');
check("  ...and the service file agrees those are the two values", ckConstraint);
check("the dialog states the default is Active (her requirement 5 note)",
      /starts as <strong>Active<\/strong>/.test(src.comp),
      "the note 'Default Status value is <Active>' is not on screen");
check("the Status control offers exactly two options",
      (src.comp.match(/<option value=\{USER_/g) || []).length === 2,
      "a third option would be refused by ck_users_status");

// ── 5. DELETE ──────────────────────────────────────────────────────────────
check("Delete is disabled when the account owns exams",
      /disabled=\{busy \|\| owns\}/.test(src.comp),
      "the admin can press a button the backend will refuse");
check("  ...and the tooltip points at Resigned",
      /Set Status to\s+\n?\s*`?\s*\+?\s*`?Resigned instead/.test(src.comp)
      || src.comp.includes("Resigned instead"),
      "the disabled button does not say what to do instead");
// THE BUTTON MUST ARM THE CONFIRMATION, not merely contain a branch that
// could. Checking for `confirm === r.user_id` found the ternary while a
// mutation had removed the only thing that ever sets it - the confirm step
// was unreachable and the check passed. Measured 2026-11-25.
check("  ...and Delete asks before it deletes",
      code.comp.includes("setConfirm(r.user_id)") && src.comp.includes("Yes, delete"),
      "the Delete button does not arm the confirmation step");

// ── 6. THE 409s ARE SHOWN VERBATIM ─────────────────────────────────────────
// The backend writes those sentences for this screen and they carry counts.
check("an ApiError's own message is shown, not replaced",
      /e instanceof ApiError \? e\.message/.test(src.comp),
      "the counted sentence is replaced with wording of our own");

// ── 7. EDIT SENDS ONLY WHAT CHANGED ────────────────────────────────────────
// The route applies exclude_unset; sending the whole row back would blank
// fields nobody touched. That is the 2026-11-03 year_level bug.
check("Edit sends only the changed fields",
      src.comp.includes("const body: AdminUserUpdate = {}")
      && src.comp.includes("!== r.email"),
      "the whole row is sent, so untouched fields are overwritten");
check("  ...and sends nothing at all when nothing changed",
      src.comp.includes("Object.keys(body).length === 0"),
      "an empty save still issues a PUT");

// ── 8. THE DIALOG ──────────────────────────────────────────────────────────
check("the pop-window is a dialog", /role="dialog"/.test(src.comp));
check("  ...marked modal", /aria-modal="true"/.test(src.comp));
check("  ...labelled by its heading",
      /aria-labelledby="manage-users-title"/.test(src.comp)
      && /id="manage-users-title"/.test(src.comp));
check("  ...closed by Escape", /e\.key === "Escape"/.test(src.comp));
check("  ...and returns focus to the button that opened it",
      src.comp.includes("openerRef.current?.focus()"),
      "closing drops focus on <body>");
check("Manage Users is a <button>, not a <Link> (her requirement 3b)",
      !/from "next\/link"/.test(src.comp) && src.comp.includes("onClick={() => setOpen(true)}"),
      "it navigates away instead of opening over the screen");

console.log();
console.log(`  ${passed} passed, ${failed.length} failed`);
if (failed.length) {
  console.log();
  for (const f of failed) console.log("  FAIL  " + f);
}
console.log();
console.log("  the real frontend files, compared against the real");
console.log("  admin_user schema, router and service from the tree.");
process.exit(failed.length ? 1 : 0);
