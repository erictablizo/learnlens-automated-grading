export interface ExamPage {
  page_id: number;
  page_number: number;
  image_path: string;
  uploaded_at: string;
}

export interface AnswerKey {
  answer_key_id: number;
  page_id?: number | null;          // NEW 2026-09-22
  question_number: number;
  correct_answer: string;
  ocr_confidence: number | null;    // 0 – 1
  generated_at: string;
}

export interface Exam {
  exam_id: number;
  exam_name: string;
  description: string;
  // NEW 2026-11-04 (Doc Rubrica) — "2 additional Fields in Exam Info Table".
  // NOT optional with "?": ExamResponse and ExamListResponse both declare
  // them, so Pydantic always serialises the key.  The value is null for the
  // exams that predate the migration, which is why it is "| null" and not
  // a bare string.
  subject: string | null;
  schedule: string | null;
  created_at: string;
  updated_at?: string;
  pages?: ExamPage[];
  answer_keys?: AnswerKey[];
}

export interface ExamCreatePayload {
  exam_name: string;
  description: string;
  // REQUIRED, mirroring ExamCreate on the backend.  Marking these optional
  // would let CreateExamForm compile while omitting a field the API refuses,
  // trading a compile error for a 422 at runtime.
  subject: string;
  schedule: string;
}

export interface ExamUpdatePayload {
  exam_name?: string;
  description?: string;
  // Optional, mirroring ExamUpdate.  update_exam() skips any value that
  // arrives as None, so an omitted key leaves the stored value alone.
  subject?: string;
  schedule?: string;
}

export type QuestionType = "true_false" | "encircled" | "mixed";

// NEW 2026-09-22
export interface GenerateAnswerKeyResult {
  success: boolean;
  detected: number;
  expected_items: number | null;
  question_type: QuestionType;
  message: string;
  warning: string | null;
}

// NEW 2026-09-29 — PUT /exams/{examId}/pages/{pageId}
export interface SetPageNumberResult {
  success: boolean;
  changed: boolean;      // false when the page already had that number
  reset: number;         // checked papers that were reset by the move
  message: string;
}