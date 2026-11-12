"use client";
/**
 * components/exams/KeyImagePreviewModal.tsx
 * =========================================
 * NEW 2026-11-12 — the confirm step between reading a key image and writing it
 * (Alex Passion, post-UAT page 3).
 *
 * WHY THERE IS A CONFIRM STEP AT ALL
 * ----------------------------------
 * Writing an answer key item re-checks EVERY paper in the exam and re-totals
 * every affected student — the 2026-11-11 cascade, working as intended. The
 * OCR is 100% on printed keys and on the real handwritten True/False sheet it
 * was measured against, but "measured at 100% on six sheets" is not "right on
 * the seventh". An image that wrote straight through would silently re-score a
 * whole section against a letter nobody chose.
 *
 * So every answer here is EDITABLE before anything is sent, and the rows the
 * parser was unsure of are marked. Correcting one field costs a moment;
 * finding out afterwards that 36 papers were re-graded against a bad key costs
 * the afternoon.
 *
 * ONLY WHAT CHANGED IS SENT. An item whose value still equals the key on file
 * is left out of the request entirely, so re-reading a key that was already
 * right sends nothing and triggers no cascade.
 */
import { useMemo, useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { keyImageService } from "@/services/keyImageService";
import type {
  KeyImageApplyResult, KeyImageItem, KeyImagePreview,
} from "@/types/keyImage";
import { getToken } from "@/lib/auth";

interface Props {
  examId: number;
  preview: KeyImagePreview;
  onClose: () => void;
  onApplied: (result: KeyImageApplyResult) => void;
  onError: (message: string) => void;
}

/** The answer the teacher will send for this row, before any editing. */
function startingValue(it: KeyImageItem): string {
  return it.answer;
}

/**
 * Exactly the items that will be WRITTEN, given what the teacher has typed.
 *
 * Exported so it can be tested on its own. Getting this wrong is expensive in
 * both directions: send too few and the correction silently does nothing,
 * send too many and a twenty-item key runs twenty cascades over every paper
 * in the exam instead of the three the teacher actually changed.
 *
 * Three rules, each with a reason:
 *   - an item with no row in the key (`current_answer === null`) is NEVER
 *     sent; the server would reject it, and this is the "image has 20, key
 *     has 16" case where the fix is to regenerate, not to write;
 *   - a blank value is never sent - grade_detected refuses to grade an exam
 *     with a blank key item;
 *   - comparison is case-insensitive and trimmed, so retyping "true" over
 *     "TRUE" is not a change and costs no cascade.
 */
export function changesToSend(
  items: KeyImageItem[],
  draft: Record<number, string>,
): { question_number: number; answer: string }[] {
  const out: { question_number: number; answer: string }[] = [];
  for (const it of items) {
    if (it.current_answer === null) continue;
    const value = (draft[it.question_number] ?? "").trim();
    if (!value) continue;
    if (value.toUpperCase() === (it.current_answer ?? "").trim().toUpperCase()) continue;
    out.push({ question_number: it.question_number, answer: value });
  }
  return out;
}

export default function KeyImagePreviewModal({
  examId, preview, onClose, onApplied, onError,
}: Props) {
  // Keyed by question number rather than array index, so nothing can drift
  // onto a different item if the list is ever re-ordered.
  const [draft, setDraft] = useState<Record<number, string>>(() => {
    const seed: Record<number, string> = {};
    for (const it of preview.items) seed[it.question_number] = startingValue(it);
    return seed;
  });
  const [saving, setSaving] = useState(false);

  const toSend = useMemo(
    () => changesToSend(preview.items, draft),
    [draft, preview.items],
  );

  const blanks = preview.items.filter(
    it => it.current_answer !== null && !(draft[it.question_number] ?? "").trim(),
  );

  const apply = async () => {
    const token = getToken();
    if (!token) { onError("Your session has expired. Sign in again."); return; }
    if (toSend.length === 0) { onClose(); return; }
    setSaving(true);
    try {
      const result = await keyImageService.apply(examId, toSend, token);
      onApplied(result);
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : "Could not update the answer key.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Answer key read from an image — page ${preview.page_number}`}
           onClose={saving ? () => {} : onClose}>

      {preview.problems.map((p, i) => (
        <div key={i} role="alert" className="alert alert-error"
             style={{ marginBottom: "0.5rem", fontSize: "0.82rem" }}>
          {p}
        </div>
      ))}

      <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: "0 0 0.75rem" }}>
        {preview.items.length} answer(s) read · <strong>{preview.changed}</strong> differ from
        the key on file · {preview.unchanged} already match
        {preview.not_in_key > 0 && <> · {preview.not_in_key} not in this key</>}
        {preview.needs_check > 0 && (
          <> · <span style={{ color: "var(--warning, #b7791f)" }}>
            {preview.needs_check} need checking
          </span></>
        )}
      </p>

      <div className="table-wrapper" style={{ maxHeight: 300, overflowY: "auto" }}>
        <table aria-label="Answers read from the image">
          <thead>
            <tr>
              <th style={{ width: 50 }}>Item</th>
              <th style={{ width: 130 }}>Answer</th>
              <th style={{ width: 110 }}>On file</th>
              <th>What was read</th>
            </tr>
          </thead>
          <tbody>
            {preview.items.map(it => {
              const value = draft[it.question_number] ?? "";
              const missing = it.current_answer === null;
              const differs = !missing &&
                value.trim().toUpperCase() !==
                (it.current_answer ?? "").trim().toUpperCase();
              return (
                <tr key={it.question_number}
                    style={{ background: !it.confident ? "var(--orange-light)" : undefined }}>
                  <td style={{ fontWeight: 600, color: "var(--navy)" }}>
                    {it.question_number}.
                  </td>
                  <td>
                    <input
                      value={value}
                      onChange={e => setDraft(d => ({ ...d, [it.question_number]: e.target.value }))}
                      disabled={saving || missing}
                      maxLength={100}
                      aria-label={`Answer for item ${it.question_number}`}
                      className="form-input"
                      style={{
                        padding: "0.15rem 0.35rem", fontSize: "0.82rem", fontWeight: 600,
                        width: "100%",
                        borderColor: differs ? "var(--orange)" : undefined,
                      }}
                    />
                  </td>
                  <td style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    {missing ? "—" : (it.current_answer || "—")}
                  </td>
                  <td style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    {missing
                      ? "Not in this key — regenerate if the item count is wrong"
                      : it.note || (differs ? "will be changed" : "already matches")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {preview.skipped_lines.length > 0 && (
        <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", margin: "0.5rem 0 0" }}>
          Ignored {preview.skipped_lines.length} line(s) that held no answer
          {/* Named rather than counted: "it ignored the title" and "it lost
              item 7" are the same number and very different problems. */}
          {": "}{preview.skipped_lines.slice(0, 4).map(s => `"${s}"`).join(", ")}
          {preview.skipped_lines.length > 4 && " …"}
        </p>
      )}

      <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", margin: "0.6rem 0 0" }}>
        Read with {preview.read_with}. Applying re-checks every paper graded
        against the items you change, and a paper can go back to needing review.
      </p>

      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "1rem" }}>
        <Button variant="secondary" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="primary" onClick={apply}
                loading={saving}
                disabled={saving || toSend.length === 0 || blanks.length > 0}>
          {blanks.length > 0
            ? `${blanks.length} answer(s) still blank`
            : toSend.length === 0
              ? "Nothing to change"
              : `Apply ${toSend.length} change${toSend.length === 1 ? "" : "s"}`}
        </Button>
      </div>
    </Modal>
  );
}