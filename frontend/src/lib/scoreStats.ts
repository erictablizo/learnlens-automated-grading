/**
 * lib/scoreStats.ts
 * =================
 * NEW 2026-11-23 — Ms. Melanie, Recommendations page 18, requirement 9,
 * verbatim:
 *
 *   "Insert 'Mean, Median and Mode' before the highest score table.
 *      Statistics (Measure) | Value
 *      Mean                 |
 *      Median               |
 *      Mode                 |"
 *
 * THE TYPESCRIPT TWIN OF `backend/app/ml/statistics.py`, line for line, and
 * measure/2026-11-23_stats_twins.mjs runs both on the same fixtures and fails
 * if they ever disagree.
 *
 * WHY THIS IS COMPUTED IN THE BROWSER AND NOT FETCHED
 * ---------------------------------------------------
 * Data Analytics already holds every paper for the exam — it has to, because
 * the four category tables below this one are built from them. The three
 * statistics are of THE SAME SET OF STUDENTS as those tables. Computing them
 * here, from the same `final` array, makes that agreement structural: there
 * is no second query that could select a slightly different set, no endpoint
 * that could lag a deploy, and nothing to deploy on the backend at all.
 *
 * An endpoint would have to re-derive "which papers count" — checked only,
 * under-review papers excluded — and the moment those two derivations differ,
 * the Mean sits directly above a table of students it does not describe.
 *
 * `app/ml/statistics.py` is kept: it is where this belongs the day the Excel
 * export or a printed report needs the same three numbers without a browser.
 * It is not on the path for this screen.
 *
 * ROUNDING IS PYTHON'S, DELIBERATELY. `round(x, 1)` in Python breaks an exact
 * tie to the EVEN digit; JavaScript's Math.round breaks it upward. A mean of
 * 48.25 is 48.2 in Python and would be 48.3 under Math.round. Both numbers
 * can appear on the same screen — the percentages on this page come from
 * `scoring._pct`, which is Python's round — so this file implements Python's
 * rule rather than JavaScript's. See round1 below.
 */

export interface ScoreStats {
  count:  number;
  mean:   number | null;
  median: number | null;
  /** Empty means there is NO most-common score, which the screen shows as a
   *  dash. More than one entry is a genuine tie and all of them are shown. */
  mode:   number[];
  outOf:  number | null;
}

/**
 * round(x, 1) the way Python does it: half to EVEN, not half up.
 *
 * Math.round(482.5) is 483 and Python's round(48.25, 1) is 48.2. The scores
 * on this screen are integers, so x * 10 is exact for every tie that can
 * actually occur here (a tie needs 20 * sum / n to be an odd integer, and
 * such a value is exactly representable as a double).
 */
export function round1(x: number): number {
  const scaled = x * 10;
  const low = Math.floor(scaled);
  const diff = scaled - low;
  if (diff > 0.5) return (low + 1) / 10;
  if (diff < 0.5) return low / 10;
  return (low % 2 === 0 ? low : low + 1) / 10;
}

/** 48 -> "48", 48.3 -> "48.3". A score of 48 must not read "48.0" beside a
 *  table that prints "48 / 65". */
export function trim(v: number): string {
  return Number.isInteger(v) ? String(v) : String(round1(v));
}

/** Numbers only. A null score — a paper never checked — is not a zero; it is
 *  a student who has no score yet, and averaging it as 0 would be a claim
 *  about their work. Dropped, not defaulted. */
function clean(values: ReadonlyArray<unknown>): number[] {
  const out: number[] = [];
  for (const v of values) {
    if (v === null || v === undefined || typeof v === "boolean") continue;
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

export function summariseScores(
  values: ReadonlyArray<unknown>,
  outOf: number | null = null,
): ScoreStats {
  const xs = clean(values).sort((a, b) => a - b);
  if (xs.length === 0) return { count: 0, mean: null, median: null, mode: [], outOf };

  const n = xs.length;
  const mean = round1(xs.reduce((a, b) => a + b, 0) / n);

  const mid = Math.floor(n / 2);
  const median = round1(n % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2);

  const counts = new Map<number, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  const topCount = Math.max(...counts.values());
  // No mode when every score is distinct — but a class of ONE has a mode, and
  // it is that student's score. The n === 1 guard tells those cases apart.
  const mode = (topCount > 1 || n === 1)
    ? [...counts.entries()].filter(([, c]) => c === topCount)
                           .map(([v]) => v).sort((a, b) => a - b)
    : [];

  return { count: n, mean, median, mode, outOf };
}

/** The Mode cell. Several modes are joined, because several is the truth. */
export function modeText(s: ScoreStats, blank = "—"): string {
  return s.mode.length === 0 ? blank : s.mode.map(trim).join(", ");
}

/** Her three rows, in her order. Built here rather than in the component so
 *  the labels and the values cannot drift apart, and so the dash for a
 *  missing value is decided once. */
export function asRows(s: ScoreStats, blank = "—"): { measure: string; value: string }[] {
  const num = (v: number | null) => (v === null ? blank : trim(v));
  return [
    { measure: "Mean",   value: num(s.mean) },
    { measure: "Median", value: num(s.median) },
    { measure: "Mode",   value: modeText(s, blank) },
  ];
}