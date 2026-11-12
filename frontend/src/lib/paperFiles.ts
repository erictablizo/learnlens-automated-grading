/**
 * lib/paperFiles.ts
 * =================
 * NEW 2026-11-12 — matching image files to roster students by student number.
 *
 *   Alex Passion / Julius Bancud, page 2 item 7: "Batch upload -> of Exam",
 *   resting on item 4: "ID Student # -> file of Test Exam".
 *
 * This is the function that can silently put Ana's paper under Ben's name, so
 * it is deliberately conservative: it matches against the ROSTER rather than
 * guessing a pattern, it requires the number to be delimited, and anything it
 * is not sure about comes back unmatched with a reason rather than assigned.
 *
 * WHY MATCHING AGAINST THE ROSTER IS WHAT MAKES THIS POSSIBLE
 * ------------------------------------------------------------
 * "2021-00123-2.jpg" is ambiguous on its own: a student number contains
 * hyphens, so that is either student `2021-00123` page 2, or student
 * `2021-00123-2` page 1. No regular expression settles it. Knowing which
 * numbers exist does — and the LONGEST matching number wins, because a roster
 * holding both must mean the longer one was meant.
 *
 * Pure functions, no React, no network — measured by
 * measure/2026-11-12_paper_files.mjs.
 */

/** Only the fields the matcher reads, so it can be tested without the API. */
export interface RosterEntry {
  student_id: number;
  student_number: string;
  last_name: string;
  first_name: string;
}

export interface MatchedFile {
  file: File;
  /** 1-based. Taken from the filename's trailing digits, or 1. */
  page: number;
}

export interface MatchedStudent {
  student: RosterEntry;
  /** Sorted by page. One entry per page of that student's paper. */
  files: MatchedFile[];
  /** Two files claiming the same page for the same student. */
  issues: string[];
}

export interface UnmatchedFile {
  file: File;
  reason: string;
}

export interface MatchResult {
  matched: MatchedStudent[];
  unmatched: UnmatchedFile[];
}

/**
 * Must agree with student_service.norm_number() and the
 * `lower(trim(student_number))` unique index. If these drift, the browser will
 * pair a file with a student the server then says does not exist.
 */
export function normNumber(v: string): string {
  return (v || "").split(/\s+/).filter(Boolean).join(" ").toLowerCase();
}

function baseName(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/** Letters and digits are "inside a token"; everything else is a boundary. */
function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[a-z0-9]/i.test(ch);
}

interface Hit { start: number; end: number; entry: RosterEntry }

/**
 * Every DELIMITED occurrence of a roster number in `base`.
 *
 * Delimited matters. A bare "contains" test makes student `001` match
 * `IMG_20261112_0012.jpg`, which is how a batch upload files a paper under a
 * stranger's name. The character before and after the match must be a
 * non-alphanumeric separator (or the string edge), so `001` matches
 * `paper-001.jpg` and `001.jpg` and not `0012`.
 */
function hits(base: string, roster: readonly RosterEntry[]): Hit[] {
  const hay = base.toLowerCase();
  const out: Hit[] = [];
  for (const entry of roster) {
    const needle = normNumber(entry.student_number);
    if (!needle) continue;
    let from = 0;
    for (;;) {
      const i = hay.indexOf(needle, from);
      if (i < 0) break;
      const before = i === 0 ? undefined : hay[i - 1];
      const after = hay[i + needle.length];
      if (!isWordChar(before) && !isWordChar(after)) {
        out.push({ start: i, end: i + needle.length, entry });
      }
      from = i + 1;
    }
  }
  return out;
}

/**
 * The page number a filename asks for, or 1.
 *
 * Read from the text AFTER the matched number, so "2021-00123_p2.jpg" is page
 * 2 and "2021-00123.jpg" is page 1. A trailing "(1)", which is what a browser
 * appends to a duplicate download, is NOT read as a page — it means "second
 * copy of the same file", and treating it as page 1 is right.
 */
export function pageFromSuffix(suffix: string): number {
  const s = suffix.trim();
  if (!s) return 1;
  // "(2)" is a copy marker, not a page.
  if (/^\(\d+\)$/.test(s)) return 1;
  const m = s.match(/^[\s._\-#]*(?:p(?:age)?[\s._\-]*)?(\d{1,2})\b/i);
  if (!m) return 1;
  const n = Number(m[1]);
  return n >= 1 && n <= 50 ? n : 1;
}

/**
 * Pair each file with a roster student.
 *
 * LONGEST MATCH WINS, and ties break toward the one that starts earliest, so a
 * roster holding both `2021-001` and `2021-0012` reads `2021-0012_p1.jpg` as
 * the longer student rather than the shorter one plus a stray "2".
 *
 * A file matching TWO DIFFERENT students at the same length is refused, not
 * guessed: "2021-001_vs_2021-002.jpg" names two people and the teacher has to
 * say which.
 */
export function matchFilesToStudents(
  files: readonly File[],
  roster: readonly RosterEntry[],
): MatchResult {
  const byStudent = new Map<number, MatchedStudent>();
  const unmatched: UnmatchedFile[] = [];

  for (const file of files) {
    const base = baseName(file.name);
    const found = hits(base, roster);

    if (found.length === 0) {
      unmatched.push({
        file,
        reason: "No student number from the roster was found in this file name.",
      });
      continue;
    }

    const longest = Math.max(...found.map(h => h.end - h.start));
    const best = found.filter(h => h.end - h.start === longest);
    const distinct = new Set(best.map(h => h.entry.student_id));

    if (distinct.size > 1) {
      const who = best
        .map(h => h.entry.student_number)
        .filter((v, i, a) => a.indexOf(v) === i)
        .join(" and ");
      unmatched.push({
        file,
        reason: `This file name contains more than one student number (${who}).`,
      });
      continue;
    }

    // Earliest occurrence of the winning number, so the page suffix is read
    // from after the FIRST mention rather than a later repeat.
    const hit = best.reduce((a, b) => (a.start <= b.start ? a : b));
    const page = pageFromSuffix(base.slice(hit.end));

    let bucket = byStudent.get(hit.entry.student_id);
    if (!bucket) {
      bucket = { student: hit.entry, files: [], issues: [] };
      byStudent.set(hit.entry.student_id, bucket);
    }
    bucket.files.push({ file, page });
  }

  // Two files claiming one page is a real mistake - usually a duplicate
  // download - and uploading both would make the second overwrite the first
  // silently, because paper_pages is UNIQUE on (paper_id, page_number).
  for (const bucket of byStudent.values()) {
    bucket.files.sort((a, b) => a.page - b.page || a.file.name.localeCompare(b.file.name));
    const seen = new Map<number, string>();
    for (const f of bucket.files) {
      const prev = seen.get(f.page);
      if (prev !== undefined) {
        bucket.issues.push(
          `Page ${f.page} is claimed by two files (${prev} and ${f.file.name}).`,
        );
      } else {
        seen.set(f.page, f.file.name);
      }
    }
  }

  const matched = [...byStudent.values()].sort((a, b) =>
    a.student.last_name.localeCompare(b.student.last_name, undefined,
      { sensitivity: "base", numeric: true }) ||
    a.student.first_name.localeCompare(b.student.first_name, undefined,
      { sensitivity: "base", numeric: true }) ||
    a.student.student_id - b.student.student_id);

  return { matched, unmatched };
}

/** Students with no issues — the ones safe to upload. */
export function uploadableStudents(r: MatchResult): MatchedStudent[] {
  return r.matched.filter(m => m.issues.length === 0);
}

/** One line above the preview. Says what will happen, in counts. */
export function matchSummary(r: MatchResult): string {
  const ok = uploadableStudents(r).length;
  const blocked = r.matched.length - ok;
  const files = r.matched.reduce((n, m) => n + m.files.length, 0);
  const bits = [
    `${files} file${files === 1 ? "" : "s"} matched to ${ok} student${ok === 1 ? "" : "s"}`,
  ];
  if (blocked) bits.push(`${blocked} need${blocked === 1 ? "s" : ""} fixing`);
  if (r.unmatched.length) bits.push(`${r.unmatched.length} unrecognised`);
  return bits.join(" · ") + ".";
}


// ---------------------------------------------------------------------------
// The upload PLAN — decided before anything is sent
// ---------------------------------------------------------------------------

export type UploadAction = "upload" | "skip";

export interface UploadPlanEntry {
  student: RosterEntry;
  files: MatchedFile[];
  action: UploadAction;
  /** Why it is being skipped. Absent when action is "upload". */
  reason?: string;
}

/**
 * Decide, BEFORE sending anything, what will happen to each matched student.
 *
 * `alreadyHasPaper` is the set of student_ids that already have a paper in
 * this exam, read from GET /exams/{id}/papers. Knowing it up front is what
 * turns a surprise 409 halfway through a 35-student run into a line in the
 * preview table that the teacher reads first.
 *
 * SKIPPING RATHER THAN REUSING is deliberate. A student with an existing paper
 * might have one with pages already uploaded, and sending more would collide
 * with UNIQUE(paper_id, page_number) or silently replace a page that has
 * already been marked. The safe move is to say so and let her delete the paper
 * or handle that one by hand - MULTI-PAGE-UPLOAD-2026-10-23.md's third blocker
 * was "partial failure needs progress and recovery", and recovery here means
 * being legible, not clever.
 */
export function planUpload(
  match: MatchResult,
  alreadyHasPaper: ReadonlySet<number>,
): UploadPlanEntry[] {
  return match.matched.map(m => {
    if (m.issues.length > 0) {
      return { student: m.student, files: m.files, action: "skip" as const,
               reason: m.issues.join(" ") };
    }
    if (alreadyHasPaper.has(m.student.student_id)) {
      return { student: m.student, files: m.files, action: "skip" as const,
               reason: "Already has a paper in this exam." };
    }
    return { student: m.student, files: m.files, action: "upload" as const };
  });
}

export function toUpload(plan: readonly UploadPlanEntry[]): UploadPlanEntry[] {
  return plan.filter(p => p.action === "upload");
}

/** What the Upload button says, so the count is never a surprise. */
export function planSummary(plan: readonly UploadPlanEntry[], unmatched: number): string {
  const up = toUpload(plan);
  const files = up.reduce((n, p) => n + p.files.length, 0);
  if (up.length === 0) {
    return unmatched > 0
      ? "Nothing to upload — no file matched a student without a paper."
      : "Nothing to upload.";
  }
  const skipped = plan.length - up.length;
  const bits = [
    `${files} file${files === 1 ? "" : "s"} for ${up.length} student${up.length === 1 ? "" : "s"}`,
  ];
  if (skipped) bits.push(`${skipped} skipped`);
  if (unmatched) bits.push(`${unmatched} unrecognised`);
  return bits.join(" · ") + ".";
}

// ---------------------------------------------------------------------------
// The RESULT, after the loop has run
// ---------------------------------------------------------------------------

export interface UploadOutcome {
  student: RosterEntry;
  ok: boolean;
  /** Pages that reached the server. */
  pagesUploaded: number;
  pagesTotal: number;
  error?: string;
}

/**
 * The sentence shown when the run finishes.
 *
 * PARTIAL SUCCESS IS NAMED, not averaged away. A run where 33 students went up
 * and 2 failed is not "failed" and is not "done" - and the two matter more
 * than the thirty-three, because they are the ones needing action.
 *
 * A paper whose pages only partly uploaded is counted as a FAILURE even though
 * its row exists, because a half-uploaded paper grades against missing pages
 * and reports a wrong score rather than an error.
 */
export function outcomeSummary(outcomes: readonly UploadOutcome[]): string {
  const full = outcomes.filter(o => o.ok && o.pagesUploaded === o.pagesTotal);
  const partial = outcomes.filter(o => o.ok && o.pagesUploaded < o.pagesTotal);
  const failed = outcomes.filter(o => !o.ok);
  if (outcomes.length === 0) return "Nothing was uploaded.";
  const bits = [`${full.length} paper${full.length === 1 ? "" : "s"} added`];
  if (partial.length) bits.push(`${partial.length} missing some pages`);
  if (failed.length) bits.push(`${failed.length} failed`);
  return bits.join(" · ") + ".";
}

/** True when every outcome is a clean, complete upload. */
export function allSucceeded(outcomes: readonly UploadOutcome[]): boolean {
  return outcomes.length > 0
    && outcomes.every(o => o.ok && o.pagesUploaded === o.pagesTotal);
}