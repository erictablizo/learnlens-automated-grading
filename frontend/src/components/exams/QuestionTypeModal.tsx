"use client";
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

  useEffect(() => { if (isOpen) { setItems(""); setItemsError(null); } }, [isOpen]);
  if (!isOpen) return null;

  const choose = (type: QuestionType) => {
    const v = items.trim();
    if (v === "") { onSelect(type, null); return; }
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 200) {
      setItemsError("Enter a whole number from 1 to 200, or leave it blank.");
      return;
    }
    onSelect(type, n);
  };

  const btn = (bg: string, fg: string, border: string): React.CSSProperties => ({
    padding: "0.75rem 1rem", background: bg, color: fg, border: `1px solid ${border}`,
    borderRadius: "var(--radius-sm)", fontWeight: 600,
    cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1,
  });

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="qt-title"
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex",
        alignItems: "center", justifyContent: "center", zIndex: 9999 }}
      onClick={loading ? undefined : onClose}>
      <div style={{ background: "white", borderRadius: "var(--radius-md)", padding: "2rem", maxWidth: 420,
        width: "calc(100% - 32px)", boxShadow: "var(--shadow-lg)" }} onClick={e => e.stopPropagation()}>
        <h2 id="qt-title" style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "1rem", color: "var(--navy)" }}>
          Select Question Type{pageNumber ? ` — Page ${pageNumber}` : ""}
        </h2>
        <p style={{ color: "var(--text-muted)", marginBottom: "1rem", fontSize: "0.9rem" }}>
          What type of questions does this page contain? Choose Mixed if one page has both a Multiple Choice part and a True/False part.
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
          <button type="button" onClick={() => choose("true_false")} disabled={loading}
            style={btn("var(--success-bg)", "var(--success)", "var(--success)")}>
            {loading ? "Generating…" : "True/False (Written)"}
          </button>
          <button type="button" onClick={() => choose("encircled")} disabled={loading}
            style={btn("var(--primary-bg)", "var(--primary)", "var(--primary)")}>
            {loading ? "Generating…" : "Multiple Choice (Circled)"}
          </button>
          {/* NEW 2026-09-26: one page that has BOTH parts, e.g.
          Part I Multiple Choice (1-5) + Part II True/False (6-10). */}
          <button type="button" onClick={() => choose("mixed")} disabled={loading}
            style={btn("var(--orange-light, #fdf1e3)", "var(--orange)", "var(--orange)")}>
            {loading ? "Generating…" : "Mixed — both on one page"}
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