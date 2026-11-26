/**
 * services/changePasswordService.ts
 * =================================
 * NEW 2026-11-26 — Ms. Melanie, Recommendations page 20, requirement 2.
 *
 * One call, its own file, matching backend/app/api/routes/auth_change_password.py
 * — one service per router, the rule adminService.ts states for existing.
 *
 * NO TOKEN. The old password is the authentication; see the router's header
 * for why that has to be so and what it costs. api.post's third argument is
 * omitted rather than passed as undefined, because there is no session to
 * send: this screen is reached by someone who cannot sign in yet.
 *
 * THE PATH CARRIES NO `/api`. lib/api.ts prepends BASE_URL, which already
 * ends in `/api`.
 */
import { api } from "@/lib/api";

export interface ChangePasswordBody {
  email:        string;
  old_password: string;
  new_password: string;
}

export interface ChangePasswordResult {
  /** "Password has been successfully changed." — written by the server. */
  message: string;
}

export const changePasswordService = {
  /**
   * 400 with a sentence on every failure, and lib/api.ts has already
   * unwrapped FastAPI's `detail` into ApiError.message. The caller shows it
   * verbatim: one sentence covers a wrong address, a wrong old password and
   * a resigned account on purpose, so rewording it here could only make it
   * say more than the server chose to.
   */
  change: (body: ChangePasswordBody) =>
    api.post<ChangePasswordResult>("/auth/change-password", body),
};