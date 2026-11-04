"use client";
import { Paper } from "@/types/paper";
import Button from "@/components/ui/Button";
// NEW 2026-11-04 (Doc Rubrica, page 4): "Paper Table: [Last Name] [First Name]".
// These three read a MIXED table - papers entered from now on have the two
// columns, the 18 that predate the migration have only student_name - so the
// JSX below needs no branch of its own.
import { paperLastName, paperFirstName, needsNameSplit } from "@/lib/textField";

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
  onDelete:        (paper: Paper) => void;
}

function ScoreCell({ paper }: { paper: Paper }) {
  if (paper.total_score !== null && paper.total_score !== undefined) {
    return <span style={{ fontWeight: 700, color: "var(--navy)" }}>{paper.total_score}</span>;
  }
  return <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>—</span>;
}

/** NEW 2026-11-04. The marker on a row whose name has not been split yet.
 *
 *  It exists because the character rule CANNOT catch the bad case: MEASURED,
 *  "Midterm - Alcantara" with an ASCII hyphen pre-fills Edit Paper, passes
 *  checkNamePart and saves wrong unless a person notices. The teacher spotting
 *  it unaided is not a control; a visible marker is. */
function SplitBadge() {
  return (
    <span
      title="This paper's name has not been split into Last name and First name yet. Open Edit Paper to split it."
      style={{
        marginLeft: "0.4rem", fontSize: "0.68rem", fontWeight: 700,
        color: "var(--orange)", background: "var(--orange-light)",
        border: "1px solid var(--orange)", borderRadius: "10px",
        padding: "0.05rem 0.4rem", whiteSpace: "nowrap",
      }}
    >
      needs split
    </span>
  );
}

const HEAD = (
  <tr>
    <th style={{ width: 40 }}>ID</th>
    <th>Last Name</th>
    <th>First Name</th>
    <th style={{ width: 80 }}>Score</th>
    <th style={{ width: 90 }}>Actions</th>
  </tr>
);

export default function PapersTable({ papers, selectedPaperId, onSelect, onEdit, onDelete }: Props) {
  if (papers.length === 0) {
    return (
      <div className="table-wrapper">
        <table>
          <thead>{HEAD}</thead>
          <tbody>
            <tr>
              {/* CHANGED 2026-11-04: colSpan 4 -> 5. Two name columns now. */}
              <td colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)", padding: "2rem" }}>
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
        <thead>{HEAD}</thead>
        <tbody>
          {papers.map((p, idx) => {
            const isSelected = p.paper_id === selectedPaperId;
            const unsplit    = needsNameSplit(p);
            const nameStyle  = {
              fontWeight: isSelected ? 600 : 500,
              color:      isSelected ? "var(--orange)" : "var(--navy)",
            };
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
                {/* The two columns read through paperLastName / paperFirstName,
                    so a legacy row shows its best-effort split rather than a
                    blank cell - and carries the badge saying so. */}
                <td style={nameStyle}>
                  {paperLastName(p) || "—"}
                  {unsplit && <SplitBadge />}
                </td>
                <td style={nameStyle}>{paperFirstName(p) || "—"}</td>
                <td><ScoreCell paper={p} /></td>
                <td onClick={e => e.stopPropagation()}>
                  <div style={{ display: "flex", gap: "0.25rem", alignItems: "center" }}>
                    {/* aria-label still uses student_name, which is composed
                        server-side and therefore never stale. That is the
                        payoff of keeping the column rather than dropping it. */}
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
                      onClick={() => onDelete(p)}
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