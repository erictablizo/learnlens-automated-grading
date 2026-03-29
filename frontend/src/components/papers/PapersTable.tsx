"use client";
import { Paper } from "@/types/paper";
import Button from "@/components/ui/Button";
 
const IconEye = () => (
  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
  </svg>
);
const IconTrash = () => (
  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);
 
interface PapersTableProps {
  papers: Paper[];
  onView: (paper: Paper) => void;
  onDelete: (paperId: number) => void;
}
 
export default function PapersTable({ papers, onView, onDelete }: PapersTableProps) {
  if (papers.length === 0) {
    return (
      <div className="table-wrapper">
        <table>
          <thead>
            <tr><th>Name</th><th>Score</th><th>Actions</th></tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={3} style={{ textAlign: "center", color: "var(--text-muted)", padding: "2rem" }}>
                No test papers added yet.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }
 
  return (
    <div className="table-wrapper">
      <table aria-label="Test papers">
        <thead>
          <tr>
            <th>Name</th>
            <th>Score</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {papers.map(p => (
            <tr key={p.paper_id}>
              <td>{p.student_name}</td>
              <td>
                {p.total_score !== null && p.total_score !== undefined
                  ? `${p.total_score} pts`
                  : <span style={{ color: "var(--text-muted)" }}>—</span>}
              </td>
              <td style={{ display: "flex", gap: "0.4rem" }}>
                <Button variant="icon" onClick={() => onView(p)} aria-label={`View paper for ${p.student_name}`} title="View paper">
                  <IconEye />
                </Button>
                <Button variant="danger-icon" onClick={() => onDelete(p.paper_id)} aria-label={`Delete paper for ${p.student_name}`} title="Delete paper">
                  <IconTrash />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}