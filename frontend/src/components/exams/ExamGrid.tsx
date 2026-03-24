"use client";
 
import ExamCard from "./ExamCard";
 
export interface Exam {
  exam_id: number;
  exam_name: string;
  description: string;
  created_at: string;
}
 
interface ExamGridProps {
  exams: Exam[];
  onEdit?: (id: number) => void;
  onDelete?: (id: number) => void;
  onAddNew?: () => void;
}
 
function PlusIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
 
export default function ExamGrid({
  exams,
  onEdit,
  onDelete,
  onAddNew,
}: ExamGridProps) {
  return (
    <div className="exam-grid">
      {exams.map((exam) => (
        <ExamCard
          key={exam.exam_id}
          examId={exam.exam_id}
          name={exam.exam_name}
          description={exam.description}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
 
      {/* HCI: Visible affordance for adding a new exam — direct manipulation */}
      <button
        className="add-exam-btn"
        onClick={onAddNew}
        aria-label="Add new exam"
        title="Create a new exam"
      >
        <div className="add-exam-icon">
          <PlusIcon />
        </div>
      </button>
    </div>
  );
}