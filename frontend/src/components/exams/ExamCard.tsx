"use client";
import React from "react";
 
export interface Exam {
  exam_id: number;
  exam_name: string;
  description: string;
  created_at: string;
}
 
interface ExamCardProps {
  exam: Exam;
  onEdit: (exam: Exam) => void;
  onDelete: (exam: Exam) => void;
}
 
export default function ExamCard({ exam, onEdit, onDelete }: ExamCardProps) {
  return (
    <div style={styles.card}>
      {/* Thumbnail */}
      <div style={styles.thumbnail}>
        <ExamThumbnailSVG />
      </div>
 
      {/* Info */}
      <div style={styles.info}>
        <p style={styles.name}>{exam.exam_name}</p>
        <p style={styles.desc}>
          {exam.description.length > 22
            ? exam.description.slice(0, 22) + " ..."
            : exam.description}
        </p>
      </div>
 
      {/* Actions */}
      <div style={styles.actions}>
        <button style={styles.iconBtn} onClick={() => onEdit(exam)} title="Edit">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="#f59e0b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
        <button style={styles.iconBtn} onClick={() => onDelete(exam)} title="Delete">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="#f59e0b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
 
function ExamThumbnailSVG() {
  return (
    <svg viewBox="0 0 140 110" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      {/* paper base */}
      <rect x="18" y="8" width="82" height="96" rx="4" fill="#fff" stroke="#e2e8f0" strokeWidth="1.5" />
      {/* header */}
      <rect x="18" y="8" width="82" height="28" rx="4" fill="#1e3a5f" />
      <rect x="18" y="26" width="82" height="10" fill="#1e3a5f" />
      <text x="59" y="27" textAnchor="middle" fill="#fff" fontSize="11"
        fontWeight="700" fontFamily="sans-serif">TEST</text>
      {/* answer lines */}
      <line x1="30" y1="48" x2="54" y2="48" stroke="#cbd5e1" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="30" y1="60" x2="68" y2="60" stroke="#cbd5e1" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="30" y1="72" x2="60" y2="72" stroke="#cbd5e1" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="30" y1="84" x2="72" y2="84" stroke="#cbd5e1" strokeWidth="1.8" strokeLinecap="round" />
      {/* orange checkmarks */}
      <polyline points="58,44 61,47 67,41" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="58,56 61,59 67,53" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="58,68 61,71 67,65" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* orange bookmark tab */}
      <rect x="86" y="30" width="18" height="58" rx="2" fill="#f59e0b" />
      <polygon points="86,88 95,81 104,88" fill="#d97706" />
      {/* gear */}
      <circle cx="78" cy="97" r="5" fill="none" stroke="#64748b" strokeWidth="1.4" />
      <circle cx="78" cy="97" r="2" fill="#64748b" />
    </svg>
  );
}
 
const styles: Record<string, React.CSSProperties> = {
  card: {
    background: "#fff",
    borderRadius: 12,
    width: 170,
    boxShadow: "0 2px 10px rgba(0,0,0,0.09)",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    transition: "box-shadow 0.2s, transform 0.15s",
  },
  thumbnail: {
    width: "100%",
    height: 128,
    background: "#f1f5f9",
    padding: "8px 8px 0",
    boxSizing: "border-box",
  },
  info: { padding: "8px 12px 4px" },
  name: {
    margin: 0,
    fontSize: 13,
    fontWeight: 600,
    color: "#1e3a5f",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  desc: { margin: "3px 0 0", fontSize: 11, color: "#94a3b8" },
  actions: {
    display: "flex",
    justifyContent: "space-between",
    padding: "6px 12px 10px",
  },
  iconBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 4,
    borderRadius: 4,
    display: "flex",
    alignItems: "center",
    lineHeight: 0,
  },
};