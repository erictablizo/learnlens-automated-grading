/**
 * services/adminService.ts
 * ========================
 * NEW 2026-11-13 — the administrator view.
 *
 * Its own file rather than methods on examService, for the same reason
 * `backend/app/api/routes/admin.py` is its own router: ONE service, ONE
 * backend router, one thing to keep in step. Every call in this file crosses
 * the ownership boundary, and keeping them together means the frontend half
 * of that boundary is also one file and one grep.
 *
 * WHY `isAdmin()` ASKS THE SERVER INSTEAD OF READING A ROLE FIELD
 * ---------------------------------------------------------------
 * The sidebar has to decide whether to draw the Admin link, and the obvious
 * way is to read `role` off the profile response. `GET /api/profile` does not
 * carry it: `ProfileResponse` in `backend/app/schemas/profile.py` serialises
 * the `UserProfile` row, and `role` lives on `users`, a different table. So
 * surfacing it means editing the profile route — the file that on 2026-11-04
 * turned out to be silently dropping `year_level`, and whose stored copy in
 * this project has been stale before.
 *
 * Asking the server is cheaper and it cannot be wrong. `_admin` in
 * `routes/admin.py` rejects a non-administrator BEFORE any query runs, so a
 * teacher's probe costs one 403 and zero database work, and the link appears
 * exactly when the endpoints behind it would actually answer. There is no
 * state that can disagree with the server, which is the failure mode a cached
 * role flag has.
 *
 * The cost, stated plainly: a teacher's browser logs one 403 per sidebar
 * mount. It is in the network tab, not on screen. If that is unwanted at the
 * defence, add `role` to the profile response instead — see
 * ADMIN-FRONTEND-2026-11-13.md, which writes out that edit.
 */
import { api, ApiError } from "@/lib/api";
import type { AdminExam, AdminOverview, AdminTeacher } from "@/types/admin";

export const adminService = {
  /** Totals for the whole installation. 403 for a teacher. */
  overview: (token: string) => api.get<AdminOverview>("/admin/overview", token),

  /** Every account, with how much of the system it owns. */
  teachers: (token: string) => api.get<AdminTeacher[]>("/admin/teachers", token),

  /** Every exam in the installation and whose it is. */
  exams: (token: string) => api.get<AdminExam[]>("/admin/exams", token),

  /**
   * Is the signed-in user an administrator? Never throws.
   *
   * A 401 or 403 is the ANSWER, not an error: the dependency answered the
   * question honestly and the caller wants a boolean. Anything else — a dead
   * backend (ApiError 0), a 500, a 404 because the router was never
   * registered — returns false too, and that is the deliberate choice: a
   * sidebar link that cannot be reached is worse than no link, and this is a
   * navigation hint, not an authorisation decision. The real decision is made
   * on the server on every single request, which is why guessing wrong here
   * is a cosmetic fault and not a security one.
   */
  isAdmin: async (token: string): Promise<boolean> => {
    try {
      await api.get<AdminOverview>("/admin/overview", token);
      return true;
    } catch (e) {
      // Narrowed rather than swallowed, so a genuine surprise is still visible
      // in the console while the function keeps its promise never to throw.
      if (!(e instanceof ApiError)) console.warn("isAdmin: unexpected failure", e);
      return false;
    }
  },
};