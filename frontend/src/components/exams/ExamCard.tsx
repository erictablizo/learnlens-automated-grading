"use client";

import { useRouter } from "next/navigation";

function EditIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6M14 11v6"/>
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  );
}

function GearIcon() {
  return (
    <svg className="exam-card-settings" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

interface ExamCardProps {
  examId: number;
  name: string;
  description: string;
  onEdit?: (id: number) => void;
  onDelete?: (id: number) => void;
}

export default function ExamCard({ examId, name, description, onEdit, onDelete }: ExamCardProps) {
  const router = useRouter();

  return (
    <article className="exam-card" aria-label={`Exam: ${name}`}>
      {/* Clickable thumbnail → View Exam page (HCI: direct navigation) */}
      <div
        className="exam-card-thumb"
        onClick={() => router.push(`/exams/${examId}`)}
        style={{ cursor: "pointer" }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter") router.push(`/exams/${examId}`); }}
        aria-label={`View ${name}`}
      >
        <span className="exam-card-thumb-label">TEST</span>
        <GearIcon />
      </div>

      {/* Body — also clickable */}
      <div
        className="exam-card-body"
        onClick={() => router.push(`/exams/${examId}`)}
        style={{ cursor: "pointer" }}
      >
        <p className="exam-card-name">{name}</p>
        <p className="exam-card-desc" title={description}>{description || "No description"}</p>
      </div>

      {/* Footer actions */}
      <div className="exam-card-footer">
        <button
          className="exam-card-action"
          onClick={() => onEdit?.(examId)}
          aria-label={`Edit ${name}`}
          title="Edit exam"
        >
          <EditIcon />
        </button>
        <button
          className="exam-card-action delete"
          onClick={() => onDelete?.(examId)}
          aria-label={`Delete ${name}`}
          title="Delete exam"
        >
          <DeleteIcon />
        </button>
      </div>
    </article>
  );
}