import { api } from "@/lib/api";
import { AuthToken, LoginPayload, RegisterPayload, ForgotPasswordPayload } from "@/types/user";
 
export const authService = {
  login: (payload: LoginPayload) => api.post<AuthToken>("/auth/login", payload),
  register: (payload: RegisterPayload) => api.post<AuthToken>("/auth/register", payload),
  forgotPassword: (payload: ForgotPasswordPayload) => api.post<{ message: string }>("/auth/forgot-password", payload),
  resetPassword: (token: string, new_password: string) =>
    api.post<{ message: string }>("/auth/reset-password", { token, new_password }),
};