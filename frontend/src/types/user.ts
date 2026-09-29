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
  email_sent: boolean;   // false = backend DEV MODE (SMTP not configured)
  // Added on 2026-09-29: the reset link itself, DEV MODE only, so "Check your
  // email!" can show it instead of telling you to copy it from the uvicorn
  // terminal. null/absent whenever the email really was sent.
  dev_reset_url?: string | null;
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