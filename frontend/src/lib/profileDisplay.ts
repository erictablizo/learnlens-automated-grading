/**
 * NEW 2026-10-01 — the sidebar's profile label, in one place.
 *
 * `avatarUrl` and `buildDisplayName` used to live inside Navbar.tsx, and the
 * Edit Profile page had its own copy of `avatarUrl`. The college picker needs
 * the same label, so rather than make a third copy they live here and all
 * three import them. Change the label once and every screen follows.
 *
 * CHANGED 2026-10-22 — Doc Rubrica, second comment: "Formatting like Bachelor
 * of Science in Computer Science should be under", with the course circled and
 * an arrow pointing down. The sidebar was drawing ONE string,
 *
 *     "Eric Bernard R Tablizo, Bachelor of Science in Computer Science Professor"
 *
 * which the 200px sidebar wrapped wherever it ran out of room:
 *
 *     Eric Bernard R Tablizo,        <- trailing comma, course runs on
 *     Bachelor of Science in         <- broken mid-phrase
 *     Computer Science
 *     Professor                      <- only looked like its own line
 *
 * `profileLines()` below returns the three lines SEPARATELY, so the course is
 * its own element under the name and can never run on from it.
 *
 * THIS IS A RENDER-TIME CHANGE ON PURPOSE. Doc Rubrica said it "applies to
 * existing user and new users". Nothing is re-saved and no migration runs: the
 * sidebar composes these lines from whatever is already in user_profiles every
 * time it draws, so an existing teacher sees the new layout on their next page
 * load and a new teacher sees it from their first. A fix applied at SAVE time
 * would only have reached teachers who edited their profile afterwards.
 *
 * Save as: frontend/src/lib/profileDisplay.ts
 */
import { UserProfile } from "@/types/profile";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";
const STATIC_BASE = API_BASE.replace("/api", "");

/** The profile page promises this fallback: "Leave blank to use Teacher". */
export const DEFAULT_POSITION = "Teacher";

/**
 * Build the avatar URL from the stored path.
 * `v` (the profile's updated_at) busts the browser cache — the uploaded file
 * always has the same name (user_<id>.jpg), so without it a changed photo
 * keeps showing the old one.
 */
export function avatarUrl(path: string | null | undefined, v?: string | null): string | null {
  if (!path) return null;
  // path is like "uploads/avatars/user_1.jpg" — prepend the backend base
  const url = `${STATIC_BASE}/${path.replace(/\\/g, "/").replace(/^\//, "")}`;
  return v ? `${url}?v=${encodeURIComponent(v)}` : url;
}

/** Collapse runs of whitespace; drop a trailing comma or other separator. */
function tidyLine(v: string | null | undefined): string {
  return (v ?? "")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim()
    // An existing row may have been typed with a trailing comma, and the old
    // label added one of its own. Neither should survive into a line of its
    // own. This matters because the strict character rule now refuses commas,
    // so a row that already has one CANNOT be edited to remove it — stripping
    // here fixes the display without needing the data fixed first.
    .replace(/[,;:·•\-–—]+$/u, "")
    .trim();
}

export interface ProfileLines {
  /** "Eric Bernard R Tablizo" — never ends in a comma. */
  name: string;
  /** "Bachelor of Science in Computer Science" — "" when none is saved. */
  course: string;
  /** "Professor", or DEFAULT_POSITION when the teacher left it blank. */
  position: string;
}

/**
 * NEW 2026-10-22: the three lines the sidebar draws, in order. Each is
 * returned separately so the caller renders three elements — the course on its
 * own line UNDER the name, as Doc Rubrica asked.
 *
 * Accepts null so it can be called while the profile is still loading; the
 * caller should still not draw the block until it has arrived, or a bare
 * "Teacher" will flash under an empty name.
 */
export function profileLines(profile: UserProfile | null | undefined): ProfileLines {
  const first = tidyLine(profile?.first_name);
  const last  = tidyLine(profile?.last_name);
  return {
    name:     tidyLine([first, last].filter(Boolean).join(" ")),
    course:   tidyLine(profile?.course),
    position: tidyLine(profile?.position) || DEFAULT_POSITION,
  };
}

/**
 * Build "Maria Santos, Computer Science Teacher"
 *
 * KEPT UNCHANGED 2026-10-22. The sidebar no longer uses this — it uses
 * profileLines() — but the college picker still imports it, and changing its
 * output would alter a screen Doc Rubrica did not comment on. Use it only
 * where a SINGLE-LINE label is genuinely wanted (a title= tooltip, an
 * aria-label); use profileLines() for anything laid out in a block.
 *
 * NOTE: it joins the course and the position with a bare space, so it reads
 * "...Bachelor of Science in Computer Science Professor". That is the same
 * run-on, in miniature, wherever this string is still shown.
 */
export function buildDisplayName(profile: UserProfile): string {
  const first    = (profile.first_name ?? "").trim();
  const last     = (profile.last_name  ?? "").trim();
  const fullName = [first, last].filter(Boolean).join(" ");
  const course   = (profile.course    ?? "").trim();
  const position = (profile.position  ?? "").trim() || "Teacher";

  if (fullName && course) return `${fullName}, ${course} ${position}`;
  if (fullName)           return `${fullName} ${position}`;
  return position;
}

/** "EB" from Eric Bernard Tablizo — shown when there is no photo. */
export function initialsOf(profile: UserProfile | null | undefined, fallback = "?"): string {
  if (!profile) return fallback;
  return [(profile.first_name ?? "")[0], (profile.last_name ?? "")[0]]
    .filter(Boolean).join("").toUpperCase() || fallback;
}