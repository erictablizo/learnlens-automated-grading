import { api } from "@/lib/api";
// CHANGED 2026-11-04 (Doc Rubrica, consultation, page 4): the two write calls
// send { last_name, first_name } now. student_name is DERIVED - the server
// composes it in paper_service.create_paper / rename_paper - so there is no
// student_name on either payload type.
import { Paper, GradeResult, PaperCreatePayload, PaperUpdatePayload } from "@/types/paper";

export const paperService = {
  // KNOWN TYPE MISMATCH, 2026-11-04. These three say Paper, and the endpoints
  // behind them return PaperListResponse, which has no exam_id. MEASURED by
  // comparing the two Pydantic models against the TypeScript interface:
  //
  //     in Paper but NOT in PaperListResponse: exam_id, paper_pages, paper_scores
  //     of those, REQUIRED in TypeScript:      exam_id
  //
  // paper_pages and paper_scores are optional in Paper, so their absence is
  // honest. `exam_id: number` is not - it arrives as undefined while
  // TypeScript promises a number.
  //
  // NOTHING reads paper.exam_id today (checked across the frontend; the only
  // .exam_id hits are on Exam objects and a URL param), so this is a latent
  // lie rather than a live bug. The one-line fix is on the backend:
  //
  //     class PaperListResponse(BaseModel):
  //         paper_id:  int
  //         exam_id:   int        # <- add this
  //
  // Typed Paper[] here deliberately rather than inventing a PaperListItem,
  // which would ripple through usePapers, PapersTable's props and the state
  // types on exams/[id]/page.tsx for a field no screen uses.
  list: (examId: number, token: string) =>
    api.get<Paper[]>(`/exams/${examId}/papers`, token),

  get: (examId: number, paperId: number, token: string) =>
    api.get<Paper>(`/exams/${examId}/papers/${paperId}`, token),

  /**
   * CHANGED 2026-11-04: `studentName: string` becomes a PaperCreatePayload.
   *
   * One object rather than two positional strings. It does NOT stop the two
   * names being swapped - MEASURED, both are `string`, so TypeScript accepts
   * a transposition either way. What it does catch is an OMITTED field
   * (TS2741), and it names each value at the call site so a reader can see
   * which is which.
   */
  create: (examId: number, body: PaperCreatePayload, token: string) =>
    api.post<Paper>(`/exams/${examId}/papers`, body, token),

  /**
   * Rename a paper - and, on one of the 18 papers that predate the
   * 2026-11-04 migration, split its name by hand.
   *
   * CHANGED 2026-11-04. The old doc comment read "Update only the student
   * name (and optionally reset score)". Both halves were wrong by the end:
   * it sends two fields now, and it never reset anything - resetScore below
   * is a separate endpoint that EditPaperModal calls separately, and only
   * when a page image actually changed.
   */
  updateName: (examId: number, paperId: number, body: PaperUpdatePayload, token: string) =>
    api.put<Paper>(
      `/exams/${examId}/papers/${paperId}`,
      body,
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