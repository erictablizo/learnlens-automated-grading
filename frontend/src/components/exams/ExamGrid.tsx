"use client";
import React from "react";
import ExamCard, { Exam } from "./ExamCard";
 
interface ExamGridProps {
  exams: Exam[];
  onEdit: (exam: Exam) => void;
  onDelete: (exam: Exam) => void;
  onAdd: () => void;
}
 
export default function ExamGrid({ exams, onEdit, onDelete, onAdd }: ExamGridProps) {
  return (
    <div style={styles.grid}>
      {exams.map((exam) => (
        <ExamCard key={exam.exam_id} exam={exam} onEdit={onEdit} onDelete={onDelete} />
      ))}
 
      {/* Add button — always last */}
      <button style={styles.addBtn} onClick={onAdd} title="Add new exam">
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="32" cy="32" r="30" stroke="#64748b" strokeWidth="3" fill="none" />
          <line x1="32" y1="18" x2="32" y2="46" stroke="#64748b" strokeWidth="3.5" strokeLinecap="round" />
          <line x1="18" y1="32" x2="46" y2="32" stroke="#64748b" strokeWidth="3.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
 
const styles: Record<string, React.CSSProperties> = {
  grid: {
    display: "flex",
    flexWrap: "wrap",
    gap: 24,
    padding: "24px 32px",
    alignContent: "flex-start",
  },
  addBtn: {
    width: 170,
    height: 230,
    background: "none",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    transition: "opacity 0.2s",
    opacity: 0.75,
  },
};