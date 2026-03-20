import { api } from "@/lib/api";
import { saveAuth, clearAuth, getToken } from "@/lib/auth";
import { AuthToken, LoginCredentials, User } from "@/types/user";
 
export const authService = {
  async login(credentials: LoginCredentials): Promise<AuthToken> {
    const data = await api.post<AuthToken>("/auth/login", credentials);
    saveAuth(data.access_token, data.user);
    return data;
  },
 
  async register(email: string, password: string): Promise<AuthToken> {
    const data = await api.post<AuthToken>("/auth/register", { email, password });
    saveAuth(data.access_token, data.user);
    return data;
  },
 
  async forgotPassword(email: string): Promise<{ message: string }> {
    return api.post<{ message: string }>("/auth/forgot-password", { email });
  },
 
  async getMe(): Promise<User> {
    const token = getToken();
    if (!token) throw new Error("Not authenticated");
    return api.get<User>("/auth/me", token);
  },
 
  logout(): void {
    clearAuth();
  },
};