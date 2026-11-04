// CHANGED 2026-11-04: QuestionType is imported rather than re-spelled. The
// local union below used to be "true_false" | "encircled" | null, which has
// been WRONG since the 2026-10-22 button removal - the modal only ever sends
// "mixed", and that value was not in the union. types/exam.ts widened its own
// copy on 2026-11-01; this file was not updated with it.
import type { QuestionType } from "./exam";

export interface PaperPage {
  paper_page_id: number;
  page_number:   number;
  image_path:    string;
  uploaded_at:   string;
}

export interface PaperScore {
  score_id:        number;
  question_number: number;
  student_answer:  string;     // "—" = left blank / not detected
  correct_answer:  string;
  is_correct:      boolean;
  // NEW 2026-11-04 (drift fix). PaperScoreResponse in schemas/paper.py has
  // carried this since 2026-10-24 - "correct" | "review" | "wrong" - and this
  // interface never declared it, so the review state arrived in every response
  // and was invisible to TypeScript. Its own comment says as much: "Without
  // this field the review state exists in the database and is invisible to the
  // UI." The backend defaults it to "" for rows written before that migration.
  verdict:         string;
  ocr_confidence:  number | null;
}

export interface Paper {
  paper_id:     number;
  exam_id:      number;
  student_name: string;
  // NEW 2026-11-04 (Doc Rubrica, consultation, page 4): "Paper Table:
  // [Last Name] [First Name]".
  //
  // NOT optional with "?": PaperResponse and PaperListResponse both declare
  // them, so Pydantic always serialises the key. The VALUE is null for the 18
  // papers that predate the migration - it is deliberately not backfilled,
  // because 4 of 7 real student_name values split wrongly.
  //
  // student_name is KEPT and composed from these two by the service, so every
  // existing read site still works untouched.
  last_name:    string | null;
  first_name:   string | null;
  total_score:  number | null;
  checked:      boolean;
  added_at:     string;
  paper_pages?: PaperPage[];
  paper_scores?: PaperScore[];
}

// NEW 2026-11-04 — the request bodies, mirroring PaperCreate / PaperUpdate.
//
// Both fields are REQUIRED in both, exactly as the Pydantic models are. There
// is no student_name: it was REMOVED from the input models, not made optional,
// because the apostrophe is legal in a name part and illegal under the shared
// label rule, so "O'Brien" + "Ana" composes to a value check_student_name
// refuses. student_name is derived server-side now.
export interface PaperCreatePayload {
  last_name:  string;
  first_name: string;
}

/** The rename, and the hand-split of the 18 pre-migration papers. */
export interface PaperUpdatePayload {
  last_name:  string;
  first_name: string;
}

export interface GradeResult {
  success:       boolean;
  total_items:   number;
  answered:      number;
  correct:       number;
  score_percent: number;
  question_type?: QuestionType | null;   // NEW 2026-09-22, widened 2026-11-04
  warning?:       string | null;         // NEW 2026-09-22

  // NEW 2026-11-04 (drift fix). GradeResponse in schemas/paper.py has carried
  // these four since 2026-10-24 and this interface declared none of them, so
  // the browser could not see that a paper was still under review even though
  // the API said so on every grade. The backend comment records the symptom:
  // "The browser then sees '11 of 19' for a paper whose true score is 15, with
  // nothing to say four items are pending."
  //
  // `correct` is a FLOOR and `max_possible` is the ceiling: the student has at
  // least `correct` and at most `max_possible`. Show both.
  //
  // REQUIRED, not optional. Pydantic gives all four a default, so the server
  // puts every one of them in every response - a `?` here would be a lie that
  // costs `?? 0` at each use site and an `is_final !== false` dance instead of
  // `!is_final`. It is safe only because the backend and frontend of item B
  // must ship in the same deploy anyway (see PaperCreate, where student_name
  // was removed rather than relaxed).
  max_possible:  number;
  needs_review:  number;
  review_items:  number[];
  is_final:      boolean;
}

export interface PageUploadState {
  pageNumber: number;
  file:       File | null;
  uploaded:   boolean;
  uploading:  boolean;
  error:      string | null;
}