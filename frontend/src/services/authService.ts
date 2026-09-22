import { api } from "@/lib/api";
import {
  AuthToken, LoginPayload, RegisterPayload, ForgotPasswordPayload,
  ForgotPasswordResponse, ValidateResetTokenResponse,
} from "@/types/user";
 
export const authService = {
  login: (payload: LoginPayload) => api.post<AuthToken>("/auth/login", payload),
  register: (payload: RegisterPayload) => api.post<AuthToken>("/auth/register", payload),
  // Commented out 2026-09-22: 
  // forgotPassword: (payload: ForgotPasswordPayload) => api.post<{ message: string }>("/auth/forgot-password", payload),
  forgotPassword: (payload: ForgotPasswordPayload) => api.post<ForgotPasswordResponse>("/auth/forgot-password", payload),
  // NEW 2026-09-22: check the emailed link before showing the new-password form
  validateResetToken: (token: string) => api.get<ValidateResetTokenResponse>(`/auth/reset-password/validate?token=${encodeURIComponent(token)}`),
  resetPassword: (token: string, new_password: string) =>
    api.post<{ message: string }>("/auth/reset-password", { token, new_password }),
};