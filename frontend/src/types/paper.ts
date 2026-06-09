export interface PaperPage {
  paper_page_id: number;
  page_number:   number;
  image_path:    string;
  uploaded_at:   string;
}
 
export interface PaperScore {
  score_id:        number;
  question_number: number;
  student_answer:  string;
  correct_answer:  string;
  is_correct:      boolean;
  ocr_confidence:  number | null;
}
 
export interface Paper {
  paper_id:     number;
  exam_id:      number;
  student_name: string;
  total_score:  number | null;
  checked:      boolean;
  added_at:     string;
  paper_pages?: PaperPage[];
  paper_scores?: PaperScore[];
}
 
export interface GradeResult {
  success:       boolean;
  total_items:   number;
  answered:      number;
  correct:       number;
  score_percent: number;
}
 
export interface PageUploadState {
  pageNumber: number;
  file:       File | null;
  uploaded:   boolean;
  uploading:  boolean;
  error:      string | null;
}