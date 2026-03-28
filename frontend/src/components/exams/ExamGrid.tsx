"use client";
import { Exam } from "@/types/exam";
import ExamCard from "./ExamCard";
import { useRouter } from "next/navigation";
 
const IconPlus = () => (
  <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
  </svg>
);
 
interface ExamGridProps {
  exams: Exam[];
  onEdit: (exam: Exam) => void;
  onDelete: (id: number) => void;
  onAdd: () => void;
}
 
export default function ExamGrid({ exams, onEdit, onDelete, onAdd }: ExamGridProps) {
  const router = useRouter();
 
  return (
    <div className="exam-grid">
      {exams.map(exam => (
        <div
          key={exam.exam_id}
          onClick={e => {
            // Only navigate on card body, not action buttons
            const target = e.target as HTMLElement;
            if (!target.closest("button")) {
              router.push(`/exams/${exam.exam_id}`);
            }
          }}
        >
          <ExamCard exam={exam} onEdit={onEdit} onDelete={onDelete} />
        </div>
      ))}
 
      {/* Add new exam — circle plus button */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "180px",
        }}
      >
        <button
          className="add-exam-btn"
          onClick={onAdd}
          aria-label="Create new exam"
          title="Create new exam"
        >
          <IconPlus />
        </button>
      </div>
    </div>
  );
}