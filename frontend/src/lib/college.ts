import {
  College, TeachingContext, YearLevel,
  isValidCourse, isValidYear,          // Added on 2026-10-01
} from "@/types/profile";
 
const SESSION_KEY = "ll_active_college";
// Added on 2026-10-01: what the teacher picked on /college after the college —
// the course and the year level they are teaching today. Same lifetime as the
// college (sessionStorage), so Sign out and a new tab both start clean.
const COURSE_KEY  = "ll_active_course";
const YEAR_KEY    = "ll_active_year";
 
export function setActiveCollege(college: College): void {
  if (typeof window === "undefined") return;
  // Changing college invalidates the course and year — a CAST course is not
  // offered by CVMAS — so clear them rather than leave a stale pair behind.
  if (sessionStorage.getItem(SESSION_KEY) !== college) clearTeachingSelection();
  sessionStorage.setItem(SESSION_KEY, college);
}
 
export function getActiveCollege(): College | null {
  if (typeof window === "undefined") return null;
  return (sessionStorage.getItem(SESSION_KEY) as College) ?? null;
}
 
export function clearActiveCollege(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(SESSION_KEY);
  clearTeachingSelection();            // Added on 2026-10-01
}
 
export function hasActiveCollege(): boolean {
  return !!getActiveCollege();
}

// ── Course + year level (Added on 2026-10-01) ────────────────────────────────

/** Save the course and year level picked on /college. */
export function setTeachingSelection(course: string, year: YearLevel): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(COURSE_KEY, course);
  sessionStorage.setItem(YEAR_KEY,   String(year));
}

export function clearTeachingSelection(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(COURSE_KEY);
  sessionStorage.removeItem(YEAR_KEY);
}

/**
 * The full "today I am teaching …" selection, or null when it is missing or no
 * longer makes sense — a course or year that this college does not offer is
 * treated as absent, so an edited course list can never leave a teacher stuck
 * on a selection that does not exist.
 */
export function getTeachingContext(): TeachingContext | null {
  if (typeof window === "undefined") return null;
  const college = getActiveCollege();
  if (!college) return null;
  const course = sessionStorage.getItem(COURSE_KEY);
  const year   = Number(sessionStorage.getItem(YEAR_KEY));
  // The course must be one this college actually offers.
  if (!isValidCourse(college, course) || !isValidYear(college, year)) return null;
  return { college, course, year };
}

export function hasTeachingContext(): boolean {
  return getTeachingContext() !== null;
}

/** "BS Computer Science · 2nd Year" — for the sidebar. */
export function teachingLabel(ctx: TeachingContext | null, yearLabel: string): string | null {
  return ctx ? `${ctx.course} · ${yearLabel}` : null;
}
 
export const COLLEGE_COLORS: Record<College, { bg: string; color: string; initials: string }> = {
  CVMAS: { bg: "#e1f5ee", color: "#0f6e56", initials: "CVMAS" },
  CBMA:  { bg: "#eeedfe", color: "#534ab7", initials: "CBMA" },
  CoEd:  { bg: "#faeeda", color: "#854f0b", initials: "CoEd" },
  CAST:  { bg: "#faece7", color: "#993c1d", initials: "CAST" },
};
 
export const COLLEGE_FULL_NAMES: Record<College, string> = {
  CVMAS: "College of Veterinary Medicine and Agricultural Sciences",
  CBMA:  "College of Business, Management, and Accountancy",
  CoEd:  "College of Education",
  CAST:  "College of Arts, Sciences and Technology",
};