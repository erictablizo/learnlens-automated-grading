/**
 * lib/studentPaste.ts
 * ===================
 * NEW 2026-11-12 — turning a pasted class list into roster rows.
 *
 * THE PARSE IS BEST-EFFORT AND VISIBLE, NOT CLEVER. Its output goes into an
 * editable preview table before anything is created, because no rule gets
 * every real name right:
 *
 *     "2021-00125, Smith, Jr., John"
 *
 * splits into four fields, and nothing in the text says whether "Jr." belongs
 * to the surname or the given name. A parser that guesses silently is worse
 * than one that shows its working. So this module's job is to get the common
 * cases right, flag what it is unsure about, and let the teacher correct the
 * table before she submits.
 *
 * CHANGED 2026-11-14 — the MIDDLE NAME, and this is the one change here that
 * can alter how an OLD paste is read. See pickColumns() below.
 *
 * Pure functions, no React, no network — measured by
 * measure/2026-11-12_student_paste.mjs.
 */

/** One line of the paste, after splitting. `line` is 1-based in the ORIGINAL text. */
export interface ParsedRow {
  line: number;
  student_number: string;
  last_name: string;
  first_name: string;
  /** NEW 2026-11-14. OPTIONAL — a blank middle name is never an issue. */
  middle_name: string;
  section: string;
  /** Why this row cannot be submitted as it stands. Empty means it is fine. */
  issues: string[];
}

export interface ParseResult {
  rows: ParsedRow[];
  /** Which separator was used. Shown to the teacher so a wrong guess is visible. */
  delimiter: "tab" | "comma";
  /** True when the first line looked like column headers and was dropped. */
  skippedHeader: boolean;
  /** Blank lines, which are skipped without comment. */
  blankLines: number;
  /**
   * NEW 2026-11-14. How the 4th column was read, so the summary line can say
   * so out loud rather than leaving a surprise in the preview table.
   */
  fourthColumn: "middle" | "section" | "none";
}

const HEADER_WORDS = [
  "id", "no", "no.", "number", "student", "student no", "student number",
  "last", "last name", "surname", "family name",
  "first", "first name", "given", "given name",
  // NEW 2026-11-14
  "middle", "middle name", "mi", "m.i.", "middle initial",
  "section", "class", "year",
];

function pickDelimiter(lines: string[]): "tab" | "comma" {
  return lines.some(l => l.includes("\t")) ? "tab" : "comma";
}

const norm = (s: string) => s.trim().toLowerCase().replace(/[_-]/g, " ");

/**
 * Which of the five things a header cell names, or null.
 *
 * ORDER MATTERS, and the loose number test is LAST on purpose: it has to
 * accept "Student No.", "No.", "ID" and "Student Number", which is broad
 * enough to swallow another column's name if it ran first.
 *
 * Periods are dropped before matching, so "No." and "M.I." are recognised.
 * The first version used a fixed word list and did NOT contain "student no.",
 * which is exactly what the roster table's own header says - so a teacher
 * pasting her own exported list got no header detected at all. Found by
 * running it; a word list is a thing you forget to add to.
 */
function headerRole(cell: string): keyof ColumnMap | null {
  const n = norm(cell).replace(/\./g, "");
  if (n.includes("middle") || n === "mi") return "middle";
  if (n.includes("last") || n.includes("surname") || n.includes("family")) return "last";
  if (n.includes("first") || n.includes("given")) return "first";
  if (n.includes("section") || n.includes("class")) return "section";
  if (n.includes("number") || n.includes("no") || n.includes("id") || n === "student") return "number";
  return null;
}

function looksLikeHeader(fields: string[]): boolean {
  if (fields.length < 2) return false;
  // A real student number almost always has a digit in it; a header never does.
  if (/\d/.test(fields[0])) return false;
  return fields.slice(0, 3).every(f => headerRole(f) !== null);
}

interface ColumnMap {
  number: number; last: number; first: number;
  middle: number; section: number;          // -1 when absent
}

/**
 * Decide what each column means. THIS IS THE DELICATE PART OF THE 2026-11-14
 * CHANGE, and it is delicate because of an old paste, not a new one.
 *
 * Before today the parser read field 4 and everything after it as the SECTION.
 * The panel's own order is Number, Last, First, MIDDLE — so a list pasted last
 * week as
 *
 *     2021-00123, Cruz, Ana, BSCS 3A
 *
 * would, under a naive change, start reading "BSCS 3A" as a middle name.
 *
 * Two defences, in order:
 *
 * 1. A HEADER ROW WINS. If the first line names its columns, they are mapped
 *    by name and the order does not matter at all. The teacher has told us
 *    what the columns are; guessing would be perverse.
 *
 * 2. WITHOUT A HEADER, field 4 is the middle name — EXCEPT when there are
 *    exactly four fields and the fourth matches a section this teacher
 *    already uses. "BSCS 3A" is then read as the section it plainly is.
 *
 * Both are visible: the preview table shows every column, and parseSummary()
 * says which way the fourth column was read.
 */
function pickColumns(
  headerFields: string[] | null,
  knownSections: readonly string[],
  sampleFourth: string,
  sampleWidth: number,
): { map: ColumnMap; fourth: ParseResult["fourthColumn"]; rejoinTail: boolean } {
  if (headerFields) {
    const map: ColumnMap = { number: -1, last: -1, first: -1, middle: -1, section: -1 };
    headerFields.forEach((cell, i) => {
      const role = headerRole(cell);
      if (role && map[role] === -1) map[role] = i;
    });
    // Only trust the header when it names the three required columns.
    if (map.number >= 0 && map.last >= 0 && map.first >= 0) {
      // rejoinTail is FALSE here. The tail rule ("everything after the section
      // is still the section") only makes sense when the section is the LAST
      // column, which is true positionally and NOT true of a header that puts
      // Section before Middle Name - there the rejoin swallowed the middle
      // name into the section. Named columns are read as single fields.
      return {
        map, rejoinTail: false,
        fourth: map.middle === 3 ? "middle" : map.section === 3 ? "section" : "none",
      };
    }
  }
  const known = new Set(knownSections.map(s => norm(s)));
  const fourthIsSection = sampleWidth === 4 && !!sampleFourth && known.has(norm(sampleFourth));
  return {
    map: fourthIsSection
      ? { number: 0, last: 1, first: 2, middle: -1, section: 3 }
      : { number: 0, last: 1, first: 2, middle: 3, section: 4 },
    rejoinTail: true,
    fourth: sampleWidth < 4 ? "none" : fourthIsSection ? "section" : "middle",
  };
}

/**
 * Parse pasted text into rows.
 *
 * `knownSections` is the teacher's existing section labels — see
 * pickColumns() for the one thing they are used for.
 */
export function parseStudentPaste(
  text: string,
  defaultSection = "",
  knownSections: readonly string[] = [],
): ParseResult {
  const raw = (text || "").replace(/\r\n?/g, "\n").split("\n");
  const nonBlank: { line: number; text: string }[] = [];
  let blankLines = 0;

  raw.forEach((l, i) => {
    if (l.trim() === "") blankLines += 1;
    else nonBlank.push({ line: i + 1, text: l });
  });

  const delimiter = pickDelimiter(nonBlank.map(l => l.text));
  const split = (l: string) =>
    (delimiter === "tab" ? l.split("\t") : l.split(",")).map(f => f.trim());

  const sect = defaultSection.trim();
  let skippedHeader = false;

  const all = nonBlank.map(e => ({ ...e, fields: split(e.text) }));
  const header = all.length > 0 && looksLikeHeader(all[0].fields) ? all[0].fields : null;
  if (header) skippedHeader = true;
  const body = header ? all.slice(1) : all;

  // The sample used to decide the fourth column: the first body row.
  const sample = body[0]?.fields ?? [];
  const { map, fourth, rejoinTail } = pickColumns(
    header, knownSections, sample[3] ?? "", sample.length);

  const at = (fields: string[], i: number) => (i >= 0 ? fields[i] ?? "" : "");

  const rows: ParsedRow[] = body.map(entry => {
    const f = entry.fields;
    // Everything past the LAST mapped column is rejoined into the section, so
    // "BSCS 3A, morning" survives a comma-separated paste - the 2026-11-12
    // behaviour, now measured from wherever the section column landed.
    const tail = rejoinTail && map.section >= 0
      ? f.slice(map.section).filter(x => x !== "").join(", ")
      : at(f, map.section);
    return {
      line: entry.line,
      student_number: collapse(at(f, map.number)),
      last_name: collapse(at(f, map.last)),
      first_name: collapse(at(f, map.first)),
      middle_name: collapse(at(f, map.middle)),
      section: collapse(tail) || sect,
      issues: [],
    };
  });

  return { rows: withIssues(rows), delimiter, skippedHeader, blankLines, fourthColumn: fourth };
}

/** Whitespace collapsed, matching what the backend stores (2026-11-10 rule). */
function collapse(v: string): string {
  return (v || "").split(/\s+/).filter(Boolean).join(" ");
}

/**
 * Flag what cannot be submitted, and what is a duplicate WITHIN the paste.
 *
 * THE MIDDLE NAME IS NEVER FLAGGED. It is optional on the server
 * (check_middle_name returns None for blank), so a missing one is not a
 * problem to fix - and a red row for an absent middle initial would make the
 * common case look broken.
 *
 * Exported so the preview table can re-flag after an edit.
 */
export function withIssues(rows: ParsedRow[]): ParsedRow[] {
  const seen = new Map<string, number>();
  return rows.map(r => {
    const issues: string[] = [];
    if (!r.student_number) issues.push("Student number is missing.");
    if (!r.last_name) issues.push("Last name is missing.");
    if (!r.first_name) issues.push("First name is missing.");

    if (r.student_number) {
      const key = r.student_number.toLowerCase();
      const firstSeen = seen.get(key);
      if (firstSeen !== undefined) {
        issues.push(`Same student number as line ${firstSeen}.`);
      } else {
        seen.set(key, r.line);
      }
    }
    return { ...r, issues };
  });
}

/** The rows that can be sent. The rest stay on screen to be corrected. */
export function submittableRows(rows: readonly ParsedRow[]): ParsedRow[] {
  return rows.filter(r => r.issues.length === 0);
}

/**
 * A one-line summary of the parse, shown above the preview.
 *
 * Says the delimiter out loud: if a teacher pastes comma-separated text that
 * happens to contain one stray tab, every row will be wrong in the same way,
 * and "read as tab-separated" is the sentence that explains it.
 *
 * CHANGED 2026-11-14: it also says how the FOURTH column was read, because
 * that is the one thing about this parse that changed today and the one a
 * teacher with an older list would otherwise have to spot for herself.
 */
export function parseSummary(r: ParseResult): string {
  const n = r.rows.length;
  const bad = r.rows.filter(x => x.issues.length > 0).length;
  const bits = [`${n} row${n === 1 ? "" : "s"} read as ${r.delimiter}-separated`];
  if (r.skippedHeader) bits.push("header row skipped");
  if (r.fourthColumn === "middle") bits.push("4th column read as the middle name");
  if (r.fourthColumn === "section") bits.push("4th column read as the section");
  if (r.blankLines) bits.push(`${r.blankLines} blank line${r.blankLines === 1 ? "" : "s"} ignored`);
  if (bad) bits.push(`${bad} need${bad === 1 ? "s" : ""} fixing`);
  return bits.join(" · ") + ".";
}