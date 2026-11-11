/**
 * services/paperAnswerService.ts
 * ==============================
 * NEW 2026-11-11 — per-paper answer override.
 *
 * Its own file rather than a method on paperService, for the same reason
 * types/paperAnswer.ts is its own file: one service, one backend router, one
 * thing to keep in step.
 */
import { api } from "@/lib/api";
import type { PaperAnswerPayload, PaperAnswerResult } from "@/types/paperAnswer";

export const paperAnswerService = {
  /**
   * Correct what ONE student wrote for ONE item. No other paper is touched.
   *
   * `studentAnswer` is sent EXACTLY as typed, including the empty string,
   * which records a blank. The backend collapses internal whitespace and
   * refuses anything over 100 characters with a 422 rather than truncating,
   * so a too-long answer surfaces as an ApiError with a readable message
   * instead of a silently shortened one.
   */
  override: (
    examId: number,
    paperId: number,
    questionNumber: number,
    studentAnswer: string,
    token: string,
  ) =>
    api.put<PaperAnswerResult>(
      `/exams/${examId}/papers/${paperId}/answers/${questionNumber}`,
      { student_answer: studentAnswer } satisfies PaperAnswerPayload,
      token,
    ),
};