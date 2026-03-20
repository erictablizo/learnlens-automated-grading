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
 
export interface LoginCredentials {
  email: string;
  password: string;
}
 
export interface RegisterCredentials {
  email: string;
  password: string;
  confirm_password: string;
}
 
export interface ForgotPasswordRequest {
  email: string;
}
 
export interface Exam {
  exam_id: number;
  created_by: number;
  exam_name: string;
  description: string;
  created_at: string;
  updated_at: string | null;
}