/**
 * types/correction.ts
 * ===================
 * NEW 2026-11-19 — the Technical Admin specimen table.
 *
 *   Sir Alex Passion, 19 November 2026, points 4-7.
 *
 * One row says: THE READER SAW `seen`, IT MEANS `means`.
 */

export interface OCRCorrection {
  correction_id: number;
  seen:          string;
  means:         string;
  note?:         string | null;
  created_at:    string;
  updated_at:    string;
}

export interface OCRCorrectionPayload {
  seen:  string;
  means: string;
  note?: string | null;
}

/** The blast radius, measured BEFORE the administrator saves. */
export interface AffectedCount {
  rows:   number;
  papers: number;
}

/** What saving actually did to papers that were already checked. */
export interface RescoreSummary {
  rows_examined:       number;
  rows_changed:        number;
  rows_skipped_review: number;
  papers_touched:      number;
  marks_gained:        number;
  marks_lost:          number;
  message:             string;
}

export interface OCRCorrectionSaved {
  correction: OCRCorrection;
  rescore:    RescoreSummary;
}