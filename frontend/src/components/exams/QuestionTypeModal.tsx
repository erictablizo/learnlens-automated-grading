"use client";
/**
 * CHANGED 2026-10-22 — Doc Rubrica, third comment: "Third Button remains ...
 * but the first 2 buttons should be removed."
 *
 * The "True/False (Written)" and "Multiple Choice (Encircled)" buttons are
 * gone; "Mixed — both on one page" stays, with its label unchanged, and so
 * does Cancel. Every page is now generated as `mixed`.
 *
 * The onSelect(type, expectedItems) contract is UNCHANGED — it simply only
 * ever receives "mixed" now — so the parent page needs no edit, and the
 * backend still accepts all three values. That matters: exams whose keys were
 * generated earlier as true_false or encircled must keep loading.
 *
 * With the choice gone, this dialog's only input is the item count, so the
 * title and the lead paragraph were reworded to match. The ORIGINAL wording is
 * kept in a comment beside each one if you want it back.
 */
import { useEffect, useState } from "react";
import type { QuestionType } from "@/types/exam";

interface QuestionTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** FIX 2026-09-22: 2nd argument = "Number of items on this page" (null = auto-detect). */
  onSelect: (type: QuestionType, expectedItems: number | null) => void;
  loading?: boolean;
  pageNumber?: number;
}

export default function QuestionTypeModal({ isOpen, onClose, onSelect, loading = false, pageNumber }: QuestionTypeModalProps) {
  const [items, setItems] = useState("");
  const [itemsError, setItemsError] = useState<string | null>(null);
  // FIX 2026-10-21: which button was clicked. Without this every button read
  // the same `loading` prop, so all three said "Generating…" at once.
  // CHANGED 2026-10-22: there is one action button left, so this now only
  // separates "this button is generating" from "idle" — and it still dims
  // Cancel, which passes no type. Kept rather than unpicked, so the behaviour
  // the 2026-10-21 fix established does not change.
  const [pending, setPending] = useState<QuestionType | null>(null);

  useEffect(() => { if (isOpen) { setItems(""); setItemsError(null); setPending(null); } }, [isOpen]);
  // The parent clears `loading` when generation finishes OR fails — either way
  // the button must stop saying "Generating…".
  useEffect(() => { if (!loading) setPending(null); }, [loading]);
  if (!isOpen) return null;

  const choose = (type: QuestionType) => {
    const v = items.trim();
    if (v === "") { setPending(type); onSelect(type, null); return; }
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 200) {
      setItemsError("Enter a whole number from 1 to 200, or leave it blank.");
      return;                      // nothing goes pending — the input is wrong
    }
    setPending(type);
    onSelect(type, n);
  };

  // FIX 2026-10-21: `type` lets a button know whether IT is the one
  // generating, so anything else only dims instead of changing its label.
  const btn = (bg: string, fg: string, border: string, type?: QuestionType): React.CSSProperties => ({
    padding: "0.75rem 1rem", background: bg, color: fg, border: `1px solid ${border}`,
    borderRadius: "var(--radius-sm)", fontWeight: 600,
    display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
    cursor: loading ? "not-allowed" : "pointer",
    opacity: loading ? (type && pending === type ? 1 : 0.45) : 1,
    transition: "opacity .15s",
  });

  // "Generating…" on the clicked button only.
  const label = (type: QuestionType, text: string) =>
    loading && pending === type
      ? <><span className="spinner" aria-hidden="true" /> Generating…</>
      : text;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="qt-title"
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex",
        alignItems: "center", justifyContent: "center", zIndex: 9999 }}
      onClick={loading ? undefined : onClose}>
      <div style={{ background: "white", borderRadius: "var(--radius-md)", padding: "2rem", maxWidth: 420,
        width: "calc(100% - 32px)", boxShadow: "var(--shadow-lg)" }} onClick={e => e.stopPropagation()}>
        {/* COPY 2026-10-22: was "Select Question Type" — there is no type to
            select any more, so the heading names what the dialog does. */}
        <h2 id="qt-title" style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "1rem", color: "var(--navy)" }}>
          Generate Answer Key{pageNumber ? ` — Page ${pageNumber}` : ""}
        </h2>
        {/* COPY 2026-10-22: was "What type of questions does this page contain?
            Choose Mixed if one page has both a Multiple Choice part and a
            True/False part." — that asked a question the teacher can no longer
            answer. It now explains what will happen and points at the one
            field that is left. */}
        <p style={{ color: "var(--text-muted)", marginBottom: "1rem", fontSize: "0.9rem" }}>
          This page is read for both encircled Multiple Choice answers and written True/False answers. Enter how many items the page has so stray marks are not mistaken for answers.
        </p>

        <label htmlFor="qt-items" style={{ display: "block", fontSize: "0.85rem", fontWeight: 600,
          color: "var(--navy)", marginBottom: "0.35rem" }}>
          Number of items on this page <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(optional, recommended)</span>
        </label>
        <input id="qt-items" type="number" inputMode="numeric" min={1} max={200} placeholder="e.g. 12"
          value={items} disabled={loading}
          onChange={e => { setItems(e.target.value); setItemsError(null); }}
          aria-invalid={!!itemsError} aria-describedby="qt-items-help"
          style={{ width: "100%", padding: "0.6rem 0.75rem", border: `1px solid ${itemsError ? "var(--error, #dc2626)" : "var(--border)"}`,
            borderRadius: "var(--radius-sm)", marginBottom: "0.35rem" }} />
        <p id="qt-items-help" style={{ fontSize: "0.78rem", marginBottom: "1.25rem",
          color: itemsError ? "var(--error, #dc2626)" : "var(--text-muted)" }}>
          {itemsError ?? "If filled in, exactly this many answers are kept, so stray marks are not added to the key."}
        </p>

        <div style={{ display: "flex", gap: "0.75rem", flexDirection: "column" }}>
          {/* REMOVED 2026-10-22 (Doc Rubrica): the "True/False (Written)" and
              "Multiple Choice (Encircled)" buttons. The values "true_false"
              and "encircled" are still valid in types/exam.ts and still
              accepted by the backend, so answer keys generated with them
              before today keep working — they simply cannot be chosen here. */}

          {/* NEW 2026-09-26: one page that has BOTH parts, e.g.
          Part I Multiple Choice (1-5) + Part II True/False (6-10). */}
          <button type="button" onClick={() => choose("mixed")} disabled={loading}
            aria-busy={loading && pending === "mixed"}
            style={btn("var(--orange-light, #fdf1e3)", "var(--orange)", "var(--orange)", "mixed")}>
            {label("mixed", "Mixed — both on one page")}
          </button>
          <button type="button" onClick={onClose} disabled={loading}
            style={{ ...btn("transparent", "var(--text-muted)", "var(--border)"), fontWeight: 500 }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}