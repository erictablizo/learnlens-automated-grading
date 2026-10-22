/**
 * NEW 2026-10-22 — the password character-class rules, in one place.
 *
 * Before today LearnLens checked a password three ways and none was about
 * what is IN it: not blank, at least 8 characters, at most 72 BYTES. So
 * "password" and "aaaaaaaa" were both accepted.
 *
 * These MUST stay identical to _validate_password() in
 * backend/app/schemas/user.py — same order, same wording.
 *
 * NOT applied at LOGIN, ever. These rules govern CHOOSING a password.
 *
 *     Save as: frontend/src/lib/password.ts
 */

export const MIN_PASSWORD_LENGTH = 8;
export const BCRYPT_MAX_PASSWORD_BYTES = 72;

/** She did not ask for a digit. Flip this here AND in schemas/user.py. */
export const REQUIRE_DIGIT = false;

const HAS_UPPER = /\p{Lu}/u;
const HAS_LOWER = /\p{Ll}/u;
/** Anything that is not a letter and not a number — her words. Whitespace is
 *  excluded on purpose: a space is invisible to the person typing it. */
const HAS_SPECIAL = /[^\p{L}\p{N}\s]/u;
const HAS_DIGIT = /\p{N}/u;

export interface PasswordRule {
  id: "length" | "lower" | "upper" | "special" | "digit";
  label: string;
  ok: boolean;
}

/** For a live checklist under the field. Order matches the error order. */
export function passwordRules(pw: string): PasswordRule[] {
  const rules: PasswordRule[] = [
    { id: "length",  label: `At least ${MIN_PASSWORD_LENGTH} characters`, ok: pw.length >= MIN_PASSWORD_LENGTH },
    { id: "lower",   label: "One lowercase letter (a–z)",                 ok: HAS_LOWER.test(pw) },
    { id: "upper",   label: "One UPPERCASE letter (A–Z)",                 ok: HAS_UPPER.test(pw) },
    { id: "special", label: "One special character (not a letter or a number)", ok: HAS_SPECIAL.test(pw) },
  ];
  if (REQUIRE_DIGIT) {
    rules.push({ id: "digit", label: "One number (0–9)", ok: HAS_DIGIT.test(pw) });
  }
  return rules;
}

/** Not pw.length: an accented letter is 2 bytes and an emoji is 4. Same
 *  arithmetic as len(v.encode("utf-8")) on the server. */
export function passwordByteLength(pw: string): number {
  return new TextEncoder().encode(pw).length;
}

/** Returns null when acceptable, or the message to show. */
export function checkPassword(pw: string): string | null {
  if (!pw.trim()) {
    return "Password cannot be blank.";
  }
  if (pw.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (passwordByteLength(pw) > BCRYPT_MAX_PASSWORD_BYTES) {
    return (
      "Password is too long to store securely. Please use a shorter one - " +
      `up to ${BCRYPT_MAX_PASSWORD_BYTES} plain letters or digits, and fewer ` +
      "if it contains accented characters or emoji (those count as several " +
      "each)."
    );
  }
  if (!HAS_LOWER.test(pw)) {
    return "Password must contain at least one lowercase letter (a-z).";
  }
  if (!HAS_UPPER.test(pw)) {
    return "Password must contain at least one UPPERCASE letter (A-Z).";
  }
  if (!HAS_SPECIAL.test(pw)) {
    return "Password must contain at least one special character - anything that is not a letter or a number, such as ! ? @ # $ % & * - _ . A space does not count.";
  }
  if (REQUIRE_DIGIT && !HAS_DIGIT.test(pw)) {
    return "Password must contain at least one number (0-9).";
  }
  return null;
}