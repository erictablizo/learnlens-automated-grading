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

/** What the teacher picked on /college — "today I am teaching …".
 *  The course is always one of the SELECTED COLLEGE's courses. */
export interface TeachingContext {
  college: College;
  course:  string;
  year:    YearLevel;
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