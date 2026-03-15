import api from "@/lib/api";
import { saveTokens, clearTokens, AuthTokens } from "@/lib/auth";

export const authService = {
  async register(email: string, password: string) {
    const { data } = await api.post("/auth/register", { email, password });
    return data;
  },

  async login(email: string, password: string): Promise<AuthTokens> {
    const { data } = await api.post<AuthTokens>("/auth/login", { email, password });
    saveTokens(data);
    return data;
  },

  async forgotPassword(email: string) {
    const { data } = await api.post("/auth/forgot-password", { email });
    return data;
  },

  async resetPassword(token: string, newPassword: string) {
    const { data } = await api.post("/auth/reset-password", {
      token,
      new_password: newPassword,
    });
    return data;
  },

  logout() {
    clearTokens();
    window.location.href = "/login";
  },
};