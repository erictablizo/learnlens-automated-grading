import { api } from "@/lib/api";
import { Paper, GradeResult } from "@/types/paper";
 
export const paperService = {
  list: (examId: number, token: string) =>
    api.get<Paper[]>(`/exams/${examId}/papers`, token),
 
  get: (examId: number, paperId: number, token: string) =>
    api.get<Paper>(`/exams/${examId}/papers/${paperId}`, token),
 
  create: (examId: number, studentName: string, token: string) =>
    api.post<Paper>(`/exams/${examId}/papers`, { student_name: studentName }, token),
 
  /** Update only the student name (and optionally reset score) */
  updateName: (examId: number, paperId: number, studentName: string, token: string) =>
    api.put<Paper>(
      `/exams/${examId}/papers/${paperId}`,
      { student_name: studentName },
      token,
    ),
 
  delete: (examId: number, paperId: number, token: string) =>
    api.delete<void>(`/exams/${examId}/papers/${paperId}`, token),
 
  /** Delete a single page from a paper */
  deletePage: (examId: number, paperId: number, pageId: number, token: string) =>
    api.delete<void>(
      `/exams/${examId}/papers/${paperId}/pages/${pageId}`,
      token,
    ),
 
  uploadPage: (
    examId:     number,
    paperId:    number,
    pageNumber: number,
    file:       File,
    token:      string,
  ) => {
    const form = new FormData();
    form.append("page_number", String(pageNumber));
    form.append("file", file);
    return api.postForm<{ paper_page_id: number; page_number: number; image_path: string }>(
      `/exams/${examId}/papers/${paperId}/pages`,
      form,
      token,
    );
  },
 
  /** Reset score + checked flag after editing an already-checked paper */
  resetScore: (examId: number, paperId: number, token: string) =>
    api.post<void>(
      `/exams/${examId}/papers/${paperId}/reset`,
      {},
      token,
    ),
 
  grade: (examId: number, paperId: number, token: string) =>
    api.post<GradeResult>(
      `/exams/${examId}/papers/${paperId}/grade`,
      {},
      token,
    ),
};