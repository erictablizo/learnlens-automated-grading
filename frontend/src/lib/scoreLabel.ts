/**
 * lib/scoreLabel.ts
 * =================
 * NEW 2026-11-11 — "score as X/Y" (Alex Passion / Julius Bancud).
 *
 * ONE function decides how a score is written, everywhere. The reason is
 * measured, not stylistic: a paper with items still under review has a score
 * that is a FLOOR, not a result, and writing it as a plain "11 / 19" states
 * something false about the student.
 *
 * From the 2026-10-24 full-path run, a real paper:
 *
 *     score 11-15 of 19, review=4, is_final=False
 *
 * The student has AT LEAST 11 and AT MOST 15. `GradeResponse` has carried
 * `max_possible`, `needs_review` and `is_final` since that day precisely so
 * the screen can say so — and the backend's own comment records what happened
 * when it could not:
 *
 *     "The browser then sees '11 of 19' for a paper whose true score is 15,
 *      with nothing to say four items are pending."
 *
 * Pure functions, no React, no network: this file is unit-testable and is
 * tested (measure/2026-11-11_score_label.mjs, 29 cases).
 */
import type { GradeResult, Paper, PaperScore } from "@/types/paper";

export const VERDICT_CORRECT = "correct";
export const VERDICT_REVIEW = "review";

/** The three numbers every score display needs, plus whether it is settled. */
export interface ScoreParts {
  /** Items definitely right. The FLOOR of the student's score. */
  correct: number;
  /** correct + needsReview. The CEILING. */
  maxPossible: number;
  needsReview: number;
  totalItems: number;
  /** Nothing left under review, so correct === maxPossible and the score is a result. */
  isFinal: boolean;
}

/**
 * Derive the parts from the per-item rows the paper viewer already holds.
 *
 * THE `verdict === ""` CASE IS NOT HYPOTHETICAL. `PaperScoreResponse` in
 * schemas/paper.py declares `verdict: str = ""` and its comment says why:
 * "Defaults to '' so a response built from a row written before the migration
 * still validates instead of 500-ing." So an empty verdict means "this row
 * predates the three-state grader", NOT "wrong". Falling back to `is_correct`
 * for those rows is what keeps a pre-October paper scoring the same as it
 * always did. Treating "" as wrong would silently zero them.
 */
export function scoreFromItems(scores: readonly PaperScore[]): ScoreParts {
  let correct = 0;
  let needsReview = 0;
  for (const s of scores) {
    if (s.verdict === VERDICT_REVIEW) {
      needsReview += 1;
    } else if (s.verdict ? s.verdict === VERDICT_CORRECT : s.is_correct) {
      correct += 1;
    }
  }
  return {
    correct,
    maxPossible: correct + needsReview,
    needsReview,
    totalItems: scores.length,
    isFinal: needsReview === 0,
  };
}

/**
 * The same parts, straight off a grade / re-grade response.
 *
 * `GradeResult` has carried `max_possible`, `needs_review` and `is_final`
 * since the 2026-11-04 types fix (they were arriving in every response and
 * were invisible to TypeScript before that). If this line fails to compile,
 * types/paper.ts is the OLD copy and needs that fix first - a loud failure,
 * which is the point.
 */
export function scoreFromGrade(r: GradeResult): ScoreParts {
  return {
    correct: r.correct,
    maxPossible: r.max_possible,
    needsReview: r.needs_review,
    totalItems: r.total_items,
    isFinal: r.is_final,
  };
}

/**
 * The X/Y label.
 *
 *   settled        "15 / 19"
 *   under review   "11–15 of 19"     <- en dash, a RANGE, not a subtraction
 *   not checked    "—"
 *
 * "of" rather than "/" in the range deliberately: "11–15 / 19" reads as though
 * the whole range were divided by 19.
 */
export function formatScore(p: ScoreParts): string {
  if (p.totalItems <= 0) return "—";
  if (p.isFinal) return `${p.correct} / ${p.totalItems}`;
  return `${p.correct}–${p.maxPossible} of ${p.totalItems}`;
}

/**
 * The sentence that goes under the number, or null when there is nothing to
 * explain. Never silently omitted when items are pending — a range with no
 * explanation is worse than no range.
 */
export function reviewNote(p: ScoreParts): string | null {
  if (p.isFinal || p.needsReview <= 0) return null;
  const n = p.needsReview;
  return `${n} item${n === 1 ? "" : "s"} still need${n === 1 ? "s" : ""} your review. ` +
    `This score is the lowest it can be, not the final one.`;
}

/**
 * Percent, but ONLY when the score is settled.
 *
 * Returning null for an unfinished paper is the point. A percentage computed
 * off a floor looks exact and is not, and a teacher reading "57.9%" has no way
 * to tell it from a real figure. One decimal place, matching
 * GradingResult.score_percent's `round(..., 1)`.
 */
export function formatPercent(p: ScoreParts): string | null {
  if (!p.isFinal || p.totalItems <= 0) return null;
  return `${Math.round((p.correct / p.totalItems) * 1000) / 10}%`;
}

export interface RowScore {
  /** Short enough for a table cell. */
  label: string;
  /** The full story, for a `title` attribute. Always present. */
  title: string;
}

/**
 * The papers TABLE has only `Paper` — no per-item rows, so no review count.
 * It knows `total_score` (the floor) and `checked`.
 *
 * `totalItems` is the exam's answer-key length, which the exam page already
 * has. Pass null when it is not known rather than guessing: "11" alone is
 * honest, "11 / 0" is not.
 *
 * An unchecked paper gets "11+ of 19" — the `+` carries "at least", and the
 * title spells it out for anyone who does not read it that way.
 */
export function formatRowScore(paper: Paper, totalItems: number | null): RowScore {
  const score = paper.total_score;
  if (score === null || score === undefined) {
    return { label: "—", title: "This paper has not been checked yet." };
  }
  if (totalItems === null || totalItems <= 0) {
    return paper.checked
      ? { label: String(score), title: `${score} correct.` }
      : {
          label: `${score}+`,
          title: `At least ${score} correct. Some items still need your review.`,
        };
  }
  return paper.checked
    ? { label: `${score} / ${totalItems}`, title: `${score} correct out of ${totalItems}.` }
    : {
        label: `${score}+ of ${totalItems}`,
        title:
          `At least ${score} correct out of ${totalItems}. ` +
          `Some items still need your review, so this is the lowest the score can be.`,
      };
}