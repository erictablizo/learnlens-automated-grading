/**
 * NEW 2026-10-22 — character rules for the exam and paper text fields.
 *
 * Doc Rubrica, third clarification: the same UPPERCASE / lowercase / special
 * character comment applies to the fields in her screenshots —
 *     Create Exam     Exam Name, Description
 *     Edit Exam       Exam Name, Description
 *     Add Paper       Name
 *     Edit Paper      Name
 *
 * THE ALLOWED SETS ARE NOT INVENTED. They were read out of
 * learnlens_schema.sql, from every row already stored, so that no record that
 * exists today becomes un-editable:
 *
 *     exams.exam_name        33 rows   uses  space ( )      e.g. "Midterm (True or False Only)"
 *     exams.description      33 rows   uses  space          e.g. "BSCS1A Midterm 1"
 *     test_papers.student_name 18 rows uses  space , - .    e.g. "Midterm - Tablizo, Eric Grace"
 *
 * Column limits, also from the schema:
 *     exams.exam_name          varchar(255), CHECK char_length >= 7
 *     exams.description        text  (no DB limit — capped here for sanity)
 *     test_papers.student_name varchar(255)
 *
 * These rules MUST stay identical to the ones in backend/app/schemas/exam.py
 * and backend/app/schemas/paper.py. Change one, change the other.
 *
 *     Save as: frontend/src/lib/textField.ts
 */

// ── Doc Rubrica, 2026-10-22, third clarification ──────────────────────────
// "it should not accept special characters AND COMBINATION OF SPECIAL
//  CHARACTERS AND LETTER" - so "Eric@" is refused for the same reason "@@@"
//  is. STRICT = letters, numbers and spaces. Nothing else.
//
// MEASURED COST against learnlens_schema.sql as it stands today:
//     test_papers.student_name   18 of 18 rows REFUSED   <- every paper
//     user_profiles.first_name    3 of  6 rows REFUSED   <- "Eric Bernard R."
//     exams.exam_name             1 of 33 rows REFUSED
// Those rows are UN-EDITABLE until renamed - see schemas/_text.py.
//
// Keep these three in step with STRICT_* in backend/app/schemas/_text.py.
export const STRICT_EXAM_NAME = true;
export const STRICT_DESCRIPTION = true;
export const STRICT_STUDENT_NAME = true;

export const MIN_EXAM_NAME_LENGTH = 7;     // mirrors exams_exam_name_check
export const MAX_EXAM_NAME_LENGTH = 255;
export const MAX_DESCRIPTION_LENGTH = 2000;
export const MAX_STUDENT_NAME_LENGTH = 255;

/** Letters in ANY alphabet. */
const A_LETTER = /\p{L}/u;

/**
 * A LABEL — an exam name or a paper name. Letters, numbers, spaces and the
 * punctuation that labels actually use. The set starts from what is already
 * in the database (space, parentheses, comma, hyphen, period) and adds the
 * near neighbours a teacher would reasonably reach for.
 *
 * Deliberately NOT allowed: < > so a name can never be mistaken for markup,
 * and control characters.
 */
const NOT_IN_LABEL_RELAXED = /[^\p{L}\p{N} '’‘"“”.,:;!?()[\]/&+#@_\-–—]/gu;
/** STRICT: letters, numbers and the space between words. Nothing else. */
const NOT_IN_LABEL_STRICT = /[^\p{L}\p{N} ]/gu;
const labelRe = (strict: boolean) =>
  strict ? NOT_IN_LABEL_STRICT : NOT_IN_LABEL_RELAXED;

/**
 * A DESCRIPTION is prose, so it is permissive: anything printable except
 * angle brackets and control characters. It still must contain a letter, so
 * "123" and "!!!" are refused the same way they are everywhere else.
 */
const NOT_IN_DESCRIPTION_RELAXED = /[<>\u0000-\u001f\u007f]/gu;
const NOT_IN_DESCRIPTION_STRICT = /[^\p{L}\p{N} \n]/gu;

/** Collapse runs of whitespace and trim; NFC-normalise. Same as the server. */
export function tidyText(v: string): string {
  return (v ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
}

/** Newlines are kept in a description; only trailing/leading space is trimmed. */
export function tidyMultiline(v: string): string {
  return (v ?? "").normalize("NFC").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function listBad(v: string, re: RegExp): string[] {
  return [...new Set(v.match(re) ?? [])].sort();
}

const allowedSentence = (strict: boolean) =>
  strict ? "Use letters, numbers and spaces only."
         : "Use letters, numbers, spaces and ordinary punctuation.";

function badCharMessage(label: string, bad: string[], allowed: string): string {
  const shown = bad.map(c => (c.trim() === "" ? "a control character" : `"${c}"`)).join(", ");
  return `${label} cannot contain ${shown}. ${allowed}`;
}

/** Returns null when acceptable, or the message to show. */
export function checkExamName(raw: string): string | null {
  const v = tidyText(raw);
  if (!v) return "Exam name is required.";
  if (v.length < MIN_EXAM_NAME_LENGTH) {
    return `Exam name must be at least ${MIN_EXAM_NAME_LENGTH} characters long.`;
  }
  if (v.length > MAX_EXAM_NAME_LENGTH) {
    return `Exam name must be at most ${MAX_EXAM_NAME_LENGTH} characters.`;
  }
  if (!A_LETTER.test(v)) return "Exam name must contain at least one letter.";
  const bad = listBad(v, labelRe(STRICT_EXAM_NAME));
  if (bad.length) {
    return badCharMessage("Exam name", bad, allowedSentence(STRICT_EXAM_NAME));
  }
  return null;
}

export function checkDescription(raw: string): string | null {
  const v = tidyMultiline(raw);
  if (!v) return "Description is required.";
  if (v.length > MAX_DESCRIPTION_LENGTH) {
    return `Description must be at most ${MAX_DESCRIPTION_LENGTH} characters.`;
  }
  if (!A_LETTER.test(v)) return "Description must contain at least one letter.";
  const bad = listBad(v, STRICT_DESCRIPTION ? NOT_IN_DESCRIPTION_STRICT
                                            : NOT_IN_DESCRIPTION_RELAXED);
  if (bad.length) {
    return badCharMessage("Description", bad, allowedSentence(STRICT_DESCRIPTION));
  }
  return null;
}

export function checkStudentName(raw: string): string | null {
  const v = tidyText(raw);
  if (!v) return "Student name is required.";
  if (v.length > MAX_STUDENT_NAME_LENGTH) {
    return `Student name must be at most ${MAX_STUDENT_NAME_LENGTH} characters.`;
  }
  if (!A_LETTER.test(v)) return "Student name must contain at least one letter.";
  const bad = listBad(v, labelRe(STRICT_STUDENT_NAME));
  if (bad.length) {
    return badCharMessage("Student name", bad, allowedSentence(STRICT_STUDENT_NAME));
  }
  return null;
}