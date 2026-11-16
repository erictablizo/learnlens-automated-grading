/**
 * NEW 2026-10-22 — character rules for the profile text fields.
 *
 * Doc Rubrica, after the demo, second clarification:
 *   "case sensitive (UPPERCASE, LOWERCASE, and Special Characters like not
 *    letters and not numbers. NOT FOR JUST PASSWORD but when you're Setting
 *    up your profile)"
 *
 * Before that, `ProfileSetup` in backend/app/schemas/profile.py had NO
 * validators of any kind — the API accepted first_name = "123",
 * "<script>alert(1)</script>", "!!!!" or "   ", and the sidebar rendered that
 * on EVERY screen of the system.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * REWRITTEN 2026-11-16 (Grace, post-UAT): "First Name, Last Name, and Position
 * should have validation like terms of special characters and numbers for
 * setup and edit; validation for all fields if blank for setup and edit."
 *
 * THE TWO CHARACTER SETS IN THIS FILE ARE GONE. They used to be spelled out
 * here as NOT_IN_NAME_STRICT and NOT_IN_POSITION_STRICT, with relaxed
 * variants beside them, and the same four sets were spelled out again in
 * schemas/profile.py. Four hand-maintained regexes for one idea.
 *
 * All three fields now delegate to checkNamePart() in lib/textField.ts — the
 * rule every STUDENT name already uses: letters, space, period, apostrophe,
 * hyphen; no digits, no comma, no parentheses.
 *
 * WHAT CHANGES FOR A TEACHER, and both directions matter:
 *
 *   NOW ACCEPTED, and these were real refusals measured on 2026-11-04 over 28
 *   realistic Filipino names — the old set refused 7 of them:
 *       Dela Cruz-Santos    O'Brien    Reyes-Ramos    Anne-Marie
 *   A teacher with a hyphenated surname could not complete Setup at all.
 *   "Asst. Prof." is now a legal Position for the first time, too.
 *
 *   NOW REFUSED:
 *       Teacher 1    Instructor 2
 *   The old position set deliberately allowed digits — schemas/profile.py
 *   recorded "Philippine academic ranks are written both ways". Grace chose
 *   the narrower reading on 2026-11-16: no special characters AND no numbers.
 *   Ranks in Roman numerals ("Instructor II") are unaffected, because those
 *   are letters.
 *
 * THE LENGTH CAPS STAY HERE, because they are the only thing about these
 * fields that is NOT shared: a name part may be 255 characters, but
 * user_profiles.first_name is varchar(100).
 *
 * Keep in step with _check_person_name() / _check_position() in
 * backend/app/schemas/profile.py — same order, same wording.
 */
// CORRECTED 2026-10-22 against learnlens_schema.sql, which is the only thing
// that settles these:
//     user_profiles.first_name   character varying(100)
//     user_profiles.last_name    character varying(100)
//     user_profiles."position"   character varying(255)
export const MAX_NAME_LENGTH = 100;
export const MAX_POSITION_LENGTH = 255;

import { checkNamePart, tidyText } from "@/lib/textField";

/** Letters in ANY alphabet. "Ñ", "é", "ü" are letters; "1" and "@" are not. */
const A_LETTER = /\p{L}/u;

/**
 * Collapse runs of whitespace and trim, NFC-normalised.
 *
 * KEPT AS A RE-EXPORT, not a second implementation: it is tidyText() from
 * textField.ts, which is itself the browser copy of tidy_text() in
 * schemas/_text.py. The name stays because two screens import `tidyName`.
 */
export function tidyName(v: string): string {
  return tidyText(v ?? "");
}

/**
 * Returns null when acceptable, or the message to show.
 *
 * `label` is what the teacher sees: "First name", "Last name".
 *
 * `required` is NEW 2026-11-16. Blank used to be silently acceptable here,
 * with required-ness living separately in each form — which is how /setup and
 * /profile ended up with four hand-written `if (!x.trim())` checks between
 * them and none at all for Position or Year Level. One flag, one sentence,
 * both screens.
 */
export function checkPersonName(raw: string, label: string,
                                required = false): string | null {
  const v = tidyName(raw ?? "");
  if (!v) return required ? `${label} is required.` : null;
  // The CAP IS CHECKED FIRST and locally, because checkNamePart's own cap is
  // 255 — the student column — and these columns are varchar(100). A limit
  // the API states as a sentence beats one PostgreSQL refuses as a driver
  // error.
  if (v.length > MAX_NAME_LENGTH) {
    return `${label} must be at most ${MAX_NAME_LENGTH} characters.`;
  }
  // NO at-least-one-letter test here. checkNamePart() runs it, in that
  // order, with this exact sentence - and the backend's _check_person_name()
  // has no copy of it either. One test, one place.
  return checkNamePart(v, label);
}

/**
 * POSITION. Same characters as a name as of 2026-11-16 — see the header.
 * Its own cap, because the column is varchar(255).
 */
export function checkPosition(raw: string, required = false): string | null {
  const v = tidyName(raw ?? "");
  if (!v) return required ? "Position is required." : null;
  if (v.length > MAX_POSITION_LENGTH) {
    return `Position must be at most ${MAX_POSITION_LENGTH} characters.`;
  }
  // Same as above: checkNamePart() owns the at-least-one-letter test.
  // commaHint=false - a comma is still refused, with the general sentence.
  return checkNamePart(v, "Position", false);
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
 * So: say something, change nothing.
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