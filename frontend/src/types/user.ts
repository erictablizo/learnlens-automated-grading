export interface User {
  user_id: number;
  email: string;
  created_at: string;
}
 
export interface AuthToken {
  access_token: string;
  token_type: string;
  user: User;
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
 
export interface ResetPasswordPayload {
  token: string;
  new_password: string;
}