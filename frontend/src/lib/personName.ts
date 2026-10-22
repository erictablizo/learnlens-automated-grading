/**
 * NEW 2026-10-22 — character rules for the profile text fields.
 *
 * These rules MUST stay identical to _check_person_name() / _check_position()
 * in backend/app/schemas/profile.py — same order, same wording.
 *
 *     Save as: frontend/src/lib/personName.ts
 */

// From learnlens_schema.sql, not from taste:
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
const NOT_IN_NAME = /[^\p{L} '’.,-]/gu;

/** A POSITION may also contain digits, because Philippine academic ranks are
 *  written both ways: "Instructor I" and "Teacher 1". It also allows & / ( )
 *  for "Professor (Part-time)" and "Dean & Professor". */
const NOT_IN_POSITION = /[^\p{L}\p{N} '’.,&/()-]/gu;

/** Collapse runs of whitespace and trim. "  Eric   Bernard " -> "Eric Bernard".
 *  NFC so an accent typed as a combining mark counts as one character. */
export function tidyName(v: string): string {
  return v.normalize("NFC").replace(/\s+/g, " ").trim();
}

function listBad(v: string, re: RegExp): string[] {
  const seen = new Set<string>(v.match(re) ?? []);
  return [...seen].sort();
}

/**
 * Returns null when acceptable, or the message to show.
 * A blank value is NOT an error — it means "not filled in yet", which
 * Skip for now relies on. Required-ness stays with the form.
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
      `Use letters, spaces, and ' - . , only.`;
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
      `Use letters, numbers, spaces, and ' - . , & / ( ) only.`;
  }
  return null;
}

/**
 * A HINT, never an error.
 *
 * LearnLens keeps the case the teacher types. Auto-capitalising would mangle
 * "de la Cruz" into "De La Cruz", "MacDonald" into "Macdonald" and "O'Brien"
 * into "O'brien". A system that "corrects" a teacher's own name is a worse bug
 * than the one it fixes. So: say something, change nothing.
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