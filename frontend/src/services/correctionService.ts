/**
 * services/correctionService.ts
 * =============================
 * NEW 2026-11-19 — the Technical Admin specimen table.
 *
 * Its own file, for the reason classListService.ts gives for being its own
 * file: one service, one backend router, one thing to keep in step.
 *
 * NOTE `affected()`. It is the only read here that is called while the
 * administrator is still typing, and it exists so the number beside Save is
 * the real count of items a correction would re-check rather than a guess.
 * Saving does the re-check in the same transaction as the row, so the count
 * and the result cannot disagree.
 */
import { api } from "@/lib/api";
import type {
  AffectedCount, CorrectionSuggestion, OCRCorrection, OCRCorrectionPayload,
  OCRCorrectionSaved,
} from "@/types/correction";

export const correctionService = {
  /** Every correction, ordered the way it is looked up. */
  list: (token: string) =>
    api.get<OCRCorrection[]>("/admin/corrections", token),

  /**
   * What a correction of `seen` to `means` would do, before it does it.
   *
   * `means` is optional on the server, but the screen always sends it once
   * both boxes have something in them - the outcome counts are the whole
   * point, and the row count on its own has already been shown to be
   * reassuring in exactly the case that would have done damage.
   */
  affected: (seen: string, means: string, token: string) =>
    api.get<AffectedCount>(
      `/admin/corrections/affected?seen=${encodeURIComponent(seen)}`
      + `&means=${encodeURIComponent(means)}`, token),

  /**
   * What teachers keep correcting. Read-only; creates nothing.
   *
   * The screen uses these to FILL THE FORM, never to save directly — so a
   * suggestion still passes through the outcome preview before it can touch
   * a paper. A rule nobody chose is a rule nobody can defend.
   */
  suggestions: (token: string, minTimes = 1) =>
    api.get<CorrectionSuggestion[]>(
      `/admin/corrections/suggestions?min_times=${minTimes}`, token),

  /** 409 when another row already covers that reading. */
  create: (body: OCRCorrectionPayload, token: string) =>
    api.post<OCRCorrectionSaved>("/admin/corrections", body, token),

  update: (correctionId: number, body: OCRCorrectionPayload, token: string) =>
    api.put<OCRCorrectionSaved>(`/admin/corrections/${correctionId}`, body, token),

  /**
   * Stop applying a correction from now on. NOTHING is re-checked: the
   * reading it replaced was overwritten in paper_scores and now exists only
   * on the photograph. The response carries the sentence that says so.
   */
  remove: (correctionId: number, token: string) =>
    api.delete<{ deleted: boolean; message: string }>(
      `/admin/corrections/${correctionId}`, token),
};