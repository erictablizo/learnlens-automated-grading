export const STRICT_EXAM_NAME = true;
export const STRICT_DESCRIPTION = true;
export const STRICT_STUDENT_NAME = true;
export const STRICT_SUBJECT = true;        // NEW 2026-11-04
export const STRICT_SCHEDULE = true;       // NEW 2026-11-04
 
export const MIN_EXAM_NAME_LENGTH = 7;     // mirrors exams_exam_name_check
export const MAX_EXAM_NAME_LENGTH = 255;
export const MAX_DESCRIPTION_LENGTH = 2000;
export const MAX_STUDENT_NAME_LENGTH = 255;
export const MAX_SUBJECT_LENGTH = 255;     // NEW 2026-11-04
export const MAX_SCHEDULE_LENGTH = 255;    // NEW 2026-11-04
export const MAX_NAME_PART_LENGTH = 255;   // NEW 2026-11-04
 
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
/** STRICT, 2026-10-23. Letters, numbers, the space between words, and a
 *  CLOSED LIST OF FIVE MARKS. Not "punctuation" — these five and nothing else.
 *
 *  Taken from the values the teacher actually types, not from taste:
 *
 *      Midterm - Alcantara, Ben R.   hyphen, comma, period (middle initial)
 *      Eric Tablizo                  nothing
 *      Midterm (Set A)               parentheses
 *      Prelim - Math                 hyphen
 *
 *  One set covers Exam Name, Description, Student Name and SUBJECT, because
 *  the same string can legitimately be typed in any of them — "Prelim - Math"
 *  is as good an exam name as it is a description or a subject. The separate
 *  student-name set and its `student` flag are gone.
 *
 *  STILL REFUSED, so Doc Rubrica's 2026-10-22 rule holds where it was aimed:
 *      @ # $ % ^ & * / \ ' " _ + = : ; ! ? [ ] { } < > ~ | and the en-dash.
 *  "Ben@", "Eric@#$" and "@@@" all fail exactly as they did.
 *
 *  A STUDENT'S NAME PART is a different, narrower set — see
 *  NOT_IN_NAME_PART below. A TEACHER's own name is narrower still and lives
 *  in lib/personName.ts: letters, space and a period.
 *
 *  The HYPHEN is written last so it is a literal hyphen, not a range.
 *  Matches _STRICT_MARKS in backend/app/schemas/_text.py. */
const NOT_IN_LABEL_STRICT = /[^\p{L}\p{N} .,()-]/gu;
const labelRe = (strict: boolean) =>
  strict ? NOT_IN_LABEL_STRICT : NOT_IN_LABEL_RELAXED;
 
/**
 * SCHEDULE, NEW 2026-11-04 (Doc Rubrica, consultation).
 *
 * The one field that gets a SIXTH mark — the COLON — because her own written
 * examples are clock times:
 *
 *     1:00pm to 12pm      refused by the five marks  ->  needs ":"
 *     11:00AM - 7pm       refused by the five marks  ->  needs ":"
 *     12:00 PM            refused by the five marks  ->  needs ":"
 *     1:00 - 3:00         refused by the five marks  ->  needs ":"
 *
 * MEASURED 2026-11-04: 4 of her 5 example values are refused by the shared
 * five-mark set. Schedule therefore gets its OWN class rather than the shared
 * one being widened — widening would let a colon into an exam name and a
 * description, which is exactly where her rule was aimed.
 *
 * The HYPHEN is last, same reason as above. Mirrors _SCHEDULE_STRICT_MARKS
 * in backend/app/schemas/_text.py.
 */
const NOT_IN_SCHEDULE_STRICT = /[^\p{L}\p{N} .,():-]/gu;
/** The relaxed label class already contains a colon, so schedule shares it. */
const NOT_IN_SCHEDULE_RELAXED = NOT_IN_LABEL_RELAXED;
const scheduleRe = (strict: boolean) =>
  strict ? NOT_IN_SCHEDULE_STRICT : NOT_IN_SCHEDULE_RELAXED;
 
/**
 * A STUDENT'S NAME PART — first_name or last_name.
 *                               NEW 2026-11-04 (Doc Rubrica, page 4)
 *
 * This set is NOT invented either. It is NOT_IN_NAME_RELAXED from
 * lib/personName.ts — the set this codebase already wrote down for person
 * names on 2026-10-22 — with the COMMA removed. MEASURED: those two sets
 * differ by exactly one character, the comma, and the comma is the character
 * the split is being made ON. A comma inside last_name means the teacher
 * typed both names into one box.
 *
 * It is NOT personName.ts's ACTIVE set, /[^\p{L} .]/gu. MEASURED 2026-11-04
 * over 28 realistic Filipino names, that refuses 7, including every
 * hyphenated surname:
 *
 *     Dela Cruz-Santos   refused by the teacher-name set
 *     Reyes-Ramos        refused by the teacher-name set
 *     Villanueva-Lim     refused by the teacher-name set
 *     Anne-Marie         refused by the teacher-name set
 *     O'Brien, D'Souza   refused by the teacher-name set AND by the label set
 *
 * — and student_name accepts all of them TODAY under NOT_IN_LABEL_STRICT.
 * Reusing the teacher-name set would be a REGRESSION.
 *
 * It is NOT NOT_IN_LABEL_STRICT either: that allows digits, parentheses and
 * the comma. No \p{N} here — a digit in a name is the thing her 2026-10-22
 * comment was aimed at, and "Eric 2" is the one value of the 28 this set
 * refuses.
 *
 * KNOWN LIMITATION: "Midterm - Alcantara" PASSES. It is name-shaped, so no
 * character rule can catch the exam-name-baked-into-the-field mistake. What
 * prevents it recurring is Add Paper having two separate boxes.
 *
 * Hyphen LAST, so it is a literal hyphen and not a range.
 * Matches _NAME_PART_MARKS in backend/app/schemas/_text.py.
 */
const NOT_IN_NAME_PART = /[^\p{L} .'’-]/gu;
 
/**
 * A DESCRIPTION is prose, so it is permissive: anything printable except
 * angle brackets and control characters. It still must contain a letter, so
 * "123" and "!!!" are refused the same way they are everywhere else.
 */
const NOT_IN_DESCRIPTION_RELAXED = /[<>\u0000-\u001f\u007f]/gu;
/** Same five marks as a label, plus the newline prose needs. */
const NOT_IN_DESCRIPTION_STRICT = /[^\p{L}\p{N} .,()\n-]/gu;
 
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
 
/** Must match _allowed() in backend/app/schemas/_text.py word for word. */
const allowedSentence = (strict: boolean) =>
  strict ? "Use letters, numbers, spaces, and . , - ( ) only."
         : "Use letters, numbers, spaces and ordinary punctuation.";
 
/** Must match _allowed_schedule() in backend/app/schemas/_text.py word for
 *  word. The only difference from allowedSentence() is the colon. */
const allowedScheduleSentence = (strict: boolean) =>
  strict ? "Use letters, numbers, spaces, and . , - ( ) : only."
         : "Use letters, numbers, spaces and ordinary punctuation.";
 
/** NEW 2026-11-04. Matches NAME_PART_SENTENCE in _text.py. */
export const NAME_PART_SENTENCE = "Use letters, spaces, and . ' - only.";
 
/** NEW 2026-11-04. The one mistake a validator can actually help with.
 *  Matches NAME_PART_COMMA_HINT in _text.py. */
export const NAME_PART_COMMA_HINT =
  "Enter the surname and the first name in their own boxes, " +
  'not "Surname, First name" in one.';
 
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
 
// ── NEW 2026-11-04 (Doc Rubrica, consultation) ───────────────────────────────
// "2 additional Fields in Exam Info Table": Subject and Schedule.
 
/**
 * SUBJECT uses the SHARED five marks. A subject is "English101" or
 * "Math 101 (Set A)" and needs nothing an exam name does not.
 * Mirrors check_subject() in _text.py.
 */
export function checkSubject(raw: string): string | null {
  const v = tidyText(raw);
  if (!v) return "Subject is required.";
  if (v.length > MAX_SUBJECT_LENGTH) {
    return `Subject must be at most ${MAX_SUBJECT_LENGTH} characters.`;
  }
  if (!A_LETTER.test(v)) return "Subject must contain at least one letter.";
  const bad = listBad(v, labelRe(STRICT_SUBJECT));
  if (bad.length) {
    return badCharMessage("Subject", bad, allowedSentence(STRICT_SUBJECT));
  }
  return null;
}
 
/**
 * SCHEDULE uses its own class, which adds the COLON — see
 * NOT_IN_SCHEDULE_STRICT above. Mirrors check_schedule() in _text.py.
 *
 * Note what is NOT here: the "must contain at least one letter" test every
 * other field carries. "1:00 - 3:00" is a legitimate schedule with no letters
 * in it, and refusing it would be refusing the teacher's own shorthand.
 */
export function checkSchedule(raw: string): string | null {
  const v = tidyText(raw);
  if (!v) return "Schedule is required.";
  if (v.length > MAX_SCHEDULE_LENGTH) {
    return `Schedule must be at most ${MAX_SCHEDULE_LENGTH} characters.`;
  }
  const bad = listBad(v, scheduleRe(STRICT_SCHEDULE));
  if (bad.length) {
    return badCharMessage("Schedule", bad, allowedScheduleSentence(STRICT_SCHEDULE));
  }
  return null;
}
 
// ── NEW 2026-11-04 (Doc Rubrica, consultation, page 4) ───────────────────────
// "Split Name to Last Name & First Name" / "Paper Table: [Last Name]
// [First Name]" / "1 additional field: First Name"
 
/**
 * One STUDENT name part. `label` is what the teacher sees: "Last name" /
 * "First name". Mirrors check_name_part() in _text.py, including the order of
 * the checks: required, length, at-least-one-letter, characters.
 */
export function checkNamePart(raw: string, label: string): string | null {
  const v = tidyText(raw);
  if (!v) return `${label} is required.`;
  if (v.length > MAX_NAME_PART_LENGTH) {
    return `${label} must be at most ${MAX_NAME_PART_LENGTH} characters.`;
  }
  if (!A_LETTER.test(v)) return `${label} must contain at least one letter.`;
  const bad = listBad(v, NOT_IN_NAME_PART);
  if (bad.length) {
    // The comma gets its own sentence, because a comma here is not a stray
    // character - it is the teacher having typed "Surname, First name" into
    // one box, which is a different mistake needing a different instruction.
    const tail = bad.includes(",") ? NAME_PART_COMMA_HINT : NAME_PART_SENTENCE;
    return badCharMessage(label, bad, tail);
  }
  return null;
}
 
/**
 * student_name is DERIVED now - the server composes it in
 * paper_service.create_paper / rename_paper and keeps it, because it is read
 * in at least six places and is the rollback the 2026-11-04 migration promises.
 * This copy exists so the browser can show the composed value before the round
 * trip. Matches compose_student_name() in _text.py.
 */
export function composeStudentName(lastName: string, firstName: string): string {
  return `${tidyText(lastName)}, ${tidyText(firstName)}`;
}
 
/**
 * DISPLAY and SORT for a MIXED table.
 *
 * After the migration the paper list holds two kinds of row at once: papers
 * entered from now on, which have first_name and last_name, and the 18 that
 * existed before, which have only student_name and NULL in both new columns.
 * Every list and table has to render both without a branch at each call site.
 */
export interface NamedPaper {
  student_name: string;
  first_name?: string | null;
  last_name?: string | null;
}
 
export function paperLastName(p: NamedPaper): string {
  const last = (p.last_name ?? "").trim();
  if (last) return last;
  // Legacy row. The comma is the only separator that was ever reliable, and on
  // a value like "Midterm - Alcantara, Ben R." it is still wrong - which is why
  // this is for DISPLAY ONLY and nothing writes it back to the column.
  const i = p.student_name.indexOf(",");
  return i > 0 ? p.student_name.slice(0, i).trim() : p.student_name.trim();
}
 
export function paperFirstName(p: NamedPaper): string {
  const first = (p.first_name ?? "").trim();
  if (first) return first;
  const i = p.student_name.indexOf(",");
  return i > 0 ? p.student_name.slice(i + 1).trim() : "";
}
 
/** True when this row still needs splitting by hand. PapersTable shows a
 *  marker on these: MEASURED, "Midterm - Alcantara" with an ASCII hyphen
 *  pre-fills, passes checkNamePart and saves wrong unless someone notices. */
export function needsNameSplit(p: NamedPaper): boolean {
  return !(p.last_name ?? "").trim() || !(p.first_name ?? "").trim();
}
 
/**
 * "Sorted in order … Alphabetical, surname" (Doc Rubrica, page 2).
 * Mirrors ix_test_papers_exam_lastname: lower(last_name), lower(first_name).
 * localeCompare so "Ñoño" sorts next to "Nono" rather than after "Zuniga".
 */
export function bySurname(a: NamedPaper, b: NamedPaper): number {
  const l = paperLastName(a).localeCompare(paperLastName(b), undefined, { sensitivity: "base" });
  if (l !== 0) return l;
  return paperFirstName(a).localeCompare(paperFirstName(b), undefined, { sensitivity: "base" });
}