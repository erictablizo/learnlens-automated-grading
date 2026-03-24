export interface User {
  user_id: number;
  email: string;
  created_at: string;
}
 
export interface AuthTokens {
  access_token: string;
  token_type: string;
  user: User;
}
 
export interface LoginCredentials {
  email: string;
  password: string;
}
 
export interface RegisterCredentials {
  email: string;
  password: string;
  confirmPassword: string;
}
 
export interface ForgotPasswordPayload {
  email: string;
}
 
export interface ResetPasswordPayload {
  token: string;
  new_password: string;
}
 
export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}