/**
 * services/keyImageService.ts
 * ===========================
 * NEW 2026-11-12 — the two calls behind "upload an answer key image".
 *
 * Both go through `api`, so a dead backend reports "Cannot reach the
 * LearnLens server" and a Pydantic `detail` ARRAY is unwrapped into readable
 * text by readDetail. The apply call is the one that returns an array —
 * "An answer key item cannot be blank." and "The same item was sent twice" —
 * so writing a second error path here would reintroduce the 2026-09-22
 * "[object Object]" fault in a new file.
 */
import { api } from "@/lib/api";
import type { KeyImageApplyResult, KeyImagePreview } from "@/types/keyImage";

export const keyImageService = {
  /**
   * Read an enumerated answer list. WRITES NOTHING.
   *
   * multipart, because it carries a file. `page_id` rides in the form rather
   * than the path: the key being rebuilt belongs to one exam page, and the
   * route already owns the exam id.
   */
  preview: (examId: number, pageId: number, file: File, token: string) => {
    const form = new FormData();
    form.append("page_id", String(pageId));
    form.append("file", file);
    return api.postForm<KeyImagePreview>(
      `/exams/${examId}/answer-key/from-image`, form, token,
    );
  },

  /**
   * Write the confirmed answers.
   *
   * ONLY the items being changed are sent. Each one re-checks every paper
   * graded against it, so sending back the ones that already match would turn
   * a three-item correction into a twenty-item cascade.
   */
  apply: (
    examId: number,
    items: { question_number: number; answer: string }[],
    token: string,
  ) =>
    api.post<KeyImageApplyResult>(
      `/exams/${examId}/answer-key/from-image/apply`, { items }, token,
    ),
};