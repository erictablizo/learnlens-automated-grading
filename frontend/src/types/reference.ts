/**
 * types/reference.ts
 * ==================
 * NEW 2026-11-14 — the three maintainable dropdown lists.
 *
 *     Alex Passion / Julius Bancud, Recommendations page 1:
 *       "Where to maintain the list of College Info in College Dropdown List"
 *       "Where to maintain the list of Course / Program Info ..."
 *       "Where to maintain the list of Year Level Info ..."
 *
 * A field-for-field mirror of `backend/app/schemas/reference.py`. The backend
 * file is the authority; nothing checks the two against each other at build
 * time, so a field added there and forgotten here reads as `undefined` on
 * screen rather than as an error.
 *
 * These replace the hardcoded `COLLEGE_OPTIONS` and `COURSES_BY_COLLEGE` in
 * types/profile.ts. Those arrays stay for now so nothing breaks mid-change,
 * but once the Edit Profile and Setup screens read from the API they are dead
 * and should be deleted rather than left to drift out of step with the
 * database — a second list that disagrees with the first is worse than no
 * second list.
 */

/** One college. `in_use` is filled in only on the administrator listing. */
export interface College {
  college_id:  number;
  /** What `user_profiles.college` stores — "CAST", not the full name. */
  code:        string;
  name:        string;
  badge_bg:    string;
  badge_color: string;
  sort_order:  number;
  /**
   * Off means hidden from the dropdowns for NEW edits. Every profile already
   * storing this code keeps working and keeps displaying. This is why there is
   * an Active switch at all instead of only a Delete button.
   */
  active:      boolean;
  /** How many profiles hold this value. null on the teacher-facing list. */
  in_use:      number | null;
}

export interface Course {
  course_id:  number;
  college_id: number;
  name:       string;
  sort_order: number;
  active:     boolean;
  in_use:     number | null;
}

export interface YearLevel {
  year_level_id: number;
  college_id:    number;
  /** 1–6, the bound `user_profiles_year_level_check` still enforces. */
  level:         number;
  label:         string;
  active:        boolean;
  in_use:        number | null;
}

/** One college with both of its lists — what `/reference/lists` returns. */
export interface CollegeLists extends College {
  courses:     Course[];
  year_levels: YearLevel[];
}

/** Request bodies. Partial: the backend uses `exclude_unset`, so sending only
 *  `{ active: false }` switches a row off without blanking its name. */
export interface CollegeInput {
  code?:        string;
  name?:        string;
  badge_bg?:    string;
  badge_color?: string;
  sort_order?:  number;
  active?:      boolean;
}
export interface CourseInput {
  name?:       string;
  sort_order?: number;
  active?:     boolean;
}
export interface YearLevelInput {
  level?:  number;
  label?:  string;
  active?: boolean;
}