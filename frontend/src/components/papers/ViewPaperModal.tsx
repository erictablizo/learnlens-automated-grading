"use client";
import { useState } from "react";
import { Paper } from "@/types/paper";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { paperService } from "@/services/paperService";
import { getToken } from "@/lib/auth";
 
const API_BASE    = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";
const STATIC_BASE = API_BASE.replace("/api", "");
 
function pageImageUrl(path: string): string {
  return `${STATIC_BASE}/${path.replace(/\\/g, "/").replace(/^\//, "")}`;
}
 
interface Props {
  paper:     Paper;
  examId:    number;
  onClose:   () => void;
  onRefresh: () => void;
}
 
export default function ViewPaperModal({ paper, examId, onClose, onRefresh }: Props) {
  const pages  = paper.paper_pages  ?? [];
  const scores = paper.paper_scores ?? [];
 
  const [regrading,    setRegrading]    = useState(false);
  const [regrade_msg,  setRegradeMsg]   = useState<string | null>(null);
  const [regrade_err,  setRegradeErr]   = useState<string | null>(null);
  const [pageIdx,      setPageIdx]      = useState(0);
  const [imgErrors,    setImgErrors]    = useState<Record<number, boolean>>({});
 
  const correct = scores.filter(s => s.is_correct).length;
  const total   = scores.length;
 
  const handleRegrade = async () => {
    const token = getToken();
    if (!token) return;
    setRegrading(true);
    setRegradeMsg(null);
    setRegradeErr(null);
    try {
      const result = await paperService.grade(examId, paper.paper_id, token);
      setRegradeMsg(`Re-graded: ${result.correct} / ${result.total_items} (${result.score_percent}%)`);
      onRefresh();
    } catch (e: unknown) {
      setRegradeErr(e instanceof Error ? e.message : "Re-grading failed.");
    } finally {
      setRegrading(false);
    }
  };
 
  return (
    <Modal title={paper.student_name} onClose={onClose}>
      {/* ── Score summary ── */}
      <div style={{ display: "flex", gap: "1.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <div>
          <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Score</p>
          <p style={{ fontWeight: 700, fontSize: "1.2rem", color: "var(--navy)" }}>
            {paper.total_score !== null && paper.total_score !== undefined
              ? paper.total_score
              : scores.length > 0 ? correct : "—"}
            {scores.length > 0 && <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontWeight: 400 }}> / {total}</span>}
          </p>
        </div>
 
        <div>
          <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Status</p>
          <p style={{ fontWeight: 600, color: paper.checked ? "var(--success)" : "var(--text-muted)", fontSize: "0.9rem" }}>
            {paper.checked ? "✓ Graded" : "Pending"}
          </p>
        </div>
 
        {/* Re-grade button */}
        {pages.length > 0 && (
          <div style={{ marginLeft: "auto" }}>
            <Button
              variant="secondary"
              onClick={handleRegrade}
              loading={regrading}
              style={{ fontSize: "0.8rem", padding: "0.4rem 0.9rem" }}
            >
              Re-grade
            </Button>
          </div>
        )}
      </div>
 
      {/* Re-grade feedback */}
      {regrade_msg && (
        <div role="status" aria-live="polite" className="alert alert-success" style={{ marginBottom: "0.75rem" }}>
          {regrade_msg}
        </div>
      )}
      {regrade_err && (
        <div role="alert" aria-live="assertive" className="alert alert-error" style={{ marginBottom: "0.75rem" }}>
          {regrade_err}
        </div>
      )}
 
      {/* ── Page images ── */}
      {pages.length > 0 && (
        <div style={{ marginBottom: "1.25rem" }}>
          <p className="section-title">Pages</p>
 
          {/* Image viewer */}
          <div style={{
            background:    "var(--bg)",
            borderRadius:  "var(--radius-sm)",
            border:        "1px solid var(--border)",
            minHeight:     200,
            display:       "flex",
            alignItems:    "center",
            justifyContent:"center",
            overflow:      "hidden",
            marginBottom:  "0.5rem",
          }}>
            {pages[pageIdx] && !imgErrors[pageIdx] ? (
              <img
                src={pageImageUrl(pages[pageIdx].image_path)}
                alt={`Page ${pages[pageIdx].page_number}`}
                onError={() => setImgErrors(prev => ({ ...prev, [pageIdx]: true }))}
                style={{ maxWidth: "100%", maxHeight: 320, objectFit: "contain" }}
              />
            ) : (
              <span style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
                {imgErrors[pageIdx] ? "Image unavailable" : "No image"}
              </span>
            )}
          </div>
 
          {/* Page nav */}
          {pages.length > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.75rem", fontSize: "0.82rem", color: "var(--text-muted)" }}>
              <button
                className="btn-icon"
                onClick={() => setPageIdx(i => Math.max(0, i - 1))}
                disabled={pageIdx === 0}
                aria-label="Previous page"
              >‹</button>
              Page {pageIdx + 1} of {pages.length}
              <button
                className="btn-icon"
                onClick={() => setPageIdx(i => Math.min(pages.length - 1, i + 1))}
                disabled={pageIdx >= pages.length - 1}
                aria-label="Next page"
              >›</button>
            </div>
          )}
        </div>
      )}
 
      {/* ── Score breakdown ── */}
      {scores.length > 0 && (
        <div>
          <p className="section-title">Score Breakdown</p>
          <div className="table-wrapper" style={{ maxHeight: 220, overflowY: "auto" }}>
            <table aria-label="Score breakdown">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th>Student</th>
                  <th>Correct</th>
                  <th style={{ width: 60 }}>Result</th>
                  <th style={{ width: 60 }}>Conf.</th>
                </tr>
              </thead>
              <tbody>
                {scores
                  .slice()
                  .sort((a, b) => a.question_number - b.question_number)
                  .map(s => (
                    <tr key={s.score_id}>
                      <td style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>{s.question_number}</td>
                      <td style={{ fontWeight: 500 }}>{s.student_answer}</td>
                      <td style={{ color: "var(--text-muted)" }}>{s.correct_answer}</td>
                      <td>
                        <span style={{
                          fontWeight: 700,
                          color: s.is_correct ? "var(--success)" : "var(--error)",
                          fontSize: "1rem",
                        }}>
                          {s.is_correct ? "✓" : "✗"}
                        </span>
                      </td>
                      <td style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        {s.ocr_confidence !== null && s.ocr_confidence !== undefined
                          ? `${s.ocr_confidence}%`
                          : "—"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
 
      {pages.length === 0 && scores.length === 0 && (
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", textAlign: "center", padding: "1rem 0" }}>
          No pages or scores for this paper yet.
        </p>
      )}
    </Modal>
  );
}