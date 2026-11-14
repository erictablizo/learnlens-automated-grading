/**
 * services/referenceService.ts
 * ============================
 * NEW 2026-11-14 — the three maintainable dropdown lists.
 *
 * TWO GROUPS, and the split mirrors the backend exactly:
 *
 *   `referenceService`      reads, for ANY signed-in teacher. This is what the
 *                           Edit Profile and Setup dropdowns call.
 *   `adminReferenceService` writes, administrator only. Every call here
 *                           answers 403 for a teacher, before any query runs.
 *
 * Keeping them in one file but under two names means the import line on each
 * screen says which half it is using.
 */
import { api } from "@/lib/api";
import type {
  College, CollegeInput, CollegeLists, Course, CourseInput, YearLevel, YearLevelInput,
} from "@/types/reference";

export const referenceService = {
  /**
   * Every active college with its active courses and year levels, in ONE
   * request. The dropdowns are dependent — choosing a college filters Course —
   * and fetching on each change would put a round trip between the click and
   * the list appearing. It is a few dozen rows; it all comes down at once.
   */
  lists: (token: string) => api.get<CollegeLists[]>("/reference/lists", token),
};

export const adminReferenceService = {
  /** Every college INCLUDING inactive ones, each with its `in_use` count. */
  colleges: (token: string) =>
    api.get<College[]>("/admin/reference/colleges", token),
  addCollege: (data: CollegeInput, token: string) =>
    api.post<College>("/admin/reference/colleges", data, token),
  editCollege: (id: number, data: CollegeInput, token: string) =>
    api.put<College>(`/admin/reference/colleges/${id}`, data, token),
  /** 409 with a counted message when any profile holds it. */
  deleteCollege: (id: number, token: string) =>
    api.delete<void>(`/admin/reference/colleges/${id}`, token),

  courses: (collegeId: number, token: string) =>
    api.get<Course[]>(`/admin/reference/colleges/${collegeId}/courses`, token),
  addCourse: (collegeId: number, data: CourseInput, token: string) =>
    api.post<Course>(`/admin/reference/colleges/${collegeId}/courses`, data, token),
  editCourse: (id: number, data: CourseInput, token: string) =>
    api.put<Course>(`/admin/reference/courses/${id}`, data, token),
  deleteCourse: (id: number, token: string) =>
    api.delete<void>(`/admin/reference/courses/${id}`, token),

  yearLevels: (collegeId: number, token: string) =>
    api.get<YearLevel[]>(`/admin/reference/colleges/${collegeId}/year-levels`, token),
  addYearLevel: (collegeId: number, data: YearLevelInput, token: string) =>
    api.post<YearLevel>(`/admin/reference/colleges/${collegeId}/year-levels`, data, token),
  editYearLevel: (id: number, data: YearLevelInput, token: string) =>
    api.put<YearLevel>(`/admin/reference/year-levels/${id}`, data, token),
  deleteYearLevel: (id: number, token: string) =>
    api.delete<void>(`/admin/reference/year-levels/${id}`, token),
};