"use client";
import { Paper } from "@/types/paper";
import Modal from "@/components/ui/Modal";
 
interface ViewPaperModalProps {
  paper: Paper;
  onClose: () => void;
}
 
export default function ViewPaperModal({ paper, onClose }: ViewPaperModalProps) {
  const pages = paper.paper_pages ?? [];
  const scores = paper.paper_scores ?? [];
  const correct = scores.filter(s => s.is_correct).length;
 
  return (
    <Modal title={`Paper — ${paper.student_name}`} onClose={onClose}>
      {/* Summary row */}
      <div style={{ display: "flex", gap: "1.5rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
        <div>
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Student</span>
          <p style={{ fontWeight: 600, color: "var(--navy)" }}>{paper.student_name}</p>
        </div>
        <div>
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Score</span>
          <p style={{ fontWeight: 600, color: "var(--navy)" }}>
            {paper.total_score !== null && paper.total_score !== undefined
              ? `${paper.total_score} pts`
              : scores.length > 0 ? `${correct} / ${scores.length}` : "Not graded"}
          </p>
        </div>
        <div>
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Status</span>
          <p style={{ fontWeight: 600, color: paper.checked ? "var(--success)" : "var(--text-muted)" }}>
            {paper.checked ? "✓ Checked" : "Pending"}
          </p>
        </div>
      </div>
 
      {/* Pages */}
      {pages.length > 0 ? (
        <div style={{ marginBottom: "1.25rem" }}>
          <p className="section-title">Pages</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {pages.map(pg => (
              <div key={pg.paper_page_id} style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <span style={{ fontSize: "0.82rem", color: "var(--text-muted)", minWidth: "55px" }}>Page {pg.page_number}</span>
                <div
                  style={{
                    flex: 1,
                    background: "var(--bg)",
                    borderRadius: "var(--radius-sm)",
                    height: "120px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    border: "1px solid var(--border)",
                  }}
                >
                  {/* Image would be served from backend /uploads/ path */}
                  <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                    📄 {pg.image_path.split("/").pop()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: "1rem", color: "var(--text-muted)", fontSize: "0.875rem" }}>
          No pages uploaded for this paper.
        </div>
      )}
 
      {/* Score breakdown */}
      {scores.length > 0 && (
        <div>
          <p className="section-title">Score Breakdown</p>
          <div className="table-wrapper" style={{ maxHeight: "200px", overflowY: "auto" }}>
            <table aria-label="Score breakdown">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Student</th>
                  <th>Correct</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {scores.map(s => (
                  <tr key={s.score_id}>
                    <td>{s.question_number}</td>
                    <td style={{ fontWeight: 500 }}>{s.student_answer}</td>
                    <td style={{ color: "var(--text-muted)" }}>{s.correct_answer}</td>
                    <td>
                      <span style={{
                        fontWeight: 600,
                        color: s.is_correct ? "var(--success)" : "var(--error)",
                      }}>
                        {s.is_correct ? "✓" : "✗"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}