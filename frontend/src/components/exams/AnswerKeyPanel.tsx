"use client";
/**
 * NEW 2026-11-11 — the Answer Key panel, with each item editable in place.
 *
 * Alex Passion / Julius Bancud, post-UAT page 2:
 *
 *     Create an option to override the answers in each number to handle
 *     corrections on the OCR Reading.
 *     Can override or edit scanned answer in Answer Key (Column)
 *     If this item # 2 in "Column Answer Key" was updated it will automatic
 *     updates all the checking of item # 2 in all Test Papers tie-up to this
 *     answer key and updates the score of students affected.
 *
 * Doc Rubrica asked for the same cascade in one line: "If Ans-Key was
 * corrected -> auto-upload for all".
 *
 * EXTRACTED from app/exams/[id]/page.tsx rather than edited in place. That
 * file is 470 lines and carries the page viewer, the grading flow, four modals
 * and a toast; adding edit state, a draft value and a save call to it would
 * make a long file longer at the exact spot three separate fixes have already
 * landed. The page now passes the keys in and gets a result back.
 *
 * WHY INLINE, not a modal: the teacher is looking at the key BECAUSE an item
 * is wrong, and the item is three characters long. A modal to change "A" to
 * "B" is more ceremony than the edit deserves, and it would hide the rest of
 * the key - which is what the teacher is comparing against.
 */
import { useState } from "react";
import Button from "@/components/ui/Button";
import { answerKeyService } from "@/services/answerKeyService";
import { AnswerKeyUpdateResult } from "@/types/answerKey";
import { AnswerKey } from "@/types/exam";
import { getToken } from "@/lib/auth";

export interface AnswerKeyPanelProps {
  examId:      number;
  /** Already filtered to the page on screen and sorted by question number. */
  keys:        AnswerKey[];
  pageNumber:  number;
  /** False while no exam page is selected — Generate has nothing to read. */
  canGenerate: boolean;
  generating:  boolean;
  onGenerate:  () => void;
  /** Fired after a successful save, so the page can reload and toast. */
  onSaved:     (result: AnswerKeyUpdateResult) => void;
  onError:     (message: string) => void;
}

export default function AnswerKeyPanel({
  examId, keys, pageNumber, canGenerate, generating, onGenerate, onSaved, onError,
}: AnswerKeyPanelProps) {
  // The question number being edited, or null. Question number rather than
  // index, so a re-render that reorders or refilters the list cannot move the
  // edit onto a different item.
  const [editing, setEditing] = useState<number | null>(null);
  const [draft,   setDraft]   = useState("");
  const [saving,  setSaving]  = useState(false);

  const begin = (ak: AnswerKey) => {
    if (saving) return;
    setEditing(ak.question_number);
    setDraft(ak.correct_answer ?? "");
  };

  const cancel = () => { setEditing(null); setDraft(""); };

  const save = async (ak: AnswerKey) => {
    const value = draft.trim();
    if (!value) {
      // The server refuses this too (grade_detected will not grade an exam
      // with a blank key item), but saying so here costs nothing and saves a
      // round trip.
      onError("The answer cannot be blank.");
      return;
    }
    if (value === (ak.correct_answer ?? "").trim()) { cancel(); return; }

    const token = getToken();
    if (!token) { onError("Your session has expired. Please sign in again."); return; }

    setSaving(true);
    try {
      const result = await answerKeyService.updateItem(examId, ak.question_number, value, token);
      cancel();
      onSaved(result);
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : "Could not save that answer.");
    } finally {
      setSaving(false);
    }
  };

  if (keys.length === 0) {
    return (
      <Button
        variant="primary" onClick={onGenerate} loading={generating} disabled={!canGenerate}
        style={{ width: "auto", padding: "0.65rem 1.25rem" }}
      >
        {generating ? "Generating…" : "Generate Answer Key"}
      </Button>
    );
  }

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.1rem 2rem", width: "100%" }}>
        {keys.map(ak => {
          const isEditing = editing === ak.question_number;
          return (
            <div
              key={ak.answer_key_id}
              style={{
                fontSize: "0.82rem", color: "var(--navy)", padding: "0.1rem 0",
                display: "flex", alignItems: "center", gap: "0.35rem", minHeight: "1.7rem",
              }}
            >
              <span style={{ color: "var(--text-muted)", minWidth: 24, display: "inline-block" }}>
                {ak.question_number}.
              </span>

              {isEditing ? (
                <>
                  <input
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") { e.preventDefault(); void save(ak); }
                      if (e.key === "Escape") { e.preventDefault(); cancel(); }
                    }}
                    autoFocus
                    disabled={saving}
                    maxLength={100}
                    aria-label={`Correct answer for item ${ak.question_number}`}
                    style={{
                      flex: "1 1 auto", minWidth: 0, padding: "0.15rem 0.35rem",
                      fontSize: "0.82rem", fontWeight: 600,
                    }}
                  />
                  <button
                    type="button" onClick={() => void save(ak)} disabled={saving}
                    aria-label={`Save item ${ak.question_number}`} title="Save"
                    style={{ background: "none", border: "none", cursor: saving ? "default" : "pointer",
                             color: "var(--success, #2e7d32)", fontWeight: 700, padding: "0 0.15rem" }}
                  >
                    {saving ? "…" : "✓"}
                  </button>
                  <button
                    type="button" onClick={cancel} disabled={saving}
                    aria-label={`Cancel item ${ak.question_number}`} title="Cancel"
                    style={{ background: "none", border: "none", cursor: saving ? "default" : "pointer",
                             color: "var(--text-muted)", fontWeight: 700, padding: "0 0.15rem" }}
                  >
                    ✕
                  </button>
                </>
              ) : (
                /* A button, not a span with onClick: this is the only way to
                   reach the edit, so it must be reachable by keyboard and
                   announced as something that can be pressed. */
                <button
                  type="button"
                  onClick={() => begin(ak)}
                  title={`Edit item ${ak.question_number}. Every paper is re-checked against the new answer.`}
                  aria-label={`Item ${ak.question_number}, answer ${ak.correct_answer || "blank"}. Edit.`}
                  style={{
                    background: "none", border: "none", padding: "0.1rem 0.25rem",
                    font: "inherit", fontWeight: 600, color: "var(--navy)",
                    cursor: "pointer", borderRadius: 4, textAlign: "left",
                    borderBottom: "1px dashed var(--border)",
                  }}
                >
                  {ak.correct_answer || "—"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginTop: "0.75rem", fontSize: "0.78rem", color: "var(--text-muted)", gap: "0.5rem",
      }}>
        <span>
          {keys.length} answer(s) on page {pageNumber}
          <span style={{ marginLeft: "0.5rem" }}>· click an answer to correct it</span>
        </span>
        {/* Alex's page 3 asks where an "upload image of enumerated List of
            answers only" option should live. HERE, beside Regenerate: both
            mean "rebuild this key", differing only in what is read. Not added
            yet — there is no endpoint behind it, and a button that does
            nothing is worse than no button. */}
        <Button
          variant="secondary" onClick={onGenerate} loading={generating} disabled={!canGenerate}
          style={{ fontSize: "0.78rem", padding: "0.3rem 0.8rem" }}
        >
          Regenerate
        </Button>
      </div>
    </div>
  );
}
