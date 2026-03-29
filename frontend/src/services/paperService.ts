import { api } from "@/lib/api";
import { Paper, PaperCreatePayload } from "@/types/paper";
 
export const paperService = {
  list: (examId: number, token: string) => api.get<Paper[]>(`/exams/${examId}/papers`, token),
  get: (examId: number, paperId: number, token: string) =>
    api.get<Paper>(`/exams/${examId}/papers/${paperId}`, token),
  create: (examId: number, payload: PaperCreatePayload, token: string) =>
    api.post<Paper>(`/exams/${examId}/papers`, payload, token),
  delete: (examId: number, paperId: number, token: string) =>
    api.delete<void>(`/exams/${examId}/papers/${paperId}`, token),
  uploadPage: (examId: number, paperId: number, pageNumber: number, file: File, token: string) => {
    const form = new FormData();
    form.append("page_number", String(pageNumber));
    form.append("file", file);
    return api.postForm<{ paper_page_id: number; image_path: string }>(
      `/exams/${examId}/papers/${paperId}/pages`, form, token
    );
  },
};