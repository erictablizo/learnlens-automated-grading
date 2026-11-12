/**
 * types/keyImage.ts
 * =================
 * NEW 2026-11-12 — rebuilding an answer key from a picture of the answers
 * (Alex Passion, post-UAT page 3).
 *
 * Mirrors backend/app/schemas/key_image.py. Preview and result are separate
 * shapes on purpose: reading an image is free, writing the key re-checks
 * every paper in the exam.
 */

/** "same" — matches the key on file · "changed" — differs · "not_in_key" — no row for this item yet. */
export type KeyImageStatus = "same" | "changed" | "not_in_key";

export interface KeyImageItem {
  question_number: number;
  /** What the OCR read. */
  answer: string;
  /** What the key says now; null when this item has no row. */
  current_answer: string | null;
  status: KeyImageStatus;
  /**
   * False when the read was REPAIRED rather than read cleanly — a fuzzy
   * TRUE/FALSE match, a letter taken from its first character, or an item
   * number recovered from its position in the list.
   */
  confident: boolean;
  note: string;
  /** The OCR line this came from, so the teacher can see what was read. */
  raw: string;
}

export interface KeyImagePreview {
  exam_id: number;
  page_id: number;
  page_number: number;
  /** Which preprocessing and page-segmentation mode won, e.g. "otsu/psm4". */
  read_with: string;
  items: KeyImageItem[];
  changed: number;
  unchanged: number;
  not_in_key: number;
  needs_check: number;
  /** Lines the parser refused to treat as answers — headers, wrapped text. */
  skipped_lines: string[];
  problems: string[];
}

export interface KeyImageRescored {
  paper_id: number;
  student_name: string;
  old_score: number | null;
  new_score: number | null;
  was_checked: boolean;
  now_checked: boolean;
}

export interface KeyImageUpdated {
  question_number: number;
  old_answer: string;
  correct_answer: string;
  papers_affected: number;
  papers_rescored: KeyImageRescored[];
}

export interface KeyImageSkipped {
  question_number: number;
  reason: string;
}

export interface KeyImageApplyResult {
  exam_id: number;
  items_updated: number;
  items_flipped: number;
  /** DISTINCT papers, not the sum across items. */
  papers_rescored: number;
  updated: KeyImageUpdated[];
  skipped: KeyImageSkipped[];
}