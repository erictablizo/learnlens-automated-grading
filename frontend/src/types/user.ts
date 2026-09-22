export interface User {
  user_id: number;
  email: string;
  created_at: string;
}
 
export interface AuthToken {
  access_token:     string;
  token_type:       string;
  user:             User;
  profile_complete: boolean;   // ← added
}
 
export interface LoginPayload {
  email: string;
  password: string;
}
 
export interface RegisterPayload {
  email: string;
  password: string;
}
 
export interface ForgotPasswordPayload {
  email: string;
}

// NEW 2026-09-22
export interface ForgotPasswordResponse {
  message: string;
  email_sent: boolean;   // false = backend DEV MODE (link printed in the terminal)
}
 
export interface ResetPasswordPayload {
  token: string;
  new_password: string;
}

// Added on 2026-09-22: 
export interface ValidateResetTokenResponse {
  valid: boolean;
  email: string;
}