export type College = "CVMAS" | "CBMA" | "CoEd" | "CAST";
 
export const COLLEGE_OPTIONS: { value: College; label: string }[] = [
  { value: "CVMAS", label: "College of Veterinary Medicine and Agricultural Sciences (CVMAS)" },
  { value: "CBMA",  label: "College of Business, Management, and Accountancy (CBMA)" },
  { value: "CoEd",  label: "College of Education (CoEd)" },
  { value: "CAST",  label: "College of Arts, Sciences and Technology (CAST)" },
];
 
// Courses shown in the profile setup dropdown, filtered by selected college
export const COURSES_BY_COLLEGE: Record<College, string[]> = {
  CVMAS: [
    "Doctor of Veterinary Medicine",
    "Bachelor of Science in Food Technology",
    "Bachelor of Science in Agriculture",
  ],
  CBMA: [
    "Bachelor of Science in Accountancy",
    "Bachelor of Science in Business Administration",
    "Bachelor of Science in Business Administration: Major in Financial Management",
    "Bachelor of Science in Business Administration: Major in Marketing Management",
    "Bachelor of Science in Hospitality Management",
    "Bachelor of Science in Tourism Management",
  ],
  CoEd: [
    "Bachelor of Elementary Education",
    "Bachelor of Secondary Education",
    "Major in Filipino",
    "Major in Mathematics",
    "Major in Physical Science",
  ],
  CAST: [
    "Bachelor of Science in Computer Science",
    "Bachelor of Science in Computer Engineering",
    "Bachelor of Arts in Psychology",
  ],
};

// ── Year levels (Added on 2026-10-01) ────────────────────────────────────────
// After picking a college on /college, the teacher also picks the course and
// the year level they are teaching today.

export type YearLevel = 1 | 2 | 3 | 4 | 5 | 6;

/** How far each college's students go.
 *  CVMAS reaches 6th year (Doctor of Veterinary Medicine); the others reach 3rd.
 *  To change a college later, change only the number here — the dropdown,
 *  the labels and the validation all read from this one map. */
export const MAX_YEAR_BY_COLLEGE: Record<College, YearLevel> = {
  CVMAS: 6,
  CBMA:  3,
  CoEd:  3,
  CAST:  3,
};

export const YEAR_LABELS: Record<YearLevel, string> = {
  1: "1st Year",
  2: "2nd Year",
  3: "3rd Year",
  4: "4th Year",
  5: "5th Year",
  6: "6th Year",
};

/** The year levels a college offers, e.g. CAST → [1, 2, 3] */
export function yearLevelsFor(college: College | null | undefined): YearLevel[] {
  if (!college) return [];
  return Array.from({ length: MAX_YEAR_BY_COLLEGE[college] }, (_, i) => (i + 1) as YearLevel);
}

/** True when this college really offers that year level. */
export function isValidYear(college: College | null | undefined, year: unknown): year is YearLevel {
  if (!college) return false;
  return typeof year === "number" && Number.isInteger(year)
    && year >= 1 && year <= MAX_YEAR_BY_COLLEGE[college];
}

/** True when this college really offers that course. */
export function isValidCourse(college: College | null | undefined, course: unknown): course is string {
  if (!college || typeof course !== "string") return false;
  return COURSES_BY_COLLEGE[college].includes(course);
}

/** Every course of every college, grouped — for the "originated from"
 *  dropdown. A teacher's own course can belong to a different college than the
 *  class they are teaching (a Psychology teacher taking a Computer Science
 *  subject), so this list is NOT filtered by the active college. */
export const COURSE_GROUPS: { college: College; label: string; courses: string[] }[] =
  COLLEGE_OPTIONS.map(o => ({ college: o.value, label: o.label, courses: COURSES_BY_COLLEGE[o.value] }));

/** True when the course exists in ANY college. */
export function isKnownCourse(course: unknown): course is string {
  return typeof course === "string"
    && COLLEGE_OPTIONS.some(o => COURSES_BY_COLLEGE[o.value].includes(course));
}

export const SUBJECT_MAX_LENGTH = 100;

/** The subject is typed by hand (there is no master list), so it is only
 *  checked for being present and a sensible length. */
export function isValidSubject(subject: unknown): boolean {
  if (typeof subject !== "string") return false;
  const s = subject.trim();
  return s.length >= 2 && s.length <= SUBJECT_MAX_LENGTH;
}

/** What the teacher picked on /college — "today I am teaching …". */
export interface TeachingContext {
  college:      College;
  /** The course of the STUDENTS being taught. */
  course:       string;
  year:         YearLevel;
  /** The subject being taught, e.g. "World Literature". */
  subject:      string;
  /** The teacher's OWN course — may be from another college entirely. */
  originCourse: string;
}
 
export interface UserProfile {
  profile_id:       number;
  user_id:          number;
  first_name:       string | null;
  last_name:        string | null;
  college:          College | null;
  course:           string | null;   // ← new: program/course within the college
  position:         string | null;
  avatar_path:      string | null;
  profile_complete: boolean;
  created_at:       string;
  // Added on 2026-10-01 (Edit Profile): used to cache-bust the avatar image,
  // which is always stored under the same file name.
  updated_at?:      string | null;
}