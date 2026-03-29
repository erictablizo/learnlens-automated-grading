export interface ExamPage {
  page_id: number;
  page_number: number;
  image_path: string;
  uploaded_at: string;
}
 
export interface AnswerKey {
  answer_key_id: number;
  question_number: number;
  correct_answer: string;
  ocr_confidence: number | null;
  generated_at: string;
}
 
export interface Exam {
  exam_id: number;
  exam_name: string;
  description: string;
  created_at: string;
  updated_at?: string;
  pages?: ExamPage[];
  answer_keys?: AnswerKey[];
}
 
export interface ExamCreatePayload {
  exam_name: string;
  description: string;
}
 
export interface ExamUpdatePayload {
  exam_name?: string;
  description?: string;
}