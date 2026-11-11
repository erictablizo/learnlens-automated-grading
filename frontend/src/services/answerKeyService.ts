import { api } from "@/lib/api";
import { AnswerKeyUpdateResult } from "@/types/answerKey";

/**
 * NEW 2026-11-11 — correcting one answer key item.
 *
 * PUT, not PATCH: the whole value of that item is replaced. The cascade over
 * every paper is a CONSEQUENCE the server performs, not a separate call the
 * browser has to remember to make — which is the point of the recommendation.
 */
export const answerKeyService = {
  updateItem: (examId: number, questionNumber: number, correctAnswer: string, token: string) =>
    api.put<AnswerKeyUpdateResult>(
      `/exams/${examId}/answer-key/${questionNumber}`,
      { correct_answer: correctAnswer },
      token,
    ),
};
