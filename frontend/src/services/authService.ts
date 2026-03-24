import { api } from "@/lib/api";
import { saveAuth, clearAuth } from "@/lib/auth";
import {
  AuthTokens,
  LoginCredentials,
  RegisterCredentials,
  ForgotPasswordPayload,
  ResetPasswordPayload,
  User,
} from "@/types/user";
 
export const authService = {
  async login(credentials: LoginCredentials): Promise<AuthTokens> {
    const data = await api.post<AuthTokens>("/auth/login", credentials);
    saveAuth(data.access_token, data.user);
    return data;
  },
 
  async register(credentials: RegisterCredentials): Promise<AuthTokens> {
    const { email, password } = credentials;
    const data = await api.post<AuthTokens>("/auth/register", { email, password });
    saveAuth(data.access_token, data.user);
    return data;
  },
 
  async forgotPassword(payload: ForgotPasswordPayload): Promise<{ message: string }> {
    return api.post<{ message: string }>("/auth/forgot-password", payload);
  },
 
  async resetPassword(payload: ResetPasswordPayload): Promise<{ message: string }> {
    return api.post<{ message: string }>("/auth/reset-password", payload);
  },
 
  async getMe(token: string): Promise<User> {
    return api.get<User>("/auth/me", token);
  },
 
  logout(): void {
    clearAuth();
  },
};