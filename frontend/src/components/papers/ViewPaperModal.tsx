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

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

function XSmallIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}

// Demo score data — replaced by real API data once backend is wired
const DEMO_SCORES = [
  { question: 1, student: "A", correct: "A", is_correct: true },
  { question: 2, student: "C", correct: "B", is_correct: false },
  { question: 3, student: "D", correct: "D", is_correct: true },
  { question: 4, student: "B", correct: "A", is_correct: false },
  { question: 5, student: "C", correct: "C", is_correct: true },
  { question: 6, student: "A", correct: "A", is_correct: true },
  { question: 7, student: "D", correct: "D", is_correct: true },
  { question: 8, student: "B", correct: "C", is_correct: false },
  { question: 9, student: "A", correct: "A", is_correct: true },
  { question: 10, student: "C", correct: "C", is_correct: true },
];

export default function ViewPaperModal({ paper, onClose }: ViewPaperModalProps) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const correct = DEMO_SCORES.filter((s) => s.is_correct).length;
  const total   = DEMO_SCORES.length;
  const pct     = Math.round((correct / total) * 100);

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card modal-card--wide" role="dialog" aria-modal="true" aria-label="View paper">

        {/* Header */}
        <div className="modal-header">
          <div>
            <h2 className="modal-title">{paper.name}</h2>
            <p className="modal-subtitle">Test paper results</p>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            <XIcon />
          </button>
        </div>

        {/* Score summary */}
        <div className="vp-summary">
          <div className="vp-score-badge">
            <span className="vp-score-num">{pct}%</span>
            <span className="vp-score-label">{correct} / {total} correct</span>
          </div>
          <div className={`vp-status-chip ${pct >= 75 ? "vp-status-pass" : "vp-status-fail"}`}>
            {pct >= 75 ? "Passed" : "Failed"}
          </div>
        </div>

        {/* Answers table */}
        <div className="papers-table-wrap" style={{ maxHeight: 340, overflowY: "auto" }}>
          <table className="papers-table">
            <thead>
              <tr>
                <th className="papers-th">Question</th>
                <th className="papers-th papers-th--center">Student Answer</th>
                <th className="papers-th papers-th--center">Correct Answer</th>
                <th className="papers-th papers-th--center">Result</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_SCORES.map((row) => (
                <tr key={row.question} className="papers-tr">
                  <td className="papers-td" style={{ fontWeight: 700 }}>Q{row.question}</td>
                  <td className="papers-td papers-td--center">{row.student}</td>
                  <td className="papers-td papers-td--center">{row.correct}</td>
                  <td className="papers-td papers-td--center">
                    {row.is_correct
                      ? <span className="vp-correct"><CheckIcon /> Correct</span>
                      : <span className="vp-wrong"><XSmallIcon /> Wrong</span>}
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
