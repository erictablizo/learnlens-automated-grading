"use client";
 
import { Exam } from "@/types/user";
import ExamCard from "./ExamCard";
 
interface ExamGridProps {
  exams: Exam[];
  onEdit?: (exam: Exam) => void;
  onDelete?: (examId: number) => void;
  onAdd?: () => void;
}
 
export default function ExamGrid({ exams, onEdit, onDelete, onAdd }: ExamGridProps) {
  return (
    <div className="grid-wrap">
      <h2 className="section-title">Exams</h2>
      <div className="grid">
        {exams.map((exam) => (
          <ExamCard
            key={exam.exam_id}
            exam={exam}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
 
        {/* Add new exam button */}
        <button className="add-card" onClick={onAdd} title="Add new exam">
          <span className="add-icon">+</span>
        </button>
      </div>
 
      <style jsx>{`
        .grid-wrap {
          flex: 1;
          padding: 28px 36px;
        }
        .section-title {
          font-size: 1.25rem;
          font-weight: 600;
          color: #1a2e4a;
          text-align: center;
          margin-bottom: 24px;
        }
        .grid {
          display: flex;
          flex-wrap: wrap;
          gap: 20px;
        }
        .add-card {
          width: 160px;
          height: 200px;
          background: none;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .add-icon {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          border: 3px solid #7a9bb5;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.8rem;
          color: #7a9bb5;
          font-weight: 300;
          transition: border-color 0.2s, color 0.2s;
          line-height: 1;
        }
        .add-card:hover .add-icon {
          border-color: #f5a623;
          color: #f5a623;
        }
      `}</style>
    </div>
  );
}