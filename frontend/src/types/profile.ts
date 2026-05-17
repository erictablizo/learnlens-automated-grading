export type College = "CVMAS" | "CBMA" | "CoEd" | "CAST";
 
export const COLLEGE_OPTIONS: { value: College; label: string }[] = [
  { value: "CVMAS", label: "College of Veterinary Medicine and Agricultural Sciences (CVMAS)" },
  { value: "CBMA",  label: "College of Business, Management, and Accountancy (CBMA)" },
  { value: "CoEd",  label: "College of Education (CoEd)" },
  { value: "CAST",  label: "College of Arts, Sciences and Technology (CAST)" },
];
 
export interface UserProfile {
  profile_id:       number;
  user_id:          number;
  first_name:       string | null;
  last_name:        string | null;
  college:          College | null;
  department:       string | null;
  position:         string | null;
  avatar_path:      string | null;
  profile_complete: boolean;
  created_at:       string;
}