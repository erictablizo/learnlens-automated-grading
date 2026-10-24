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
 *
 * CHANGED 2026-10-24 — Doc Rubrica, SIXTH comment. Her English 101 sheet has
 * five parts in three different answering mechanics, and page 2 alone holds
 * four of them:
 *
 *     item 12      encircled            (a circled letter)
 *     items 13-18  written letter A-F   (matching type)
 *     items 19-24  identification       (a word on a line)
 *     items 25-30  True/False
 *
 * "Mixed" cannot describe that. It runs the circle detector and the T/F
 * detector over the whole page and merges by position, and "F" is both a valid
 * matching-type letter AND the first letter of FALSE — item 18 really is F and
 * item 26 really is FALSE, and nothing in a merged read can tell them apart.
 *
 * So the dialog gains a second mode: DECLARE THE ITEM RANGES. The teacher says
 * which items belong to which part, and the backend reads each part with the
 * right detector and hands the detections out in item order.
 *
 * BACKWARDS COMPATIBLE ON PURPOSE. `onDeclareParts` is OPTIONAL. A parent that
 * does not pass it gets exactly the dialog it has today — same props, same
 * behaviour, no parts UI at all. Drop this file in first, wire the parent when
 * you are ready.
 */
import { useEffect, useState } from "react";
import type { QuestionType } from "@/types/exam";

/** The question types a single PART can have. Deliberately NOT QuestionType:
 *  "mixed" is a whole-page strategy and is not a valid part type — the backend
 *  rejects it in validate_parts(). Move this to types/exam.ts if you prefer it
 *  beside QuestionType; it is exported here so the parent can import it
 *  without touching a second file. */
export type PartQuestionType =
  | "encircled"
  | "written_letter"
  | "identification"
  | "true_false";

export interface PagePartInput {
  first_item: number;
  last_item: number;
  question_type: PartQuestionType;
  letters: string;          // only meaningful for written_letter
}

/** Draft rows are strings while the teacher is typing — "" is not 0. */
interface PartDraft {
  first: string;
  last: string;
  type: PartQuestionType;
  letters: string;
}

const PART_TYPES: { value: PartQuestionType; label: string; hint: string }[] = [
  { value: "encircled",      label: "Multiple Choice — encircled",      hint: "the letter is circled" },
  { value: "written_letter", label: "Write the Letter / Matching",      hint: "a letter written on the blank" },
  { value: "identification", label: "Identification",                   hint: "a word written on the line" },
  { value: "true_false",     label: "True or False",                    hint: "TRUE or FALSE written on the blank" },
];

const emptyDraft = (first = ""): PartDraft => ({
  first, last: "", type: "encircled", letters: "ABCD",
});

interface QuestionTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** FIX 2026-09-22: 2nd argument = "Number of items on this page" (null = auto-detect). */
  onSelect: (type: QuestionType, expectedItems: number | null) => void;
  /** NEW 2026-10-24 — OPTIONAL. Omit it and the parts UI never appears, so an
   *  existing parent keeps working unchanged. */
  onDeclareParts?: (parts: PagePartInput[]) => void;
  loading?: boolean;
  pageNumber?: number;
}

export default function QuestionTypeModal({ isOpen, onClose, onSelect, onDeclareParts, loading = false, pageNumber }: QuestionTypeModalProps) {
  const [items, setItems] = useState("");
  const [itemsError, setItemsError] = useState<string | null>(null);
  // FIX 2026-10-21: which button was clicked. Without this every button read
  // the same `loading` prop, so all three said "Generating…" at once.
  // CHANGED 2026-10-22: there is one action button left, so this now only
  // separates "this button is generating" from "idle" — and it still dims
  // Cancel, which passes no type. Kept rather than unpicked, so the behaviour
  // the 2026-10-21 fix established does not change.
  // CHANGED 2026-10-24: "parts" joins the union, so the Declare-parts button
  // can say "Generating…" on its own exactly the same way.
  const [pending, setPending] = useState<QuestionType | "parts" | null>(null);

  // NEW 2026-10-24
  const [mode, setMode] = useState<"page" | "parts">("page");
  const [drafts, setDrafts] = useState<PartDraft[]>([emptyDraft("1")]);
  const [partsError, setPartsError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setItems(""); setItemsError(null); setPending(null);
      setMode("page"); setDrafts([emptyDraft("1")]); setPartsError(null);
    }
  }, [isOpen]);
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

  // NEW 2026-10-24 — the same rules the backend enforces in validate_parts(),
  // checked here only so the teacher sees the problem beside the field instead
  // of as a 422. The backend remains the authority; this never replaces it.
  const submitParts = () => {
    if (!onDeclareParts) return;
    const parsed: PagePartInput[] = [];
    for (let i = 0; i < drafts.length; i++) {
      const d = drafts[i];
      const first = Number(d.first.trim());
      const last = Number(d.last.trim());
      if (d.first.trim() === "" || d.last.trim() === "") {
        setPartsError(`Part ${i + 1}: fill in both the first and last item number.`);
        return;
      }
      if (!Number.isInteger(first) || !Number.isInteger(last) || first < 1 || last < 1 || first > 500 || last > 500) {
        setPartsError(`Part ${i + 1}: item numbers must be whole numbers from 1 to 500.`);
        return;
      }
      if (last < first) {
        setPartsError(`Part ${i + 1}: the last item (${last}) is before the first (${first}).`);
        return;
      }
      let letters = "ABCD";
      if (d.type === "written_letter") {
        const seen: string[] = [];
        for (const ch of d.letters.trim().toUpperCase()) {
          if (ch < "A" || ch > "Z") {
            setPartsError(`Part ${i + 1}: the choices must be letters A-Z, not "${ch}".`);
            return;
          }
          if (!seen.includes(ch)) seen.push(ch);
        }
        if (seen.length < 2 || seen.length > 10) {
          setPartsError(`Part ${i + 1}: give between 2 and 10 choices (e.g. ABCD, or ABCDEF).`);
          return;
        }
        letters = seen.join("");
      }
      parsed.push({ first_item: first, last_item: last, question_type: d.type, letters });
    }

    parsed.sort((a, b) => a.first_item - b.first_item);
    for (let i = 1; i < parsed.length; i++) {
      if (parsed[i].first_item <= parsed[i - 1].last_item) {
        setPartsError(
          `Items ${parsed[i].first_item}-${parsed[i].last_item} overlap items ` +
          `${parsed[i - 1].first_item}-${parsed[i - 1].last_item}. Each item belongs to one part.`
        );
        return;
      }
    }

    setPartsError(null);
    setPending("parts");
    onDeclareParts(parsed);
  };

  const addDraft = () => {
    const highest = drafts.reduce((m, d) => Math.max(m, Number(d.last.trim()) || 0), 0);
    setDrafts([...drafts, emptyDraft(highest ? String(highest + 1) : "")]);
    setPartsError(null);
  };
  const removeDraft = (i: number) => {
    setDrafts(drafts.length === 1 ? [emptyDraft("1")] : drafts.filter((_, k) => k !== i));
    setPartsError(null);
  };
  const setDraft = (i: number, patch: Partial<PartDraft>) => {
    setDrafts(drafts.map((d, k) => (k === i ? { ...d, ...patch } : d)));
    setPartsError(null);
  };

  // FIX 2026-10-21: `type` lets a button know whether IT is the one
  // generating, so anything else only dims instead of changing its label.
  const btn = (bg: string, fg: string, border: string, type?: QuestionType | "parts"): React.CSSProperties => ({
    padding: "0.75rem 1rem", background: bg, color: fg, border: `1px solid ${border}`,
    borderRadius: "var(--radius-sm)", fontWeight: 600,
    display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
    cursor: loading ? "not-allowed" : "pointer",
    opacity: loading ? (type && pending === type ? 1 : 0.45) : 1,
    transition: "opacity .15s",
  });

  // "Generating…" on the clicked button only.
  const label = (type: QuestionType | "parts", text: string) =>
    loading && pending === type
      ? <><span className="spinner" aria-hidden="true" /> Generating…</>
      : text;

  const fieldStyle: React.CSSProperties = {
    padding: "0.45rem 0.5rem", border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)", fontSize: "0.85rem", width: "100%",
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="qt-title"
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex",
        alignItems: "center", justifyContent: "center", zIndex: 9999 }}
      onClick={loading ? undefined : onClose}>
      <div style={{ background: "white", borderRadius: "var(--radius-md)", padding: "2rem",
        maxWidth: mode === "parts" ? 640 : 420,
        width: "calc(100% - 32px)", maxHeight: "calc(100vh - 64px)", overflowY: "auto",
        boxShadow: "var(--shadow-lg)" }} onClick={e => e.stopPropagation()}>
        {/* COPY 2026-10-22: was "Select Question Type" — there is no type to
            select any more, so the heading names what the dialog does. */}
        <h2 id="qt-title" style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "1rem", color: "var(--navy)" }}>
          Generate Answer Key{pageNumber ? ` — Page ${pageNumber}` : ""}
        </h2>

        {/* NEW 2026-10-24 — only shown when the parent can handle parts. */}
        {onDeclareParts && (
          <div role="tablist" aria-label="How to read this page"
            style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
            {([["page", "One page, one way"], ["parts", "Declare item ranges"]] as const).map(([m, text]) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} disabled={loading}
                onClick={() => { setMode(m); setItemsError(null); setPartsError(null); }}
                style={{
                  flex: 1, padding: "0.5rem 0.75rem", fontSize: "0.85rem", fontWeight: 600,
                  cursor: loading ? "not-allowed" : "pointer",
                  color: mode === m ? "var(--orange)" : "var(--text-muted)",
                  background: mode === m ? "var(--orange-light, #fdf1e3)" : "transparent",
                  border: `1px solid ${mode === m ? "var(--orange)" : "var(--border)"}`,
                  borderRadius: "var(--radius-sm)", opacity: loading ? 0.6 : 1,
                }}>
                {text}
              </button>
            ))}
          </div>
        )}

        {mode === "page" ? (
          <>
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
          </>
        ) : (
          <>
            <p style={{ color: "var(--text-muted)", marginBottom: "1rem", fontSize: "0.9rem" }}>
              Say which items belong to which part. Each part is read with the detector that matches how it is answered, so a matching-type “F” is never confused with “FALSE”. Gaps are allowed — list only the items printed on this page.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginBottom: "0.75rem" }}>
              {drafts.map((d, i) => (
                <div key={i} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "0.75rem" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                    <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--navy)" }}>Part {i + 1}</span>
                    <button type="button" onClick={() => removeDraft(i)} disabled={loading}
                      aria-label={`Remove part ${i + 1}`}
                      style={{ background: "transparent", border: "none", color: "var(--text-muted)",
                        fontSize: "0.8rem", cursor: loading ? "not-allowed" : "pointer" }}>
                      Remove
                    </button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "0.5rem" }}>
                    <div>
                      <label htmlFor={`p-first-${i}`} style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.2rem" }}>
                        First item
                      </label>
                      <input id={`p-first-${i}`} type="number" inputMode="numeric" min={1} max={500}
                        value={d.first} disabled={loading} placeholder="13"
                        onChange={e => setDraft(i, { first: e.target.value })} style={fieldStyle} />
                    </div>
                    <div>
                      <label htmlFor={`p-last-${i}`} style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.2rem" }}>
                        Last item
                      </label>
                      <input id={`p-last-${i}`} type="number" inputMode="numeric" min={1} max={500}
                        value={d.last} disabled={loading} placeholder="18"
                        onChange={e => setDraft(i, { last: e.target.value })} style={fieldStyle} />
                    </div>
                  </div>
                  <label htmlFor={`p-type-${i}`} style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.2rem" }}>
                    How is it answered?
                  </label>
                  <select id={`p-type-${i}`} value={d.type} disabled={loading}
                    onChange={e => setDraft(i, { type: e.target.value as PartQuestionType })}
                    style={{ ...fieldStyle, marginBottom: d.type === "written_letter" ? "0.5rem" : 0 }}>
                    {PART_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label} — {t.hint}</option>
                    ))}
                  </select>
                  {/* Only written_letter uses an alphabet. Matching type needs the
                      range its Column B actually prints: ABCDEF for her sheet. */}
                  {d.type === "written_letter" && (
                    <>
                      <label htmlFor={`p-letters-${i}`} style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.2rem" }}>
                        Choices used by this part
                      </label>
                      <input id={`p-letters-${i}`} type="text" value={d.letters} disabled={loading}
                        placeholder="ABCDEF" maxLength={16} autoCapitalize="characters" spellCheck={false}
                        onChange={e => setDraft(i, { letters: e.target.value })} style={fieldStyle} />
                      <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                        ABCD for four options, ABCDEF for a matching list of six. Narrowing this makes the reading more accurate.
                      </p>
                    </>
                  )}
                </div>
              ))}
            </div>

            <button type="button" onClick={addDraft} disabled={loading}
              style={{ background: "transparent", border: "1px dashed var(--border)", color: "var(--navy)",
                borderRadius: "var(--radius-sm)", padding: "0.5rem", width: "100%", fontSize: "0.85rem",
                fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", marginBottom: "0.75rem" }}>
              + Add another part
            </button>

            {partsError && (
              <p role="alert" style={{ fontSize: "0.78rem", color: "var(--error, #dc2626)", marginBottom: "0.75rem" }}>
                {partsError}
              </p>
            )}

            <div style={{ display: "flex", gap: "0.75rem", flexDirection: "column" }}>
              <button type="button" onClick={submitParts} disabled={loading}
                aria-busy={loading && pending === "parts"}
                style={btn("var(--orange-light, #fdf1e3)", "var(--orange)", "var(--orange)", "parts")}>
                {label("parts", `Generate from ${drafts.length} part${drafts.length === 1 ? "" : "s"}`)}
              </button>
              <button type="button" onClick={onClose} disabled={loading}
                style={{ ...btn("transparent", "var(--text-muted)", "var(--border)"), fontWeight: 500 }}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}