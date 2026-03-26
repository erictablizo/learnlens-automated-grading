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
    <div className="papers-table-wrap">
      <table className="papers-table">
        <thead>
          <tr>
            <th className="papers-th">Name</th>
            <th className="papers-th papers-th--center">Score</th>
            <th className="papers-th papers-th--center">Actions</th>
          </tr>
        </thead>
        <tbody>
          {papers.length === 0 ? (
            <tr>
              <td colSpan={3} className="papers-td papers-empty">
                No test papers yet. Click &ldquo;Add paper&rdquo; to upload one.
              </td>
            </tr>
          ) : (
            papers.map((paper) => (
              <tr key={paper.paper_id} className="papers-tr">
                <td className="papers-td papers-td--name">{paper.name}</td>
                <td className="papers-td papers-td--center">
                  {paper.checked && paper.score !== null
                    ? `${paper.score}%`
                    : <span className="papers-unchecked">—</span>}
                </td>
                <td className="papers-td papers-td--center">
                  <div className="papers-actions">
                    <button
                      className="papers-action-btn"
                      onClick={() => onView?.(paper)}
                      title="View paper"
                      aria-label={`View ${paper.name}`}
                    >
                      <EyeIcon />
                    </button>
                    <button
                      className="papers-action-btn papers-action-btn--danger"
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