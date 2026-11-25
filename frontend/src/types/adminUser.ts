/**
 * types/adminUser.ts
 * ==================
 * NEW 2026-11-25 — Ms. Melanie, Recommendations page 19, requirement 5:
 * the List of Users table, with Edit, Delete and Status.
 *
 * A FIELD-FOR-FIELD mirror of `backend/app/schemas/admin_user.py`, the same
 * way types/admin.ts mirrors admin.py. That file is the authority; if a
 * field is added there, add it here in the same order and with the same
 * nullability, because nothing checks the two against each other at build
 * time and a quietly-missing field reads as `undefined` on screen rather
 * than as an error.
 *
 * `Optional[str] = None` in pydantic is `string | null` here, NOT
 * `string | undefined`: FastAPI serialises an unset Optional as JSON `null`,
 * so the key is present and `?:` would be the wrong shape.
 *
 * SEPARATE FROM types/admin.ts, deliberately. AdminTeacher there is the
 * READ-ONLY row of the Accounts table — email, role and three counts. This
 * is the row of a table that WRITES, and it carries the two fields that only
 * matter because something can be done to them: `status`, and `exams` as the
 * cost of a Delete. Merging them would mean one interface whose half the
 * reader has to guess at per screen.
 */

/** One account, as the List of Users table shows it. */
export interface AdminUserRow {
  user_id: number;
  email:   string;
  /** "Surname, First" — null when the account has no profile row yet. */
  name:    string | null;
  college: string | null;
  course:  string | null;
  /** "active" or "resigned". Lowercase in the column, Title Case on screen. */
  status:  string;
  /** "teacher" or "admin" — the CHECK on users.role permits no other. */
  role:    string;
  /**
   * How many exams this account owns, and therefore WHAT A DELETE WOULD
   * COST. Not decoration: the backend refuses to delete an account that owns
   * any, and this is the number its refusal names. The screen uses it to
   * disable Delete before the admin presses it.
   */
  exams:   number;
}

/** POST /admin/users. No token comes back; the admin stays signed in. */
export interface AdminUserCreate {
  email:      string;
  password:   string;
  last_name:  string;
  first_name: string;
}

/**
 * PUT /admin/users/{id}. Every field optional, and the route applies
 * `exclude_unset`, so a request carrying only `status` does not blank the
 * name — the 2026-11-03 year_level lesson.
 */
export interface AdminUserUpdate {
  email?:      string;
  last_name?:  string;
  first_name?: string;
  status?:     string;
}

/** DELETE /admin/users/{id}. */
export interface AdminUserDeleteResponse {
  success: boolean;
  user_id: number;
  message: string;
}

/** The two values users.status accepts; the CHECK constraint permits no other. */
export const USER_ACTIVE   = "active";
export const USER_RESIGNED = "resigned";