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

const NOT_IN_LABEL_RELAXED = /[^\p{L}\p{N} '’‘"“”.,:;!?()[\]/&+#@_\-–—]/gu;
const NOT_IN_LABEL_STRICT = /[^\p{L}\p{N} .,()-]/gu;
const labelRe = (strict: boolean) =>
  strict ? NOT_IN_LABEL_STRICT : NOT_IN_LABEL_RELAXED;

const NOT_IN_SCHEDULE_STRICT = /[^\p{L}\p{N} .,():-]/gu;
const NOT_IN_SCHEDULE_RELAXED = NOT_IN_LABEL_RELAXED;
const scheduleRe = (strict: boolean) =>
  strict ? NOT_IN_SCHEDULE_STRICT : NOT_IN_SCHEDULE_RELAXED;

const NOT_IN_NAME_PART = /[^\p{L} .'’-]/gu;

const NOT_IN_DESCRIPTION_RELAXED = /[<>\u0000-\u001f\u007f]/gu;
const NOT_IN_DESCRIPTION_STRICT = /[^\p{L}\p{N} .,()\n-]/gu;

export function tidyText(v: string): string {
  return (v ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
}

export function tidyMultiline(v: string): string {
  return (v ?? "").normalize("NFC").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function listBad(v: string, re: RegExp): string[] {
  return [...new Set(v.match(re) ?? [])].sort();
}

const allowedSentence = (strict: boolean) =>
  strict ? "Use letters, numbers, spaces, and . , - ( ) only."
         : "Use letters, numbers, spaces and ordinary punctuation.";

const allowedScheduleSentence = (strict: boolean) =>
  strict ? "Use letters, numbers, spaces, and . , - ( ) : only."
         : "Use letters, numbers, spaces and ordinary punctuation.";

export const NAME_PART_SENTENCE = "Use letters, spaces, and . ' - only.";

export const NAME_PART_COMMA_HINT =
  "Enter the surname and the first name in their own boxes, " +
  'not "Surname, First name" in one.';

function badCharMessage(label: string, bad: string[], allowed: string): string {
  const shown = bad.map(c => (c.trim() === "" ? "a control character" : `"${c}"`)).join(", ");
  return `${label} cannot contain ${shown}. ${allowed}`;
}

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
  if (!v) return required ? "Middle name is required." : null;
  if (v.length > MAX_MIDDLE_NAME_LENGTH) {
    return `Middle name must be at most ${MAX_MIDDLE_NAME_LENGTH} characters.`;
  }
  return checkNamePart(v, "Middle name");
}

export const MAX_STUDENT_NUMBER_LENGTH = 50;
const NOT_IN_STUDENT_NUMBER = /[^\p{L}\p{N}-]/gu;

export const STUDENT_NUMBER_SENTENCE =
  "Use letters, numbers and - only, with no spaces.";

export function checkStudentNumber(raw: string): string | null {
  const v = tidyText(raw);
  if (!v) return "Student number is required.";
  if (v.length > MAX_STUDENT_NUMBER_LENGTH) {
    return `Student number must be at most ${MAX_STUDENT_NUMBER_LENGTH} characters.`;
  }
  if (!/[\p{L}\p{N}]/u.test(v)) {
    return "Student number must contain at least one letter or number.";
  }
  if (v.includes(" ")) {
    return `Student number cannot contain spaces. ${STUDENT_NUMBER_SENTENCE}`;
  }
  const bad = listBad(v, NOT_IN_STUDENT_NUMBER);
  if (bad.length) {
    return badCharMessage("Student number", bad, STUDENT_NUMBER_SENTENCE);
  }
  return null;
}

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

export interface NamedPaper {
  student_name: string;
  first_name?: string | null;
  last_name?: string | null;
}

export function paperLastName(p: NamedPaper): string {
  const last = (p.last_name ?? "").trim();
  if (last) return last;
  const i = p.student_name.indexOf(",");
  return i > 0 ? p.student_name.slice(0, i).trim() : p.student_name.trim();
}

export function paperFirstName(p: NamedPaper): string {
  const first = (p.first_name ?? "").trim();
  if (first) return first;
  const i = p.student_name.indexOf(",");
  return i > 0 ? p.student_name.slice(i + 1).trim() : "";
}

export function needsNameSplit(p: NamedPaper): boolean {
  return !(p.last_name ?? "").trim() || !(p.first_name ?? "").trim();
}

export function bySurname(a: NamedPaper, b: NamedPaper): number {
  const l = paperLastName(a).localeCompare(paperLastName(b), undefined, { sensitivity: "base" });
  if (l !== 0) return l;
  return paperFirstName(a).localeCompare(paperFirstName(b), undefined, { sensitivity: "base" });
}