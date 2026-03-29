import { api } from "@/lib/api";
import { Exam, ExamCreatePayload, ExamUpdatePayload } from "@/types/exam";
 
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
    return api.postForm<{ page_id: number; image_path: string }>(`/exams/${examId}/pages`, form, token);
  },
  generateAnswerKey: (examId: number, pageId: number, token: string) =>
    api.post<{ message: string }>(`/exams/${examId}/answer-key/generate?page_id=${pageId}`, {}, token),
};