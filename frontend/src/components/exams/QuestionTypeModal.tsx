"use client";
/**
 * CHANGED 2026-10-22 — Doc Rubrica, third comment: the first two buttons were
 * removed; "Mixed — both on one page" and Cancel remain. Every page is now
 * generated as `mixed`.
 *
 * CHANGED 2026-10-24 — Doc Rubrica, sixth comment: a second mode that lets the
 * teacher DECLARE THE ITEM RANGES, because one page can hold four parts in
 * three answering mechanics and "mixed" cannot describe that. `onDeclareParts`
 * is OPTIONAL, so a parent that does not pass it gets the old dialog exactly.
 *
 * CHANGED 2026-11-20 — Sir Alex Passion, Recommendations page 12:
 *
 *     Aside from "Number of items on this page" input, add new fields:
 *       1 item equivalent to how many points = Drop-down List for 1..10
 *       Total Points on this page (Computed) = ______
 *     "Insert the 2 New Lines after of 'Number of items on this page' line."
 *     "the equivalent points per item will be used in the computation of
 *      total scores of each Student."
 *
 * Three things about how that was built:
 *
 * ONE VALUE, BOTH MODES. He drew it under the item-count field, which only
 * exists in page mode. The same value is shown in parts mode too, below the
 * part list, because a teacher who declares ranges is pricing the same page
 * and would otherwise silently get 1 point an item with no field to say so.
 * In parts mode the item count is summed from the declared ranges.
 *
 * THE COMPUTED TOTAL IS READ-ONLY AND NOT SENT. The server recomputes it from
 * items x points (app/ml/scoring.page_total). A number the browser worked out
 * is not a number the database should trust; this field is there so the
 * teacher sees the consequence before pressing the button.
 *
 * THE THIRD ARGUMENT IS OPTIONAL, so a parent still calling
 * `onSelect(type, items)` compiles and behaves exactly as before. Same for
 * `onDeclareParts`. The modal can ship ahead of the page that renders it.
 */
import { useEffect, useState } from "react";
import type { QuestionType } from "@/types/exam";

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

/** NEW 2026-11-20 — the dropdown Alex specified, 1 to 10. Mirrored by
 *  ck_answer_keys_points_range in the database and by MIN/MAX_POINTS in
 *  app/ml/scoring.py. Three statements of one rule, because it is a rule
 *  about marks. */
const POINTS_CHOICES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const DEFAULT_POINTS = 1;

interface QuestionTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** FIX 2026-09-22: 2nd argument = "Number of items on this page" (null = auto-detect).
   *  NEW 2026-11-20: 3rd argument = points per item. OPTIONAL — a parent that
   *  ignores it keeps working and every item is worth 1. */
  onSelect: (type: QuestionType, expectedItems: number | null, pointsPerItem?: number) => void;
  /** NEW 2026-10-24 — OPTIONAL. Omit it and the parts UI never appears.
   *  NEW 2026-11-20: 2nd argument = points per item. */
  onDeclareParts?: (parts: PagePartInput[], pointsPerItem?: number) => void;
  loading?: boolean;
  pageNumber?: number;
}

export default function QuestionTypeModal({ isOpen, onClose, onSelect, onDeclareParts, loading = false, pageNumber }: QuestionTypeModalProps) {
  const [items, setItems] = useState("");
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [pending, setPending] = useState<QuestionType | "parts" | null>(null);

  const [mode, setMode] = useState<"page" | "parts">("page");
  const [drafts, setDrafts] = useState<PartDraft[]>([emptyDraft("1")]);
  const [partsError, setPartsError] = useState<string | null>(null);

  // NEW 2026-11-20
  const [points, setPoints] = useState<number>(DEFAULT_POINTS);

  useEffect(() => {
    if (isOpen) {
      setItems(""); setItemsError(null); setPending(null);
      setMode("page"); setDrafts([emptyDraft("1")]); setPartsError(null);
      setPoints(DEFAULT_POINTS);
    }
  }, [isOpen]);
  useEffect(() => { if (!loading) setPending(null); }, [loading]);
  if (!isOpen) return null;

  /** Items declared in parts mode, so the computed total means something
   *  there too. A part with an unfinished range contributes nothing rather
   *  than NaN. */
  const declaredItems = drafts.reduce((n, d) => {
    const a = Number(d.first.trim()), b = Number(d.last.trim());
    if (!Number.isInteger(a) || !Number.isInteger(b) || b < a) return n;
    return n + (b - a + 1);
  }, 0);

  const countedItems = mode === "page" ? Number(items.trim()) : declaredItems;
  const itemsKnown = Number.isInteger(countedItems) && countedItems > 0;
  const computedTotal = itemsKnown ? countedItems * points : null;

  const choose = (type: QuestionType) => {
    const v = items.trim();
    if (v === "") { setPending(type); onSelect(type, null, points); return; }
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 200) {
      setItemsError("Enter a whole number from 1 to 200, or leave it blank.");
      return;
    }
    setPending(type);
    onSelect(type, n, points);
  };

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
    onDeclareParts(parsed, points);
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

  const btn = (bg: string, fg: string, border: string, type?: QuestionType | "parts"): React.CSSProperties => ({
    padding: "0.75rem 1rem", background: bg, color: fg, border: `1px solid ${border}`,
    borderRadius: "var(--radius-sm)", fontWeight: 600,
    display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
    cursor: loading ? "not-allowed" : "pointer",
    opacity: loading ? (type && pending === type ? 1 : 0.45) : 1,
    transition: "opacity .15s",
  });

  const label = (type: QuestionType | "parts", text: string) =>
    loading && pending === type
      ? <><span className="spinner" aria-hidden="true" /> Generating…</>
      : text;

  const fieldStyle: React.CSSProperties = {
    padding: "0.45rem 0.5rem", border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)", fontSize: "0.85rem", width: "100%",
  };

  const fieldLabel: React.CSSProperties = {
    display: "block", fontSize: "0.85rem", fontWeight: 600,
    color: "var(--navy)", marginBottom: "0.35rem",
  };

  /** NEW 2026-11-20 — Alex's two new lines. Rendered in both modes so the
   *  page is priced whichever way its key is generated. */
  const pointsRows = (
    <>
      <label htmlFor="qt-points" style={fieldLabel}>
        1 item equivalent to how many points
      </label>
      <select id="qt-points" value={points} disabled={loading}
        onChange={e => setPoints(Number(e.target.value))}
        aria-describedby="qt-points-help"
        style={{ ...fieldStyle, padding: "0.6rem 0.75rem", marginBottom: "0.35rem" }}>
        {POINTS_CHOICES.map(n => (
          <option key={n} value={n}>{n} {n === 1 ? "point" : "points"} each</option>
        ))}
      </select>
      <p id="qt-points-help" style={{ fontSize: "0.78rem", marginBottom: "1rem", color: "var(--text-muted)" }}>
        Used to work out each student&rsquo;s total score, not just the number of
        items they got right.
      </p>

      <label htmlFor="qt-total" style={fieldLabel}>
        Total Points on this page <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(computed)</span>
      </label>
      <input id="qt-total" type="text" readOnly disabled tabIndex={-1}
        value={computedTotal === null ? "—" : String(computedTotal)}
        aria-describedby="qt-total-help"
        style={{ ...fieldStyle, padding: "0.6rem 0.75rem", marginBottom: "0.35rem",
                 background: "var(--muted-bg, #f9fafb)", fontWeight: 600,
                 color: "var(--navy)", cursor: "default" }} />
      <p id="qt-total-help" style={{ fontSize: "0.78rem", marginBottom: "1.25rem", color: "var(--text-muted)" }}>
        {computedTotal === null
          ? (mode === "page"
              ? "Fill in the number of items above to see the total."
              : "Complete the item ranges below to see the total.")
          : `${countedItems} item${countedItems === 1 ? "" : "s"} × ${points} point${points === 1 ? "" : "s"}. The server works this out again from the key it generates.`}
      </p>
    </>
  );

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="qt-title"
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex",
        alignItems: "center", justifyContent: "center", zIndex: 9999 }}
      onClick={loading ? undefined : onClose}>
      <div style={{ background: "white", borderRadius: "var(--radius-md)", padding: "2rem",
        maxWidth: mode === "parts" ? 640 : 420,
        width: "calc(100% - 32px)", maxHeight: "calc(100vh - 64px)", overflowY: "auto",
        boxShadow: "var(--shadow-lg)" }} onClick={e => e.stopPropagation()}>
        <h2 id="qt-title" style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "1rem", color: "var(--navy)" }}>
          Generate Answer Key{pageNumber ? ` — Page ${pageNumber}` : ""}
        </h2>

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
            <p style={{ color: "var(--text-muted)", marginBottom: "1rem", fontSize: "0.9rem" }}>
              This page is read for both encircled Multiple Choice answers and written True/False answers. Enter how many items the page has so stray marks are not mistaken for answers.
            </p>

            <label htmlFor="qt-items" style={fieldLabel}>
              Number of items on this page <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(optional, recommended)</span>
            </label>
            <input id="qt-items" type="number" inputMode="numeric" min={1} max={200} placeholder="e.g. 12"
              value={items} disabled={loading}
              onChange={e => { setItems(e.target.value); setItemsError(null); }}
              aria-invalid={!!itemsError} aria-describedby="qt-items-help"
              style={{ width: "100%", padding: "0.6rem 0.75rem", border: `1px solid ${itemsError ? "var(--error, #dc2626)" : "var(--border)"}`,
                borderRadius: "var(--radius-sm)", marginBottom: "0.35rem" }} />
            <p id="qt-items-help" style={{ fontSize: "0.78rem", marginBottom: "1rem",
              color: itemsError ? "var(--error, #dc2626)" : "var(--text-muted)" }}>
              {itemsError ?? "If filled in, exactly this many answers are kept, so stray marks are not added to the key."}
            </p>

            {/* NEW 2026-11-20 — Alex page 12: "Insert the 2 New Lines after of
                'Number of items on this page' line." */}
            {pointsRows}

            <div style={{ display: "flex", gap: "0.75rem", flexDirection: "column" }}>
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
                fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", marginBottom: "1rem" }}>
              + Add another part
            </button>

            {/* NEW 2026-11-20 — the same two lines. A page priced here is a
                page priced there; the item count comes from the ranges. */}
            {pointsRows}

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