export const STRICT_EXAM_NAME = true;
export const MAX_NAME_PART_LENGTH = 255;   // NEW 2026-11-04

/** Letters in ANY alphabet. */
const A_LETTER = /\p{L}/u;

const NOT_IN_LABEL_STRICT = /[^\p{L}\p{N} .,()-]/gu;
const NOT_IN_LABEL_RELAXED = /[^\p{L}\p{N} '’‘"“”.,:;!?()[\]/&+#@_\-–—]/gu;
const labelRe = (strict: boolean) =>
  strict ? NOT_IN_LABEL_STRICT : NOT_IN_LABEL_RELAXED;

/** Must match _allowed() in backend/app/schemas/_text.py word for word. */
const allowedSentence = (strict: boolean) =>
  strict ? "Use letters, numbers, spaces, and . , - ( ) only."
         : "Use letters, numbers, spaces and ordinary punctuation.";

/**
 * A STUDENT'S NAME PART — first_name or last_name.
 * Hyphen LAST, so it is a literal hyphen and not a range.
 * Matches _NAME_PART_MARKS in backend/app/schemas/_text.py.
 */
const NOT_IN_NAME_PART = /[^\p{L} .'’-]/gu;

/** Collapse runs of whitespace and trim; NFC-normalise. Same as the server. */
export function tidyText(v: string): string {
  return (v ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
}

function listBad(v: string, re: RegExp): string[] {
  return [...new Set(v.match(re) ?? [])].sort();
}

/** NEW 2026-11-04. Matches NAME_PART_SENTENCE in _text.py. */
export const NAME_PART_SENTENCE = "Use letters, spaces, and . ' - only.";

export const NAME_PART_COMMA_HINT =
  "Enter the surname and the first name in their own boxes, " +
  'not "Surname, First name" in one.';

function badCharMessage(label: string, bad: string[], allowed: string): string {
  const shown = bad.map(c => (c.trim() === "" ? "a control character" : `"${c}"`)).join(", ");
  return `${label} cannot contain ${shown}. ${allowed}`;
}

/**
 * `commaHint` is NEW 2026-11-16, defaulting to the old behaviour so every
 * existing call site is unchanged. lib/personName.ts passes false for the
 * teacher's POSITION, where NAME_PART_COMMA_HINT names boxes that field has
 * no copy of. Matches check_name_part(..., comma_hint=) in _text.py.
 */
export function checkNamePart(raw: string, label: string,
                              commaHint = true): string | null {
  const v = tidyText(raw);
  if (!v) return `${label} is required.`;
  if (v.length > MAX_NAME_PART_LENGTH) {
    return `${label} must be at most ${MAX_NAME_PART_LENGTH} characters.`;
  }
  if (!A_LETTER.test(v)) return `${label} must contain at least one letter.`;
  const bad = listBad(v, NOT_IN_NAME_PART);
  if (bad.length) {
    const tail = (bad.includes(",") && commaHint)
      ? NAME_PART_COMMA_HINT : NAME_PART_SENTENCE;
    return badCharMessage(label, bad, tail);
  }
  return null;
}

export const MAX_MIDDLE_NAME_LENGTH = 100;

export function middleInitial(v: string | null | undefined): string {
  const s = tidyText(v ?? "");
  if (!s) return "";
  return s.length === 1 && /^\p{L}$/u.test(s) ? `${s}.` : s;
}

export function checkMiddleName(raw: string, required = false): string | null {
  const v = tidyText(raw);
  // CHANGED 2026-11-15: required= rather than a second function, matching
    // check_middle_name(v, required) on the server.
    if (!v) return required ? "Middle name is required." : null;
  if (v.length > MAX_MIDDLE_NAME_LENGTH) {
    return `Middle name must be at most ${MAX_MIDDLE_NAME_LENGTH} characters.`;
  }
  return checkNamePart(v, "Middle name");
}

/**
 * THE STUDENT NUMBER, NEW 2026-11-15 (Grace, post-UAT).
 *
 * The browser had no rule for this field at all - check_number() on the
 * server tested only for blank, and nothing here tested anything. MEASURED:
 * students.student_number is varchar(50) with no length check anywhere, so a
 * 51-character number reached PostgreSQL as a driver error, a 500 rather than
 * a 422 naming the field.
 *
 * A FOURTH class, and the narrowest in this file: letters, digits, hyphen.
 *
 *     2021-00123      the panel's own example paper
 *     202300000001    the live roster
 *     2021-A123       a LETTER is legal - ux_students_owner_number indexes
 *                     lower(trim(student_number)), which is only meaningful
 *                     if a number can carry one
 *
 * NO SPACE, deliberately. norm_number()'s docstring describes "2021 - 00123"
 * pasted out of a spreadsheet; that is refused from now on rather than
 * stored. Rows already in the database are untouched.
 *
 * \p{N} and \p{L} rather than [0-9A-Za-z], to stay consistent with every
 * other class here. Hyphen LAST so it is a literal hyphen, not a range.
 * Matches _STUDENT_NUMBER_MARKS in backend/app/schemas/_text.py.
 */
export const MAX_STUDENT_NUMBER_LENGTH = 50;
const NOT_IN_STUDENT_NUMBER = /[^\p{L}\p{N}-]/gu;

/** Matches STUDENT_NUMBER_SENTENCE in backend/app/schemas/_text.py. */
export const STUDENT_NUMBER_SENTENCE =
  "Use letters, numbers and - only, with no spaces.";

/**
 * Mirrors check_student_number() in _text.py, including the ORDER of the
 * tests - required, length, at-least-one-alphanumeric, characters - so the
 * two never disagree about which message a bad value earns.
 *
 * There is no "must contain a letter" test: a student number is normally all
 * digits. The alphanumeric test is what stops "---" passing a rule built out
 * of allowed marks.
 */
export function checkStudentNumber(raw: string): string | null {
  const v = tidyText(raw);
  if (!v) return "Student number is required.";
  if (v.length > MAX_STUDENT_NUMBER_LENGTH) {
    return `Student number must be at most ${MAX_STUDENT_NUMBER_LENGTH} characters.`;
  }
  if (!/[\p{L}\p{N}]/u.test(v)) {
    return "Student number must contain at least one letter or number.";
  }
  // The SPACE gets its own sentence, before the general character test -
  // badCharMessage prints whitespace as "a control character", which is
  // nonsense to a teacher looking at "2021 - 00123" out of a spreadsheet.
  if (v.includes(" ")) {
    return `Student number cannot contain spaces. ${STUDENT_NUMBER_SENTENCE}`;
  }
  const bad = listBad(v, NOT_IN_STUDENT_NUMBER);
  if (bad.length) {
    return badCharMessage("Student number", bad, STUDENT_NUMBER_SENTENCE);
  }
  return null;
}


/**
 * THE SECTION, NEW 2026-11-15 (Grace, post-UAT).
 *
 * It had no rule on either side. _section() on the server collapsed
 * whitespace and capped the length; the browser did not look at it at all.
 *
 * It reuses the LABEL class, not a new one - a section is a label, and
 * NOT_IN_LABEL_STRICT already means letters, numbers, space and . , ( ) -
 *
 * THE COMMA IS LOAD-BEARING: lib/studentPaste.ts rejoins a trailing comma
 * into the section so "BSCS 3A, morning" survives a comma-separated paste.
 *
 * ONE DEVIATION from the other label checks: at least one letter OR DIGIT,
 * because a section can legitimately be "101". It still refuses "---".
 *
 * Matches check_section() in backend/app/schemas/_text.py.
 */
export const MAX_SECTION_LENGTH = 255;

export function checkSection(raw: string, required = false): string | null {
  const v = tidyText(raw);
  if (!v) return required ? "Section is required." : null;
  if (v.length > MAX_SECTION_LENGTH) {
    return `Section must be at most ${MAX_SECTION_LENGTH} characters.`;
  }
  if (!/[\p{L}\p{N}]/u.test(v)) {
    return "Section must contain at least one letter or number.";
  }
  const bad = listBad(v, labelRe(STRICT_EXAM_NAME));
  if (bad.length) {
    return badCharMessage("Section", bad, allowedSentence(STRICT_EXAM_NAME));
  }
  return null;
}


export function composeStudentName(lastName: string, firstName: string,
                                   middleName?: string | null): string {
  const base = `${tidyText(lastName)}, ${tidyText(firstName)}`;
  const mid = middleInitial(middleName);
  return mid ? `${base} ${mid}` : base;
}