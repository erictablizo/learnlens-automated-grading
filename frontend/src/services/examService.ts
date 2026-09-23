import { api } from "@/lib/api";
import { Exam, ExamCreatePayload, ExamUpdatePayload, GenerateAnswerKeyResult, QuestionType } from "@/types/exam";

export const examService = {
  list: (token: string) => api.get<Exam[]>("/exams", token),
  get: (id: number, token: string) => api.get<Exam>(`/exams/${id}`, token),
  create: (payload: ExamCreatePayload, token: string) => api.post<Exam>("/exams", payload, token),
  update: (id: number, payload: ExamUpdatePayload, token: string) =>
    api.put<Exam>(`/exams/${id}`, payload, token),
  delete: (id: number, token: string) => api.delete<void>(`/exams/${id}`, token),

  uploadPage: (examId: number, pageNumber: number, file: File, token: string) => {
    const form = new FormData();
    form.append("page_number", String(pageNumber));
    form.append("file", file);
    return api.postForm<{ page_id: number; page_number: number; image_path: string }>(
      `/exams/${examId}/pages`, form, token);
  },

  deletePage: (examId: number, pageId: number, token: string) =>
    api.delete<void>(`/exams/${examId}/pages/${pageId}`, token),

  /**
   * FIX 2026-09-22: new optional `expectedItems` ("Number of items on this page").
   * When given, the backend keeps exactly that many answers (e.g. 12 or 20).
   */
  generateAnswerKey: (
    examId: number,
    pageId: number,
    token: string,
    questionType?: QuestionType,
    expectedItems?: number | null,
  ) => {
    const q = new URLSearchParams({ page_id: String(pageId) });
    if (questionType) q.set("question_type", questionType);
    if (expectedItems && expectedItems > 0) q.set("expected_items", String(expectedItems));
    return api.post<GenerateAnswerKeyResult>(`/exams/${examId}/answer-key/generate?${q.toString()}`, {}, token);
  },
};