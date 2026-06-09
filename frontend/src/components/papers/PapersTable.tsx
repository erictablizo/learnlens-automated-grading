"use client";
import { Paper } from "@/types/paper";
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
 
interface Props {
  papers:          Paper[];
  selectedPaperId: number | null;
  onSelect:        (paper: Paper) => void;
  onEdit:          (paper: Paper) => void;
  onDelete:        (paperId: number) => void;
}
 
function ScoreCell({ paper }: { paper: Paper }) {
  if (paper.total_score !== null && paper.total_score !== undefined) {
    return <span style={{ fontWeight: 700, color: "var(--navy)" }}>{paper.total_score}</span>;
  }
  return <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>—</span>;
}
 
export default function PapersTable({ papers, selectedPaperId, onSelect, onEdit, onDelete }: Props) {
  if (papers.length === 0) {
    return (
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th style={{ width: 40 }}>ID</th>
              <th>Name</th>
              <th style={{ width: 80 }}>Score</th>
              <th style={{ width: 90 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={4} style={{ textAlign: "center", color: "var(--text-muted)", padding: "2rem" }}>
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
            <th style={{ width: 40 }}>ID</th>
            <th>Name</th>
            <th style={{ width: 80 }}>Score</th>
            <th style={{ width: 90 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {papers.map((p, idx) => {
            const isSelected = p.paper_id === selectedPaperId;
            return (
              <tr
                key={p.paper_id}
                onClick={() => onSelect(p)}
                aria-selected={isSelected}
                style={{
                  cursor:     "pointer",
                  background: isSelected ? "var(--orange-light)" : undefined,
                  outline:    isSelected ? "1.5px solid var(--orange)" : undefined,
                }}
              >
                <td style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>{idx + 1}</td>
                <td style={{
                  fontWeight: isSelected ? 600 : 500,
                  color:      isSelected ? "var(--orange)" : "var(--navy)",
                }}>
                  {p.student_name}
                </td>
                <td><ScoreCell paper={p} /></td>
                <td onClick={e => e.stopPropagation()}>
                  <div style={{ display: "flex", gap: "0.25rem", alignItems: "center" }}>
                    <Button
                      variant="icon"
                      onClick={() => onEdit(p)}
                      aria-label={`Edit ${p.student_name}`}
                      title="Edit paper"
                      style={{ color: "var(--orange)" }}
                    >
                      <IconEdit />
                    </Button>
                    <Button
                      variant="danger-icon"
                      onClick={() => onDelete(p.paper_id)}
                      aria-label={`Delete ${p.student_name}`}
                      title="Delete paper"
                    >
                      <IconTrash />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}