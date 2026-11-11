"use client";
/**
 * components/papers/AnswerTable.tsx
 * =================================
 * NEW 2026-11-11 — REPLACES the "Score Breakdown" table inside ViewPaperModal.
 *
 *   Alex Passion / Julius Bancud: "Create an option to override the answers in
 *   each number to handle corrections on the OCR Reading" — on one Test Paper.
 *
 * Not a SECOND table. The breakdown already listed #, Student, Correct, Result
 * and Conf.; this is the same table with the Student cell made editable and
 * the Result column taught about `verdict`. Every column it had is still here.
 *
 * The teacher clicks what the STUDENT wrote and types what is actually on the
 * page. The item is re-graded server-side by the same function the answer-key
 * cascade uses. She never types a verdict: a corrected answer survives a later
 * change to the answer key, and a stamped verdict does not.
 *
 * WHY EVERY ITEM IS EDITABLE, not just the flagged ones. From the 2026-10-24
 * run: "Item 16 is the one OCR error (she wrote E, the detector read C) — and
 * it is a *letter* item, which has no review state, so it is a silent lost
 * mark." The review queue only ever shows identification items. Restricting
 * this table to them would leave the exact defect it exists to fix.
 *
 * The review queue is NOT replaced either. It still shows the cropped
 * handwriting beside the flagged items, which this table cannot do.
 */
import { useEffect, useRef, useState } from "react";
import type { PaperScore } from "@/types/paper";
import type { PaperAnswerResult } from "@/types/paperAnswer";
import { paperAnswerService } from "@/services/paperAnswerService";
import { VERDICT_CORRECT, VERDICT_REVIEW } from "@/lib/scoreLabel";
import { getToken } from "@/lib/auth";

/** What ocr_service stores when nothing was detected (ml/grader.BLANK). */
const BLANK = "—";

interface Props {
  examId: number;
  paperId: number;
  scores: readonly PaperScore[];
  /** Called after a successful save so the parent can re-read the paper. */
  onChanged: (result: PaperAnswerResult) => void;
  /**
   * NEW 2026-11-11 (second pass) — WHERE this is rendering.
   *
   * "table" is the five-column Score Breakdown inside ViewPaperModal.
   *
   * "grid" is the two-column list in the right-hand page-viewer slot on
   * exams/[id], opposite AnswerKeyPanel. That slot is where a teacher actually
   * checks a paper against the key, so the override has to be reachable there
   * - ViewPaperModal is not mounted on that page at all.
   *
   * One component rather than two because the edit state, the save, the error
   * handling and the verdict colouring are identical; only the markup differs.
   */
  layout?: "table" | "grid";
}

type Tone = "correct" | "review" | "wrong";

/**
 * An empty verdict means the row predates the 2026-10-24 migration —
 * PaperScoreResponse declares `verdict: str = ""` so such rows still validate.
 * It does NOT mean wrong, so fall back to `is_correct` for those. Treating ""
 * as wrong would repaint every pre-October paper red.
 */
function toneOf(s: PaperScore): Tone {
  if (s.verdict === VERDICT_REVIEW) return "review";
  if (s.verdict) return s.verdict === VERDICT_CORRECT ? "correct" : "wrong";
  return s.is_correct ? "correct" : "wrong";
}

// --error and --success are the names this project's stylesheet uses; the
// 2026-11-11 first draft of this file guessed --danger, which does not exist,
// so every wrong answer would have rendered in the hard-coded fallback colour
// instead of the theme's. --warning is not used anywhere else in the paper
// screens, so it keeps a fallback.
const TONE: Record<Tone, { color: string; mark: string; title: string }> = {
  correct: { color: "var(--success)", mark: "✓", title: "Correct" },
  review:  { color: "var(--warning, #b7791f)", mark: "?", title: "Needs your review — not yet counted" },
  wrong:   { color: "var(--error)", mark: "✗", title: "Wrong" },
};

export default function AnswerTable({
  examId, paperId, scores, onChanged, layout = "table",
}: Props) {
  // KEYED BY question_number, never by array index. The AnswerKeyPanel bug of
  // the same day: an index key puts the open editor on the wrong row as soon
  // as the list is re-sorted, and this table sorts on every render.
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing !== null) inputRef.current?.focus();
  }, [editing]);

  const startEdit = (s: PaperScore) => {
    setError(null);
    setEditing(s.question_number);
    // Open EMPTY when the stored value is the blank sentinel. Seeding the box
    // with "—" would make the teacher delete a character that is not an answer
    // before she can type one.
    setDraft(s.student_answer === BLANK ? "" : s.student_answer);
  };

  const cancel = () => {
    setEditing(null);
    setDraft("");
    setError(null);
  };

  const save = async (questionNumber: number) => {
    const token = getToken();
    if (!token) {
      setError("Your session has expired. Sign in again.");
      return;
    }
    setSaving(questionNumber);
    setError(null);
    try {
      // Sent exactly as typed, including "". An empty string is a real answer:
      // it records that the student left the item blank, which grades wrong.
      const result = await paperAnswerService.override(
        examId, paperId, questionNumber, draft, token,
      );
      setEditing(null);
      setDraft("");
      onChanged(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save that answer.");
    } finally {
      setSaving(null);
    }
  };

  if (scores.length === 0) return null;

  const ordered = scores.slice().sort((a, b) => a.question_number - b.question_number);

  /** The editable cell, shared by both layouts. */
  const answerCell = (s: PaperScore, tone: Tone) => {
    const isEditing = editing === s.question_number;
    const isSaving = saving === s.question_number;
    if (isEditing) {
      return (
        <span style={{ display: "inline-flex", gap: "0.3rem", alignItems: "center" }}>
          <input
            ref={inputRef}
            value={draft}
            maxLength={100}
            disabled={isSaving}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") { e.preventDefault(); void save(s.question_number); }
              if (e.key === "Escape") { e.preventDefault(); cancel(); }
            }}
            aria-label={`Student answer for item ${s.question_number}`}
            style={{
              width: "6rem", padding: "0.1rem 0.3rem", font: "inherit",
              border: "1px solid var(--navy)", borderRadius: "var(--radius-sm)",
            }}
          />
          <button type="button" onClick={() => void save(s.question_number)}
                  disabled={isSaving} aria-label="Save" title="Save (Enter)"
                  style={{ border: 0, background: "none", cursor: "pointer",
                           color: "var(--success)", fontSize: "0.9rem", padding: 0 }}>
            ✓
          </button>
          <button type="button" onClick={cancel} disabled={isSaving}
                  aria-label="Cancel" title="Cancel (Esc)"
                  style={{ border: 0, background: "none", cursor: "pointer",
                           color: "var(--text-muted)", fontSize: "0.9rem", padding: 0 }}>
            ✕
          </button>
        </span>
      );
    }
    return (
      <button
        type="button"
        onClick={() => startEdit(s)}
        title={`${TONE[tone].title} — click to correct what the scanner read`}
        style={{
          border: 0, background: "none", cursor: "pointer", padding: 0,
          font: "inherit", fontWeight: 600, color: "inherit",
          textDecoration: "underline", textDecorationStyle: "dotted",
          textUnderlineOffset: "0.2em",
        }}
      >
        {isSaving ? "…" : (s.student_answer || BLANK)}
      </button>
    );
  };

  // ── the two-column grid, for the page-viewer slot on exams/[id] ──────────
  if (layout === "grid") {
    return (
      <div style={{ width: "100%" }}>
        {error && (
          <div role="alert" aria-live="assertive" className="alert alert-error"
               style={{ marginBottom: "0.5rem", fontSize: "0.8rem" }}>
            {error}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)",
                      gap: "0.1rem 2rem", width: "100%" }}>
          {ordered.map(s => {
            const tone = toneOf(s);
            return (
              // CHANGED 2026-11-11: the colour came from `s.is_correct`, which
              // is false for an item under REVIEW - so a pending item was
              // painted the same red as a wrong one, and the teacher had no
              // way to tell "the scanner is unsure" from "the student got it
              // wrong". toneOf reads `verdict`.
              <div key={s.score_id}
                   style={{ fontSize: "0.82rem", color: TONE[tone].color, padding: "0.1rem 0" }}>
                <span style={{ color: "var(--text-muted)", minWidth: 24, display: "inline-block" }}>
                  {s.question_number}.
                </span>
                {answerCell(s, tone)}
              </div>
            );
          })}
        </div>
        <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.6rem" }}>
          Click an answer to correct what the scanner read. Only this paper changes.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="section-title">Score Breakdown</p>
      <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
        Click a student answer to correct what the scanner read. Only this paper changes.
      </p>

      {error && (
        <div role="alert" aria-live="assertive" className="alert alert-error"
             style={{ marginBottom: "0.6rem" }}>
          {error}
        </div>
      )}

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
            {ordered.map(s => {
              const tone = toneOf(s);
              const isSaving = saving === s.question_number;
              return (
                <tr key={s.score_id}>
                  <td style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>
                    {s.question_number}
                  </td>
                  <td style={{ fontWeight: 500 }}>{answerCell(s, tone)}</td>
                  <td style={{ color: "var(--text-muted)" }}>{s.correct_answer || BLANK}</td>
                  <td>
                    <span title={TONE[tone].title}
                          style={{ fontWeight: 700, color: TONE[tone].color, fontSize: "1rem" }}>
                      {isSaving ? "…" : TONE[tone].mark}
                    </span>
                  </td>
                  <td style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    {/* The backend NULLs ocr_confidence on an overridden item:
                        the number described a reading a human has replaced.
                        "edited" is more use here than the "—" an untouched
                        undetected item shows (those store 0.0, not null). */}
                    {s.ocr_confidence !== null && s.ocr_confidence !== undefined
                      ? `${s.ocr_confidence}%`
                      : <span title="Corrected by hand — no scanner reading">edited</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}