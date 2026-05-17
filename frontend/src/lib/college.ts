import { College } from "@/types/profile";
 
const SESSION_KEY = "ll_active_college";
 
export function setActiveCollege(college: College): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(SESSION_KEY, college);
}
 
export function getActiveCollege(): College | null {
  if (typeof window === "undefined") return null;
  return (sessionStorage.getItem(SESSION_KEY) as College) ?? null;
}
 
export function clearActiveCollege(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(SESSION_KEY);
}
 
export function hasActiveCollege(): boolean {
  return !!getActiveCollege();
}
 
export const COLLEGE_COLORS: Record<College, { bg: string; color: string; initials: string }> = {
  CVMAS: { bg: "#e1f5ee", color: "#0f6e56", initials: "VM" },
  CBMA:  { bg: "#eeedfe", color: "#534ab7", initials: "BM" },
  CoEd:  { bg: "#faeeda", color: "#854f0b", initials: "Ed" },
  CAST:  { bg: "#faece7", color: "#993c1d", initials: "AS" },
};
 
export const COLLEGE_FULL_NAMES: Record<College, string> = {
  CVMAS: "College of Veterinary Medicine and Agricultural Sciences",
  CBMA:  "College of Business, Management, and Accountancy",
  CoEd:  "College of Education",
  CAST:  "College of Arts, Sciences and Technology",
};