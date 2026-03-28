"use client";

import { useEffect } from "react";
import { TestPaper } from "./PapersTable";

interface ViewPaperModalProps {
  paper: TestPaper;
  onClose: () => void;
}

function XIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}

// Demo answer breakdown (replaced by real API data when backend is wired)
const DEMO_SCORES = [
  { question: 1,  student: "A", correct: "A", is_correct: true  },
  { question: 2,  student: "C", correct: "B", is_correct: false },
  { question: 3,  student: "D", correct: "D", is_correct: true  },
  { question: 4,  student: "B", correct: "A", is_correct: false },
  { question: 5,  student: "C", correct: "C", is_correct: true  },
  { question: 6,  student: "A", correct: "A", is_correct: true  },
  { question: 7,  student: "D", correct: "D", is_correct: true  },
  { question: 8,  student: "B", correct: "C", is_correct: false },
  { question: 9,  student: "A", correct: "A", is_correct: true  },
  { question: 10, student: "C", correct: "C", is_correct: true  },
];

export default function ViewPaperModal({ paper, onClose }: ViewPaperModalProps) {
  // HCI: User control — close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const correct = DEMO_SCORES.filter((s) => s.is_correct).length;
  const total   = DEMO_SCORES.length;
  const pct     = Math.round((correct / total) * 100);
  const passed  = pct >= 75;

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="presentation"
    >
      <div className="modal-card modal-card--wide" role="dialog" aria-modal="true" aria-labelledby="vp-title">

        {/* Header */}
        <div className="modal-header">
          <div>
            <h2 className="modal-title" id="vp-title">{paper.name}</h2>
            <p className="modal-subtitle">Answer breakdown</p>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close dialog">
            <XIcon />
          </button>
        </div>

        {/* Score summary — HCI: Visibility of system status */}
        <div className="vp-summary" aria-label={`Score: ${pct}%, ${correct} of ${total} correct`}>
          <div className="vp-score-block">
            <span className="vp-score-pct">{pct}%</span>
            <span className="vp-score-sub">{correct} / {total} correct</span>
          </div>
          <span className={`vp-chip ${passed ? "vp-chip--pass" : "vp-chip--fail"}`}>
            {passed ? "Passed" : "Failed"}
          </span>
        </div>

        {/* Answer table */}
        <div className="pt-wrap" style={{ maxHeight: 320, overflowY: "auto" }}>
          <table className="pt-table" aria-label="Answer breakdown table">
            <thead>
              <tr>
                <th className="pt-th">Question</th>
                <th className="pt-th pt-th--center">Student</th>
                <th className="pt-th pt-th--center">Correct</th>
                <th className="pt-th pt-th--center">Result</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_SCORES.map((row) => (
                <tr key={row.question} className="pt-tr">
                  <td className="pt-td" style={{ fontWeight: 700 }}>Q{row.question}</td>
                  <td className="pt-td pt-td--center">{row.student}</td>
                  <td className="pt-td pt-td--center">{row.correct}</td>
                  <td className="pt-td pt-td--center">
                    {row.is_correct
                      ? <span className="vp-correct">✓ Correct</span>
                      : <span className="vp-wrong">✗ Wrong</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="ce-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
