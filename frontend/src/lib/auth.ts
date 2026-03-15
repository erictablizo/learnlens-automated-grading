export interface AuthUser {
  user_id: number;
  email: string;
  created_at: string;
}
 
export interface AuthTokens {
  access_token: string;
  token_type: string;
  user: AuthUser;
}
 
// ── Token storage ─────────────────────────────────────────────────────────────
 
export const saveTokens = (tokens: AuthTokens): void => {
  localStorage.setItem("access_token", tokens.access_token);
  localStorage.setItem("user", JSON.stringify(tokens.user));
};
 
export const clearTokens = (): void => {
  localStorage.removeItem("access_token");
  localStorage.removeItem("user");
};
 
export const getAccessToken = (): string | null => {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
};
 
export const getCurrentUser = (): AuthUser | null => {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("user");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
};
 
export const isAuthenticated = (): boolean => {
  return !!getAccessToken();
};