/**
 * NEW 2026-10-22 — character rules for the profile text fields.
 *
 * Doc Rubrica, after the demo, second clarification:
 *   "case sensitive (UPPERCASE, LOWERCASE, and Special Characters like not
 *    letters and not numbers. NOT FOR JUST PASSWORD but when you're Setting
 *    up your profile)"
 *
 * Before today `ProfileSetup` in backend/app/schemas/profile.py had NO
 * validators of any kind — not one. It is the only text-field surface in
 * LearnLens that never got the 1 Oct "strip before you test for blank" work
 * that schemas/exam.py and schemas/paper.py did. So the API accepted
 * first_name = "123", "<script>alert(1)</script>", "!!!!" or "   ", and the
 * sidebar renders that on EVERY screen of the system.
 *
 * These rules MUST stay identical to _check_person_name() / _check_position()
 * in backend/app/schemas/profile.py — same order, same wording. The browser
 * copy is so the teacher is told before the round trip; the server copy is the
 * one that protects the data. Change one, change the other.
 *
 *     Save as: frontend/src/lib/personName.ts
 */

// CORRECTED 2026-10-22 against learnlens_schema.sql, which is the only thing
// that settles these. The first version guessed 100 for BOTH and was half
// right: position is varchar(255), so a 150-character title was refused by
// the app for no reason the database would have agreed with.
//     user_profiles.first_name   character varying(100)
//     user_profiles.last_name    character varying(100)
//     user_profiles."position"   character varying(255)
export const MAX_NAME_LENGTH = 100;
export const MAX_POSITION_LENGTH = 255;

/** Letters in ANY alphabet. "Ñ", "é", "ü" are letters; "1" and "@" are not. */
const A_LETTER = /\p{L}/u;

/** A NAME may contain letters, spaces, and the four marks that appear in real
 *  names: apostrophe (O'Brien), hyphen (Dela Cruz-Santos), period (Ben R.)
 *  and comma. Digits are NOT allowed — no person's name is "Eric 2". */
const NOT_IN_NAME_RELAXED = /[^\p{L} '’.,-]/gu;

/** A POSITION may also contain digits, because Philippine academic ranks are
 *  written both ways: "Instructor I" and "Teacher 1". It also allows & / ( )
 *  for things like "Professor (Part-time)" and "Dean & Professor". */
const NOT_IN_POSITION_RELAXED = /[^\p{L}\p{N} '’.,&/()-]/gu;

/** Doc Rubrica, 2026-10-22: "it should not accept special characters and
 *  combination of special characters and Letter". STRICT = letters and the
 *  space between words; a Position may also hold numbers ("Instructor II",
 *  "Teacher 1"). Keep in step with STRICT_PERSON_NAME in schemas/profile.py.
 *
 *  CHANGED 2026-10-23 — the PERIOD is allowed in a NAME again, and only in a
 *  name: "Name in Set Up and Edit Profile can accept . for the Middle Initial
 *  of the Teacher". So "Eric Bernard R." is accepted, and so is "Ma. Teresa",
 *  while "Eric@" and "O'Brien" stay refused. This is a deliberate, named
 *  exception to the 2026-10-22 rule, not a rollback of it — every other mark
 *  is still out, and POSITION is unchanged (no period there).
 *
 *  MEASURED COST, re-run against learnlens_schema.sql after this change:
 *  first_name 0 of 6 refused (was 3 of 6 — all three were the middle-initial
 *  period), last_name 0 of 6, position 0 of 6. Nothing in the profile table
 *  is un-editable any more. */
export const STRICT_PERSON_NAME = true;
/** The period is here for a middle initial — "Eric Bernard R.". */
const NOT_IN_NAME_STRICT = /[^\p{L} .]/gu;
const NOT_IN_POSITION_STRICT = /[^\p{L}\p{N} ]/gu;
const NOT_IN_NAME = STRICT_PERSON_NAME ? NOT_IN_NAME_STRICT : NOT_IN_NAME_RELAXED;
const NOT_IN_POSITION = STRICT_PERSON_NAME ? NOT_IN_POSITION_STRICT : NOT_IN_POSITION_RELAXED;

/** Collapse runs of whitespace and trim. "  Eric   Bernard " -> "Eric Bernard".
 *  NFC so that an accent typed as a combining mark counts as one character. */
export function tidyName(v: string): string {
  return v.normalize("NFC").replace(/\s+/g, " ").trim();
}

function listBad(v: string, re: RegExp): string[] {
  const seen = new Set<string>(v.match(re) ?? []);
  return [...seen].sort();
}

/**
 * Returns null when acceptable, or the message to show.
 * `label` is what the teacher sees: "First name", "Last name".
 * A blank value is NOT an error here — it means "not filled in yet", which
 * Skip for now relies on. Required-ness is a separate rule, enforced by the
 * form, exactly as it is today.
 */
export function checkPersonName(raw: string, label: string): string | null {
  const v = tidyName(raw ?? "");
  if (!v) return null;
  if (v.length > MAX_NAME_LENGTH) {
    return `${label} must be at most ${MAX_NAME_LENGTH} characters.`;
  }
  if (!A_LETTER.test(v)) {
    return `${label} must contain at least one letter.`;
  }
  const bad = listBad(v, NOT_IN_NAME);
  if (bad.length) {
    return `${label} cannot contain ${bad.map(c => `"${c}"`).join(", ")}. ` +
      (STRICT_PERSON_NAME ? "Use letters and spaces, and a period for a middle initial."
                          : `Use letters, spaces, and ' - . , only.`);
  }
  return null;
}

export function checkPosition(raw: string): string | null {
  const v = tidyName(raw ?? "");
  if (!v) return null;
  if (v.length > MAX_POSITION_LENGTH) {
    return `Position must be at most ${MAX_POSITION_LENGTH} characters.`;
  }
  if (!A_LETTER.test(v)) {
    return "Position must contain at least one letter.";
  }
  const bad = listBad(v, NOT_IN_POSITION);
  if (bad.length) {
    return `Position cannot contain ${bad.map(c => `"${c}"`).join(", ")}. ` +
      (STRICT_PERSON_NAME ? "Use letters, numbers and spaces only."
                          : `Use letters, numbers, spaces, and ' - . , & / ( ) only.`);
  }
  return null;
}

/**
 * A HINT, never an error.
 *
 * This is the UPPERCASE / lowercase half of her comment, and it is deliberately
 * not enforced. LearnLens stores the case the teacher types and shows it
 * unchanged in the sidebar on every screen, so "eric tablizo" and "ERIC
 * TABLIZO" both look wrong there — but auto-capitalising would be worse: it
 * mangles "de la Cruz" into "De La Cruz", "MacDonald" into "Macdonald" and
 * "O'Brien" into "O'brien". Real names are not title case, and a system that
 * "corrects" a teacher's own name is a worse bug than the one it fixes.
 *
 * So: say something, change nothing. Show this beside the "Sidebar will show:"
 * preview that /setup already renders.
 */
export function looksMiscased(raw: string): string | null {
  const v = tidyName(raw ?? "");
  if (v.length < 2 || !A_LETTER.test(v)) return null;
  const letters = [...v].filter(c => A_LETTER.test(c));
  if (letters.every(c => c === c.toLowerCase() && c !== c.toUpperCase())) {
    return "This will appear in lowercase in the sidebar. Capitalise it if you meant to.";
  }
  if (letters.length > 2 &&
      letters.every(c => c === c.toUpperCase() && c !== c.toLowerCase())) {
    return "This will appear in ALL CAPS in the sidebar. Capitalise it normally if you meant to.";
  }
  return null;
}