import { api } from "@/lib/api";
import { ExamAnalytics } from "@/types/analytics";

/**
 * NEW 2026-11-11 — one call, one endpoint.
 *
 * The four student lists on the Data Analytics page come from the EXISTING
 * paperService.list(); only the per-item counts need this. Keeping it to one
 * method makes that split obvious rather than implying the page is driven
 * entirely from here.
 */
export const analyticsService = {
  get: (examId: number, token: string) =>
    api.get<ExamAnalytics>(`/exams/${examId}/analytics`, token),
};