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
 * Pure functions, no React, no network — measured by
 * measure/2026-11-12_student_paste.mjs.
 */

/** One line of the paste, after splitting. `line` is 1-based in the ORIGINAL text. */
export interface ParsedRow {
  line: number;
  student_number: string;
  last_name: string;
  first_name: string;
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
}

const HEADER_WORDS = [
  "id", "no", "no.", "number", "student", "student no", "student number",
  "last", "last name", "surname", "family name",
  "first", "first name", "given", "given name",
  "section", "class", "year",
];

/**
 * TAB WINS OVER COMMA, whenever any line has one.
 *
 * A tab means the list came out of a spreadsheet, where the columns are
 * already separated correctly and a comma inside a cell ("Smith, Jr.") is just
 * text. Splitting that on commas would break the one case the teacher has
 * already got right. Decided per-paste rather than per-line so the preview
 * cannot show two rows parsed by different rules.
 */
function pickDelimiter(lines: string[]): "tab" | "comma" {
  return lines.some(l => l.includes("\t")) ? "tab" : "comma";
}

function looksLikeHeader(fields: string[]): boolean {
  if (fields.length < 2) return false;
  // A header row has no digits in the ID column - a real student number almost
  // always does - and its words are column names.
  const first = fields[0].toLowerCase();
  if (/\d/.test(first)) return false;
  return fields
    .slice(0, 3)
    .every(f => HEADER_WORDS.includes(f.trim().toLowerCase().replace(/[_-]/g, " ")));
}

/**
 * Parse pasted text into rows.
 *
 * Field order is NUMBER, LAST, FIRST, SECTION — the order the panel's item 4
 * implies ("Test Paper -> ID # Student") and the order the roster table shows.
 *
 * Three or more fields: the first three are taken positionally and anything
 * after them is joined back together as the section, so a section containing a
 * comma survives. Fewer than three: whatever is present is filled in from the
 * left and the missing pieces are flagged, because a half-read line is more
 * useful to correct than a rejected one.
 */
export function parseStudentPaste(text: string, defaultSection = ""): ParseResult {
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
  const rows: ParsedRow[] = [];
  let skippedHeader = false;

  nonBlank.forEach((entry, idx) => {
    const fields = split(entry.text);

    if (idx === 0 && looksLikeHeader(fields)) {
      skippedHeader = true;
      return;
    }

    const [number = "", last = "", first = ""] = fields;
    // Everything past the third field is the section, rejoined - so
    // "BSCS 3A, morning" survives a comma-separated paste.
    const rest = fields.slice(3).filter(f => f !== "").join(", ");

    const row: ParsedRow = {
      line: entry.line,
      student_number: collapse(number),
      last_name: collapse(last),
      first_name: collapse(first),
      section: collapse(rest) || sect,
      issues: [],
    };
    rows.push(row);
  });

  return { rows: withIssues(rows), delimiter, skippedHeader, blankLines };
}

/** Whitespace collapsed, matching what the backend stores (2026-11-10 rule). */
function collapse(v: string): string {
  return (v || "").split(/\s+/).filter(Boolean).join(" ");
}

/**
 * Flag what cannot be submitted, and what is a duplicate WITHIN the paste.
 *
 * Duplicates are checked here as well as on the server because the two answers
 * are different: the server knows who is already on the roster, the browser
 * knows that line 7 and line 22 of THIS list are the same number. The second
 * is a mistake in the list, and the teacher can fix it before sending
 * anything.
 *
 * Exported so the preview table can re-flag after an edit.
 */
export function withIssues(rows: ParsedRow[]): ParsedRow[] {
  // Matches student_service.norm_number(): lower(trim(...)) with internal
  // whitespace collapsed. If these two ever disagree the browser will accept a
  // pair the database then rejects.
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
 */
export function parseSummary(r: ParseResult): string {
  const n = r.rows.length;
  const bad = r.rows.filter(x => x.issues.length > 0).length;
  const bits = [`${n} row${n === 1 ? "" : "s"} read as ${r.delimiter}-separated`];
  if (r.skippedHeader) bits.push("header row skipped");
  if (r.blankLines) bits.push(`${r.blankLines} blank line${r.blankLines === 1 ? "" : "s"} ignored`);
  if (bad) bits.push(`${bad} need${bad === 1 ? "s" : ""} fixing`);
  return bits.join(" · ") + ".";
}