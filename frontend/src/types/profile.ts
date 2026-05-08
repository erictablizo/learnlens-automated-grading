export interface Profile {
  profile_id: number;
  user_id: number;
  full_name: string;
  college: string;
  department: string;
  position: string;
  created_at: string;
}
 
export interface ProfileCreatePayload {
  full_name: string;
  college: string;
  department: string;
  position: string;
}
 
export interface CollegesData {
  colleges: Record<string, string[]>;
  positions: string[];
}