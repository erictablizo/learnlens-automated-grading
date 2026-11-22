"use client";
/**
 * CHANGED 2026-10-22 — Doc Rubrica, third comment: the first two buttons were
 * removed; "Mixed — both on one page" and Cancel remain. Every page is now
 * generated as `mixed`.
 *
 * CHANGED 2026-10-24 — Doc Rubrica, sixth comment: a second mode that lets the
 * teacher DECLARE THE ITEM RANGES. `onDeclareParts` is OPTIONAL, so a parent
 * that does not pass it gets the old dialog exactly.
 *
 * CHANGED 2026-11-17 — "Number of items on this page" is REQUIRED. This is the
 * fix for the two complaints in the project instructions: "Answer Key Displays
 * 16 Answer in the System but Page 6 ... shows that is only has 12 Answers",
 * and "107 Answer ... only has 20". Every gate this project built to keep a
 * stray mark out of the key is switched OFF when that field is blank —
 * limit_to_expected is a no-op, the 2026-10-05 stray-items drop needs
 * bool(expected_items), and the 2026-11-01 phantom-tail _room() guard returns
 * True when the count is absent. The field was blank on every open, so the
 * ordinary Generate click sent expected_items = null and switched off all
 * three. Measured 5 Oct on the thesis p.6 sheet with the field blank: 14
 * answers on a 12-item page, no warning.
 *
 * CHANGED 2026-11-20 — Sir Alex Passion, Recommendations page 12: one
 * page-level "1 item equivalent to how many points" dropdown.
 *
 * CHANGED 2026-11-21 — Sir Alex Passion, Recommendations page 13, which
 * REPLACES page 12's dropdown:
 *
 *     "Remove this line  1 item equivalent to how many points = Drop-down List
 *      Instead add the following lines:
 *        Range of item number from ____ to ____ 1 item equivalents to (1-10)
 *        Range of item number from ____ to ____ 1 item equivalents to (1-10)
 *        Range of item number from ____ to ____ 1 item equivalents to (1-10)"
 *     "Insert the 3 New Lines after of 'Number of items on this page' line."
 *
 * MERGED 2026-11-22 — the 2026-11-21 page-13 file and the 2026-11-17
 * items-required change were written from the SAME September baseline, in two
 * different sessions, and neither contains the other. Installing the page-13
 * file over a live tree would have silently reverted all five items-required
 * edits, and apply_2026-11-17_items_required.py cannot be re-run afterwards:
 * its required EDIT 2 anchors on the pre-page-13 blank-field line, which
 * page 13 had already rewritten to carry the encoded ranges. No candidate
 * matches, the edit is required, so the patcher refuses all-or-nothing and
 * writes nothing — while its other four edits WOULD have landed, which is
 * what makes the failure quiet. This file is the two changes in one. See
 * MODAL-MERGE-2026-11-22.md.
 *
 * CHANGED 2026-11-22 — Sir Alex Passion, Recommendations page 14,
 * requirement 2, against a screenshot of the DEPLOYED (pre-merge) dialog:
 *
 *   "Please update the gray color (encircled in RED color) to light brown
 *    color to distinguish it from input color (black)."
 *   "Underlined in BLUE color, please update as required not optional in
 *    'Number of items on this page' and 'Points per item, by range' fields."
 *
 * The first of the two blue underlines was ALREADY done by the 2026-11-17
 * merge above — his screenshot predates it. What page 14 actually adds here
 * is the placeholder colour and the ranges becoming required.
 *
 * WHY A <style> TAG IN A FILE THAT IS OTHERWISE ALL INLINE STYLES. ::placeholder
 * is a pseudo-element and the style prop cannot reach it. The alternative is a
 * rule in globals.css, which would colour every placeholder in the app from a
 * file nobody editing this dialog would think to open. One scoped block, next
 * to the thing it colours.
 *
 * WHAT "REQUIRED" COSTS. A page where every item is worth the same now needs
 * one line typed — "1 to 15 at 1 pt" — where before it needed nothing. That
 * is the point: the price is stated rather than inherited. It costs nothing in
 * correctness, because a band of all-1s produces byte-identical scoring to no
 * band at all (asserted in measure/2026-11-21_point_ranges.py, "control: bands
 * of 1 change nothing").
 *
 * Four things about how the page-13 pricing was built:
 *
 * AN ITEM NO RANGE COVERS IS WORTH 1. With the page-level dropdown gone there
 * is no field left that could say otherwise, and the column default
 * (points smallint not null default 1) already says it. A teacher who fills
 * in no range at all generates exactly the key generated today — which is the
 * control the backend bench checks over nine page sizes.
 *
 * THE NUMBERS ARE THE ONES PRINTED ON THE PAPER. `answer_keys.question_number`
 * runs 1..N across the whole exam (renumber_answer_keys keeps it that way), so
 * "from 21 to 25" on page 2 means items 21 to 25 as the student reads them,
 * not the 1st to 5th item of that page.
 *
 * THE COMPUTED TOTAL IS READ-ONLY AND NOT SENT. The server works it out again
 * from the rows it actually created (app/ml/scoring.page_total_with_ranges).
 * A number the browser produced is not a number the database should trust;
 * this field exists so the teacher sees the consequence before pressing the
 * button.
 *
 * RANGES MAY NOT OVERLAP, AND MAY NOT COVER MORE ITEMS THAN THE PAGE HAS.
 * Two prices for one item has no answer, and a range running past the end of
 * the page is nearly always a typed digit. Both are refused here with a
 * sentence, and refused again in parse_point_ranges on the server.
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

/** NEW 2026-11-21 — Alex page 13. Three lines, 1 to 10 points each.
 *  Mirrored by MAX_RANGES / MIN_POINTS / MAX_POINTS in app/ml/scoring.py and
 *  by ck_answer_keys_points_range in the database. Three statements of one
 *  rule, because it is a rule about marks. */
const POINTS_CHOICES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const RANGE_ROWS = 3;
const DEFAULT_POINTS = 1;
const MAX_ITEM_NUMBER = 500;

/** NEW 2026-11-22 — Alex page 14: placeholders in light brown, so a hint is
 *  never mistaken for a typed value. Measured 4.65:1 on white, which clears
 *  WCAG AA for normal text (my first pick, #A1724A, measured 4.18 and did
 *  not — a placeholder a teacher cannot read is worse than a grey one).
 *  `opacity: 1` is not decoration: Firefox dims placeholders by default and
 *  would wash the brown back out. */
const PLACEHOLDER_BROWN = "#9A6A42";

/** One of Alex's three lines while it is being typed. */
export interface PriceDraft {
  first: string;
  last: string;
  points: number;
}

const emptyPrice = (): PriceDraft => ({ first: "", last: "", points: DEFAULT_POINTS });

export interface ParsedRange {
  row: number;        // 1-based, so an error names the line the teacher sees
  first: number;
  last: number;
  points: number;
}

/** Read the three lines. Returns a sentence instead of ranges when one of
 *  them cannot be honoured. `itemCount` is checked only when it is known.
 *
 *  CHANGED 2026-11-22: in page mode the count is now always known by the time
 *  this is called from choose(), because the count is validated first. The
 *  null branch is still reached from parts mode, where the count comes from
 *  the declared parts and may be incomplete while the teacher types. */
export function readRanges(
  rows: PriceDraft[],
  itemCount: number | null,
  opts: { requireOne?: boolean } = {},
): { ranges: ParsedRange[]; error: string | null } {
  const parsed: ParsedRange[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const a = r.first.trim();
    const b = r.last.trim();
    if (a === "" && b === "") continue;              // an untouched line
    if (a === "" || b === "") {
      return { ranges: [], error: `Range ${i + 1}: fill in both item numbers, or clear the line.` };
    }
    const first = Number(a);
    const last = Number(b);
    if (!Number.isInteger(first) || !Number.isInteger(last) ||
        first < 1 || last < 1 || first > MAX_ITEM_NUMBER || last > MAX_ITEM_NUMBER) {
      return { ranges: [], error: `Range ${i + 1}: item numbers must be whole numbers from 1 to ${MAX_ITEM_NUMBER}.` };
    }
    if (last < first) {
      return { ranges: [], error: `Range ${i + 1}: the last item (${last}) comes before the first (${first}).` };
    }
    parsed.push({ row: i + 1, first, last, points: r.points });
  }

  const sorted = [...parsed].sort((x, y) => x.first - y.first);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].first <= sorted[i - 1].last) {
      return {
        ranges: [],
        error:
          `Items ${sorted[i].first}-${sorted[i].last} overlap items ` +
          `${sorted[i - 1].first}-${sorted[i - 1].last}. Each item can only be worth one amount.`,
      };
    }
  }

  if (itemCount !== null) {
    const covered = sorted.reduce((n, r) => n + (r.last - r.first + 1), 0);
    if (covered > itemCount) {
      return {
        ranges: [],
        error: `The ranges cover ${covered} items but this page has ${itemCount}. Check the item numbers.`,
      };
    }
  }

  // NEW 2026-11-22 — Alex page 14: the field is required. Checked LAST, after
  // every shape check, so a teacher who typed one line badly is told what is
  // wrong with that line rather than being told to fill in a line she filled
  // in. The live preview calls this without the flag, so typing is never an
  // error wall; only the submit handlers require it.
  if (opts.requireOne && sorted.length === 0) {
    return {
      ranges: [],
      error: itemCount !== null
        ? `Price the items before generating. If every item is worth the same, use one line: 1 to ${itemCount} at 1 pt.`
        : "Price the items before generating. Fill in at least one range.",
    };
  }

  return { ranges: sorted, error: null };
}

/** The wire form the backend's parse_point_ranges reads: first-last:points. */
export const encodeRanges = (ranges: ParsedRange[]): string[] =>
  ranges.map(r => `${r.first}-${r.last}:${r.points}`);

interface QuestionTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** FIX 2026-09-22: 2nd argument = "Number of items on this page".
   *  CHANGED 2026-11-17: it is REQUIRED in page mode, so this is never null
   *  from the Mixed button any more. The signature keeps `| null` because the
   *  parts path and older callers still type it that way.
   *  CHANGED 2026-11-21: 3rd argument is now the priced RANGES, as
   *  ["1-20:1", "21-25:5"]. It replaces page 12's single pointsPerItem number.
   *  An empty array prices nothing and every item stays at 1. */
  onSelect: (type: QuestionType, expectedItems: number | null, pointRanges?: string[]) => void;
  /** NEW 2026-10-24 — OPTIONAL. Omit it and the parts UI never appears. */
  onDeclareParts?: (parts: PagePartInput[], pointRanges?: string[]) => void;
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

  // CHANGED 2026-11-21 — three lines instead of one dropdown.
  const [prices, setPrices] = useState<PriceDraft[]>(
    () => Array.from({ length: RANGE_ROWS }, emptyPrice));
  const [priceError, setPriceError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setItems(""); setItemsError(null); setPending(null);
      setMode("page"); setDrafts([emptyDraft("1")]); setPartsError(null);
      setPrices(Array.from({ length: RANGE_ROWS }, emptyPrice));
      setPriceError(null);
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

  /** Live, for the computed field. Errors are shown but do not block typing —
   *  the submit handlers re-read the rows and refuse there. */
  const live = readRanges(prices, itemsKnown ? countedItems : null);
  const covered = live.ranges.reduce((n, r) => n + (r.last - r.first + 1), 0);
  const priced  = live.ranges.reduce((n, r) => n + (r.last - r.first + 1) * r.points, 0);
  const computedTotal =
    live.error !== null ? null
    : itemsKnown ? priced + Math.max(0, countedItems - covered) * DEFAULT_POINTS
    : live.ranges.length > 0 ? priced
    : null;

  const setPrice = (i: number, patch: Partial<PriceDraft>) => {
    setPrices(prices.map((p, k) => (k === i ? { ...p, ...patch } : p)));
    setPriceError(null);
  };

  const choose = (type: QuestionType) => {
    // CHANGED 2026-11-17. Previously a blank field called onSelect with a
    // null item count and generated anyway. A null count switches off every
    // gate that keeps a stray mark out of the answer key, and the field is
    // blank on every open — so that one line WAS the "16 vs 12" and
    // "107 vs 20" complaint, on the ordinary click.
    //
    // The old line is deliberately NOT quoted here: this project's tools grep
    // for it to decide whether the fix is in place.
    //
    // CHANGED 2026-11-22 (merge): the count is read and validated BEFORE the
    // ranges, where page 13 read the ranges first. Two reasons. The count is
    // now the required field, so its message is the one the teacher must see
    // first; and readRanges' coverage check is skipped when the count is
    // unknown, so validating the count first means "the ranges cover 25 items
    // but this page has 12" is now always checked rather than only sometimes.
    const v = items.trim();
    if (v === "") {
      setItemsError("Type the number of items on this page first — this is what keeps stray marks out of the key.");
      return;
    }
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 200) {
      setItemsError("Enter a whole number from 1 to 200.");
      return;
    }

    const { ranges, error } = readRanges(prices, n, { requireOne: true });
    if (error) { setPriceError(error); return; }

    setPending(type);
    onSelect(type, n, encodeRanges(ranges));
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

    const { ranges, error } = readRanges(prices, itemsKnown ? countedItems : null,
                                        { requireOne: true });
    if (error) { setPriceError(error); return; }

    setPartsError(null);
    setPending("parts");
    onDeclareParts(parsed, encodeRanges(ranges));
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

  const smallLabel: React.CSSProperties = {
    display: "block", fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "0.2rem",
  };

  /** NEW 2026-11-21 — Alex's three lines, plus the computed total.
   *  Rendered in both modes, so a page is priced whichever way its key is
   *  generated. */
  const pointsRows = (
    <>
      <span style={fieldLabel}>
        Points per item, by range{" "}
        {/* CHANGED 2026-11-22 — Alex page 14. Same red (required) as the item
            count above it, because they are now the same kind of field. */}
        <span style={{ fontWeight: 400, color: "var(--error, #dc2626)" }}>(required)</span>
      </span>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "0.35rem" }}>
        {prices.map((p, i) => (
          <div key={i}
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.3fr", gap: "0.4rem", alignItems: "end" }}>
            <div>
              <label htmlFor={`pr-first-${i}`} style={smallLabel}>
                {i === 0 ? "Item from" : <>&nbsp;</>}
              </label>
              <input id={`pr-first-${i}`} type="number" inputMode="numeric" min={1} max={MAX_ITEM_NUMBER}
                value={p.first} disabled={loading} placeholder={i === 0 ? "1" : ""}
                aria-label={`Range ${i + 1}, first item number`}
                onChange={e => setPrice(i, { first: e.target.value })} style={fieldStyle} />
            </div>
            <div>
              <label htmlFor={`pr-last-${i}`} style={smallLabel}>
                {i === 0 ? "to" : <>&nbsp;</>}
              </label>
              <input id={`pr-last-${i}`} type="number" inputMode="numeric" min={1} max={MAX_ITEM_NUMBER}
                value={p.last} disabled={loading} placeholder={i === 0 ? "20" : ""}
                aria-label={`Range ${i + 1}, last item number`}
                onChange={e => setPrice(i, { last: e.target.value })} style={fieldStyle} />
            </div>
            <div>
              <label htmlFor={`pr-pts-${i}`} style={smallLabel}>
                {i === 0 ? "1 item equivalents to" : <>&nbsp;</>}
              </label>
              <select id={`pr-pts-${i}`} value={p.points} disabled={loading}
                aria-label={`Range ${i + 1}, points per item`}
                onChange={e => setPrice(i, { points: Number(e.target.value) })}
                style={fieldStyle}>
                {POINTS_CHOICES.map(n => (
                  <option key={n} value={n}>{n} {n === 1 ? "pt" : "pts"}</option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>

      <p id="qt-points-help" style={{ fontSize: "0.78rem", marginBottom: "1rem",
        color: (priceError ?? live.error) ? "var(--error, #dc2626)" : "var(--text-muted)" }}>
        {priceError ?? live.error ??
          "Use the item numbers printed on the paper. Fill in at least one line — if every item is worth the same, one line covering them all is enough. Any item you do not list is worth 1 point."}
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
          : itemsKnown
            ? `${covered} item${covered === 1 ? "" : "s"} priced` +
              (countedItems > covered ? `, ${countedItems - covered} at 1 point` : "") +
              ". The server works this out again from the key it generates."
            : `${covered} priced item${covered === 1 ? "" : "s"}. Fill in the number of items above to include the rest.`}
      </p>
    </>
  );

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="qt-title"
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex",
        alignItems: "center", justifyContent: "center", zIndex: 9999 }}
      onClick={loading ? undefined : onClose}>
      <div className="qt-modal" style={{ background: "white", borderRadius: "var(--radius-md)", padding: "2rem",
        maxWidth: mode === "parts" ? 640 : 480,
        width: "calc(100% - 32px)", maxHeight: "calc(100vh - 64px)", overflowY: "auto",
        boxShadow: "var(--shadow-lg)" }} onClick={e => e.stopPropagation()}>
        {/* NEW 2026-11-22 — Alex page 14. Scoped to .qt-modal so it cannot
            reach any other dialog in the app. */}
        <style>{`
          .qt-modal input::placeholder { color: ${PLACEHOLDER_BROWN}; opacity: 1; }
        `}</style>
        <h2 id="qt-title" style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "1rem", color: "var(--navy)" }}>
          Generate Answer Key{pageNumber ? ` — Page ${pageNumber}` : ""}
        </h2>

        {onDeclareParts && (
          <div role="tablist" aria-label="How to read this page"
            style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
            {([["page", "One page, one way"], ["parts", "Declare item ranges"]] as const).map(([m, text]) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} disabled={loading}
                onClick={() => { setMode(m); setItemsError(null); setPartsError(null); setPriceError(null); }}
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
              Number of items on this page <span style={{ fontWeight: 400, color: "var(--error, #dc2626)" }}>(required)</span>
            </label>
            <input id="qt-items" type="number" inputMode="numeric" min={1} max={200} placeholder="e.g. 12"
              value={items} disabled={loading}
              onChange={e => { setItems(e.target.value); setItemsError(null); }}
              aria-required="true" aria-invalid={!!itemsError} aria-describedby="qt-items-help"
              style={{ width: "100%", padding: "0.6rem 0.75rem", border: `1px solid ${itemsError ? "var(--error, #dc2626)" : "var(--border)"}`,
                borderRadius: "var(--radius-sm)", marginBottom: "0.35rem" }} />
            <p id="qt-items-help" style={{ fontSize: "0.78rem", marginBottom: "1rem",
              color: itemsError ? "var(--error, #dc2626)" : "var(--text-muted)" }}>
              {itemsError ?? "Exactly this many answers are kept, so stray marks are not added to the key. Count only the items printed on THIS page."}
            </p>

            {/* NEW 2026-11-21 — Alex page 13: "Insert the 3 New Lines after of
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
                      <label htmlFor={`p-first-${i}`} style={smallLabel}>First item</label>
                      <input id={`p-first-${i}`} type="number" inputMode="numeric" min={1} max={500}
                        value={d.first} disabled={loading} placeholder="13"
                        onChange={e => setDraft(i, { first: e.target.value })} style={fieldStyle} />
                    </div>
                    <div>
                      <label htmlFor={`p-last-${i}`} style={smallLabel}>Last item</label>
                      <input id={`p-last-${i}`} type="number" inputMode="numeric" min={1} max={500}
                        value={d.last} disabled={loading} placeholder="18"
                        onChange={e => setDraft(i, { last: e.target.value })} style={fieldStyle} />
                    </div>
                  </div>
                  <label htmlFor={`p-type-${i}`} style={smallLabel}>How is it answered?</label>
                  <select id={`p-type-${i}`} value={d.type} disabled={loading}
                    onChange={e => setDraft(i, { type: e.target.value as PartQuestionType })}
                    style={{ ...fieldStyle, marginBottom: d.type === "written_letter" ? "0.5rem" : 0 }}>
                    {PART_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label} — {t.hint}</option>
                    ))}
                  </select>
                  {d.type === "written_letter" && (
                    <>
                      <label htmlFor={`p-letters-${i}`} style={smallLabel}>Choices used by this part</label>
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

            {/* NEW 2026-11-21 — the same three lines. A page priced here is a
                page priced there; the item count comes from the parts. */}
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