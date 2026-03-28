"use client";

export interface TestPaper {
  paper_id: number;
  name: string;
  score: number | null;
  checked: boolean;
}

interface PapersTableProps {
  papers: TestPaper[];
  onView?: (paper: TestPaper) => void;
  onDelete?: (paperId: number) => void;
}

function EyeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6M14 11v6"/>
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  );
}

export default function PapersTable({ papers, onView, onDelete }: PapersTableProps) {
  return (
    <div className="pt-wrap" role="region" aria-label="Test papers">
      <table className="pt-table">
        <thead>
          <tr>
            <th className="pt-th">Name</th>
            <th className="pt-th pt-th--center">Score</th>
            <th className="pt-th pt-th--center">Actions</th>
          </tr>
        </thead>
        <tbody>
          {papers.length === 0 ? (
            <tr>
              <td colSpan={3} className="pt-empty">
                No test papers yet. Click &ldquo;Add paper&rdquo; to upload one.
              </td>
            </tr>
          ) : (
            papers.map((paper) => (
              <tr key={paper.paper_id} className="pt-tr">
                <td className="pt-td pt-td--name">{paper.name}</td>
                <td className="pt-td pt-td--center">
                  {paper.checked && paper.score !== null
                    ? <span className="pt-score">{paper.score}%</span>
                    : <span className="pt-score--pending">—</span>}
                </td>
                <td className="pt-td pt-td--center">
                  <div className="pt-actions">
                    <button
                      className="pt-action-btn"
                      onClick={() => onView?.(paper)}
                      title="View paper"
                      aria-label={`View ${paper.name}`}
                    >
                      <EyeIcon />
                    </button>
                    <button
                      className="pt-action-btn pt-action-btn--danger"
                      onClick={() => onDelete?.(paper.paper_id)}
                      title="Delete paper"
                      aria-label={`Delete ${paper.name}`}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
