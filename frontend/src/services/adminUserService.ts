/**
 * services/adminUserService.ts
 * ============================
 * NEW 2026-11-25 — Ms. Melanie, Recommendations page 19, requirements 3b-5.
 *
 * Its own file beside adminService.ts rather than methods inside it, for the
 * reason that file gives for existing at all: one service per backend router.
 * These four calls are `backend/app/api/routes/admin_users.py`, which is its
 * own router with its own prefix, so this is its own service and the pair
 * stays one grep.
 *
 * PATHS CARRY NO `/api`. lib/api.ts puts BASE_URL in front, and BASE_URL
 * already ends in `/api` — the same way adminService.ts writes
 * "/admin/overview" for an endpoint served at /api/admin/overview.
 *
 * WHAT THE CALLER MUST HANDLE, because these are not exceptional paths:
 *
 *   409  the normal answer to a Delete. Any teacher who has used the system
 *        owns exams, and the backend refuses rather than erasing them; the
 *        message names the count and points at Resigned. Also raised for a
 *        duplicate email, for resigning or deleting yourself, and for
 *        removing the last active administrator.
 *   404  no such account.
 *
 * In every one of those the backend sends a SENTENCE WRITTEN FOR THE SCREEN,
 * and lib/api.ts already unwraps FastAPI's `detail` into ApiError.message.
 * So the caller shows e.message verbatim — the same decision ReferenceLists
 * made for its own 409s, and the only way the number inside the sentence
 * stays true.
 */
import { api } from "@/lib/api";
import type {
  AdminUserCreate, AdminUserDeleteResponse, AdminUserRow, AdminUserUpdate,
} from "@/types/adminUser";

export const adminUserService = {
  /** Every account, with its status and what a Delete would cost. */
  list: (token: string) => api.get<AdminUserRow[]>("/admin/users", token),

  /**
   * Create a teacher account.
   *
   * THIS IS WHY THE ENDPOINT EXISTS. The obvious route — sending the admin to
   * /register — calls useAuth.register(), which ends in setAuth() with the
   * NEW account's token: the administrator would be signed out and become the
   * teacher they had just created, landing on that teacher's /setup. This
   * endpoint issues no token at all, so the admin stays exactly where they
   * are and the new teacher is sent to /setup on their own first sign-in.
   *
   * Returns the row the list would have shown, read back by the server, so
   * the caller can drop it straight into the table rather than composing a
   * second shape that could disagree.
   */
  create: (body: AdminUserCreate, token: string) =>
    api.post<AdminUserRow>("/admin/users", body, token),

  /** Edit one account. Send only the fields that changed. */
  update: (userId: number, body: AdminUserUpdate, token: string) =>
    api.put<AdminUserRow>(`/admin/users/${userId}`, body, token),

  /**
   * Delete an account that owns nothing.
   *
   * Expect a 409 for any teacher who has done any work. That is the designed
   * answer, not a fault — see the note at the top of this file.
   */
  remove: (userId: number, token: string) =>
    api.delete<AdminUserDeleteResponse>(`/admin/users/${userId}`, token),
};