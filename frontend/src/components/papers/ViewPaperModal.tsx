"use client";
import { useState } from "react";
import { Paper } from "@/types/paper";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { paperService } from "@/services/paperService";
import { getToken } from "@/lib/auth";
// NEW 2026-11-11 — the per-item editor replaces the Score Breakdown table, and
// one shared function decides how every score on this screen is written.
import AnswerTable from "@/components/papers/AnswerTable";
import type { PaperAnswerResult } from "@/types/paperAnswer";
import {
  scoreFromItems, scoreFromGrade, formatScore, formatPercent, reviewNote,
} from "@/lib/scoreLabel";

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

  // CHANGED 2026-11-11. Was:
  //     const correct = scores.filter(s => s.is_correct).length;
  //     const total   = scores.length;
  // which counted an item still under review as WRONG, then printed the result
  // as a plain "11 / 19". MEASURED on the 2026-10-24 paper: the true score was
  // 15, four items were pending, and the screen said 11 of 19 with nothing to
  // say so. scoreFromItems reads `verdict`, keeps the floor and the ceiling
  // apart, and falls back to is_correct only for rows written before the
  // three-state migration (those carry verdict "").
  const parts = scoreFromItems(scores);
  const percent = formatPercent(parts);
  const note = reviewNote(parts);

  const handleRegrade = async () => {
    const token = getToken();
    if (!token) return;
    setRegrading(true);
    setRegradeMsg(null);
    setRegradeErr(null);
    try {
      const result = await paperService.grade(examId, paper.paper_id, token);
      // CHANGED 2026-11-11: this line had the same floor problem as the score
      // block - `${result.correct} / ${result.total_items} (${score_percent}%)`
      // on a paper with review items announces a finished score that is not
      // one. The response has carried max_possible / needs_review / is_final
      // since 2026-10-24.
      const r = scoreFromGrade(result);
      const pct = formatPercent(r);
      setRegradeMsg(
        `Re-graded: ${formatScore(r)}${pct ? ` (${pct})` : ""}` +
        (r.isFinal ? "" : ` — ${r.needsReview} item(s) still need your review.`)
      );
      onRefresh();
    } catch (e: unknown) {
      setRegradeErr(e instanceof Error ? e.message : "Re-grading failed.");
    } finally {
      setRegrading(false);
    }
  };

  /**
   * NEW 2026-11-11 — one item on this paper was corrected by hand.
   *
   * `onRefresh()` re-reads the paper, which is what repaints the table and the
   * score. The message is shown from the response rather than composed here:
   * the service already says whether the paper went back to unfinished, and
   * that sentence should not be written twice.
   */
  const handleAnswerChanged = (result: PaperAnswerResult) => {
    setRegradeErr(null);
    setRegradeMsg(result.message);
    onRefresh();
  };

  return (
    <Modal title={paper.student_name} onClose={onClose}>
      {/* ── Score summary ── */}
      <div style={{ display: "flex", gap: "1.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <div>
          <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Score</p>
          <p style={{ fontWeight: 700, fontSize: "1.2rem", color: "var(--navy)" }}>
            {formatScore(parts)}
            {percent && (
              <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontWeight: 400 }}>
                {" "}({percent})
              </span>
            )}
          </p>
        </div>

        <div>
          <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Status</p>
          {/* CHANGED 2026-11-11: "Pending" was shown for a paper under review
              and for a paper never checked at all - two different states, one
              word, and the teacher could not tell which needed her. */}
          <p style={{ fontWeight: 600, fontSize: "0.9rem",
                      color: paper.checked ? "var(--success)"
                           : parts.needsReview > 0 ? "var(--warning, #b7791f)"
                           : "var(--text-muted)" }}>
            {paper.checked
              ? "✓ Graded"
              : parts.needsReview > 0
                ? `${parts.needsReview} to review`
                : scores.length > 0 ? "Pending" : "Not checked"}
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

      {/* NEW 2026-11-11 — a range with no explanation is worse than no range. */}
      {note && (
        <div role="status" aria-live="polite" style={{
          fontSize: "0.8rem", color: "var(--text-muted)",
          marginTop: "-0.5rem", marginBottom: "0.9rem",
        }}>
          {note}
        </div>
      )}

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

      {/* ── Score breakdown ──
          CHANGED 2026-11-11: the table that stood here is now AnswerTable,
          which renders the same five columns and makes the Student cell
          editable. Nothing was dropped - #, Student, Correct, Result and Conf.
          are all still there, and Result now distinguishes "needs review" from
          "wrong" instead of showing ✗ for both. */}
      <AnswerTable
        examId={examId}
        paperId={paper.paper_id}
        scores={scores}
        onChanged={handleAnswerChanged}
      />

      {pages.length === 0 && scores.length === 0 && (
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", textAlign: "center", padding: "1rem 0" }}>
          No pages or scores for this paper yet.
        </p>
      )}
    </Modal>
  );
}