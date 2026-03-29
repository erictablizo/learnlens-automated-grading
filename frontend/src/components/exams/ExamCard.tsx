"use client";
import { Exam } from "@/types/exam";
import Button from "@/components/ui/Button";
 
const IconEdit = () => (
  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.536-6.536a2 2 0 112.828 2.828L11.828 15.828a4 4 0 01-1.414.94l-3 1 1-3a4 4 0 01.94-1.414z" />
  </svg>
);
const IconTrash = () => (
  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);
 
// Inline SVG test paper thumbnail (similar to the image)
const TestPaperThumb = () => (
  <svg width="85" height="105" viewBox="0 0 85 105" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="2" width="68" height="90" rx="3" fill="white" stroke="#d0d8e0" strokeWidth="1.5"/>
    <rect x="55" y="10" width="20" height="75" rx="2" fill="#f5a623" opacity="0.7"/>
    <rect x="10" y="12" width="38" height="4" rx="2" fill="#1a2e44" opacity="0.8"/>
    <text x="11" y="23" fontSize="7" fill="#1a2e44" fontWeight="700" fontFamily="sans-serif">TEST</text>
    {[30,38,46,54,62,70].map((y, i) => (
      <g key={i}>
        <rect x="10" y={y} width="5" height="4" rx="1" fill={i % 3 === 0 ? "#f5a623" : "#e8ecf0"}/>
        <rect x="18" y={y+1} width="28" height="2" rx="1" fill="#d0d8e0"/>
      </g>
    ))}
    {/* gear icon */}
    <circle cx="56" cy="58" r="5" fill="white" stroke="#607d8b" strokeWidth="1"/>
    <circle cx="56" cy="58" r="2" fill="#607d8b"/>
  </svg>
);
 
interface ExamCardProps {
  exam: Exam;
  onEdit: (exam: Exam) => void;
  onDelete: (id: number) => void;
}
 
export default function ExamCard({ exam, onEdit, onDelete }: ExamCardProps) {
  return (
    <div className="exam-card">
      <div className="exam-card-thumb">
        <div className="exam-card-thumb-placeholder">
          <TestPaperThumb />
        </div>
      </div>
      <div className="exam-card-body">
        <div className="exam-card-name" title={exam.exam_name}>{exam.exam_name}</div>
        <div className="exam-card-desc" title={exam.description || "No description"}>
          {exam.description || "Lorem ipsum dolor …"}
        </div>
        <div className="exam-card-actions">
          <Button
            variant="icon"
            onClick={() => onEdit(exam)}
            aria-label={`Edit ${exam.exam_name}`}
            title="Edit exam"
            style={{ color: "var(--orange)" }}
          >
            <IconEdit />
          </Button>
          <Button
            variant="danger-icon"
            onClick={() => onDelete(exam.exam_id)}
            aria-label={`Delete ${exam.exam_name}`}
            title="Delete exam"
          >
            <IconTrash />
          </Button>
        </div>
      </div>
    </div>
  );
}