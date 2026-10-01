import {
  College, TeachingContext, YearLevel,
  isValidCourse, isValidYear,          // Added on 2026-10-01
  isKnownCourse, isValidSubject,       // Added on 2026-10-01 (subject + origin)
} from "@/types/profile";
 
const SESSION_KEY = "ll_active_college";
// Added on 2026-10-01: what the teacher picked on /college after the college —
// the course and the year level they are teaching today. Same lifetime as the
// college (sessionStorage), so Sign out and a new tab both start clean.
const COURSE_KEY  = "ll_active_course";
const YEAR_KEY    = "ll_active_year";
const SUBJECT_KEY = "ll_active_subject";
const ORIGIN_KEY  = "ll_origin_course";
 
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

/** Save everything picked on /college: the students' course and year level,
 *  the subject being taught, and the teacher's own (originating) course. */
export function setTeachingSelection(
  course: string, year: YearLevel, subject: string, originCourse: string,
): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(COURSE_KEY,  course);
  sessionStorage.setItem(YEAR_KEY,    String(year));
  sessionStorage.setItem(SUBJECT_KEY, subject.trim());
  sessionStorage.setItem(ORIGIN_KEY,  originCourse);
}

export function clearTeachingSelection(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(COURSE_KEY);
  sessionStorage.removeItem(YEAR_KEY);
  sessionStorage.removeItem(SUBJECT_KEY);
  sessionStorage.removeItem(ORIGIN_KEY);
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
  const course  = sessionStorage.getItem(COURSE_KEY);
  const year    = Number(sessionStorage.getItem(YEAR_KEY));
  const subject = sessionStorage.getItem(SUBJECT_KEY);
  const origin  = sessionStorage.getItem(ORIGIN_KEY);
  if (!isValidCourse(college, course) || !isValidYear(college, year)) return null;
  // The teacher's own course may belong to any college, so it is checked
  // against every course, not just this college's.
  if (typeof subject !== "string" || !isValidSubject(subject)) return null;
  if (!isKnownCourse(origin)) return null;
  return { college, course, year, subject: subject.trim(), originCourse: origin };
}

export function hasTeachingContext(): boolean {
  return getTeachingContext() !== null;
}

/** "World Literature · BS Computer Science 2nd Year" — for the sidebar. */
export function teachingLabel(ctx: TeachingContext | null, yearLabel: string): string | null {
  return ctx ? `${ctx.subject} · ${ctx.course} ${yearLabel}` : null;
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