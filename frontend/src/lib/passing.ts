/**
 * lib/passing.ts
 * ==============
 * NEW 2026-11-23 — Ms. Melanie, Recommendations page 18, requirement 6:
 *
 *   "Under Student Records:
 *      Item # 1: Adjust Columns
 *      Item # 2: Insert 'Passing Score' Info
 *      Item # 3: Indicate Percentage (%) of the Score"
 *
 * WHERE THE PASSING MARK COMES FROM. Nowhere — and that is the point of this
 * file. No exam, paper or class list row stores a passing mark; the only place
 * one exists today is the Data Analytics screen, where the teacher types a
 * percentage into a box and the page shows "Passing mark [60] % = 39 / 65".
 * Student Record now needs the same number, so the arithmetic lives here and
 * both screens call it. The alternative — a second copy of `* mark / 100`
 * inside the record page — is two formulas that agree today and disagree the
 * first time one of them is rounded differently, in front of a panel that can
 * put the two screens side by side.
 *
 * WHY NOT A COLUMN IN THE DATABASE. A stored passing mark is the right answer
 * and it is not a ten-days-before-defence answer: it needs a migration, a
 * field on Create Exam, a backfill decision for every existing exam, and it
 * changes a schema two screens read. The teacher typing 60 once per visit is
 * what the system does now on Analytics and it is what Melanie saw and
 * accepted there, so Student Record matches it rather than inventing a second
 * behaviour.
 *
 * PERCENTAGE ROUNDING is `round(part / whole * 100, 1)`, which is what
 * `scoring._pct` in the backend does, so the number here and the number on a
 * checked paper's result agree. One caveat, written down rather than
 * discovered later: Python's round() breaks an exact .05 tie to even and
 * JavaScript's Math.round breaks it upward, so a score whose percentage lands
 * exactly on a half-tenth (121 of 2000, say) can differ in the last digit.
 * Exam totals here are two and three digits, where such a tie cannot occur.
 */

/** What the Data Analytics box starts at, and what this page starts at. */
export const DEFAULT_PASSING_MARK = 60;

/** A typed percentage, kept inside 1–100 and whole.
 *
 *  NaN becomes the default rather than 0: an empty box mid-typing should not
 *  silently mean "everything passes".
 *
 *  The floor is 1, not 0, because that is the floor the Data Analytics box
 *  has had since 11 November (`min={1}`, `Math.max(1, …)`). A passing mark of
 *  0% is not a mark; it is a screen on which nobody can fail. */
export function clampMark(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_PASSING_MARK;
  return Math.min(100, Math.max(1, Math.round(n)));
}

/** The denominator for one exam row.
 *
 *  `total_points` is the weighted total added 2026-11-20 and is 0 on exams
 *  saved before per-item points existed; 0 means "fall back to item count",
 *  which is the same rule `scoreOf` in the record page already uses. */
export function outOf(r: { total_points?: number | null; total_items?: number | null }): number {
  const pts = r.total_points ?? 0;
  if (pts > 0) return pts;
  return r.total_items ?? 0;
}

/** The mark expressed in points for one exam: 60% of 65 is 39.
 *
 *  CORRECTED 2026-11-23, same day, before this shipped anywhere. This was
 *  `Math.round`, and Data Analytics — on screen since 11 November, seen by
 *  Doc Rubrica and by Ms. Melanie — has always used `Math.ceil`. They agree
 *  on 60% of 65 and on 75% of 65, which is exactly why the difference would
 *  not have shown up in testing; they disagree whenever the fraction is below
 *  a half. 60% of 17 is 10.2: ceil says the mark is 11, round says 10, and
 *  the same student would have been passing on one screen and failing on the
 *  other. CEIL WINS because it is the behaviour already accepted, and because
 *  it is the defensible one: the mark never drifts BELOW the percentage the
 *  teacher typed.
 *
 *  Returns 0 when the exam has no total yet, and the caller shows a dash
 *  rather than "0". */
export function passingScore(out_of: number, mark: number): number {
  if (out_of <= 0) return 0;
  return Math.ceil((out_of * clampMark(mark)) / 100);
}

/** round(part / whole * 100, 1) — the backend's `_pct`. */
export function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

/** "81.5%" with the one decimal always shown, so a column of them lines up. */
export function pctLabel(part: number, whole: number): string {
  if (whole <= 0) return "—";
  return `${pct(part, whole).toFixed(1)}%`;
}