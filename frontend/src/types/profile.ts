export type College = "CVMAS" | "CBMA" | "CoEd" | "CAST";
 
export const COLLEGE_OPTIONS: { value: College; label: string }[] = [
  { value: "CVMAS", label: "College of Veterinary Medicine and Agricultural Sciences (CVMAS)" },
  { value: "CBMA",  label: "College of Business, Management, and Accountancy (CBMA)" },
  { value: "CoEd",  label: "College of Education (CoEd)" },
  { value: "CAST",  label: "College of Arts, Sciences and Technology (CAST)" },
];
 
// Courses shown in the profile setup dropdown, filtered by selected college
export const COURSES_BY_COLLEGE: Record<College, string[]> = {
  CVMAS: [
    "Doctor of Veterinary Medicine",
    "Bachelor of Science in Food Technology",
    "Bachelor of Science in Agriculture",
  ],
  CBMA: [
    "Bachelor of Science in Accountancy",
    "Bachelor of Science in Business Administration",
    "Bachelor of Science in Business Administration: Major in Financial Management",
    "Bachelor of Science in Business Administration: Major in Marketing Management",
    "Bachelor of Science in Hospitality Management",
    "Bachelor of Science in Tourism Management",
  ],
  CoEd: [
    "Bachelor of Elementary Education",
    "Bachelor of Secondary Education",
    "Major in Filipino",
    "Major in Mathematics",
    "Major in Physical Science",
  ],
  CAST: [
    "Bachelor of Science in Computer Science",
    "Bachelor of Science in Computer Engineering",
    "Bachelor of Arts in Psychology",
  ],
};
 
export interface UserProfile {
  profile_id:       number;
  user_id:          number;
  first_name:       string | null;
  last_name:        string | null;
  college:          College | null;
  course:           string | null;   // ← new: program/course within the college
  position:         string | null;
  avatar_path:      string | null;
  profile_complete: boolean;
  created_at:       string;
}