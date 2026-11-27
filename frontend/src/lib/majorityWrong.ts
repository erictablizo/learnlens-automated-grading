/**
 * frontend/src/lib/majorityWrong.ts                              2026-11-27
 * ==========================================================================
 *
 * "Items incorrectly answered by the majority of the class" — the rule, in
 * one place, because as of today TWO things apply it.
 *
 *     Ms. Melanie, Recommendations page 23, requirement 1:
 *     "Please include also this info 'Items incorrectly answered by the
 *      majority of the class' ... to be included on this lowest portion
 *      (located after the 1 scored zero portion)."
 *
 * She means the generated Excel. The rule was written inside
 * analytics/page.tsx on 2026-11-15 and lived there alone; the export now
 * needs the same rows without a browser, so it moves here and gets a Python
 * twin at backend/app/ml/majority_wrong.py, held to it by
 * measure/2026-11-27_majority_twins.mjs.
 *
 * NOTHING ABOUT THE RULE CHANGED IN THE MOVE. The comments below are the
 * ones that were in the page, kept word for word, because they record the
 * judgement calls rather than restating the code — and the boundary cases
 * they describe (2 of 4; 51 of 101) are the fixtures the bench runs.
 *
 * THE SAME PATTERN AS lib/itemExtremes.ts AND lib/scoreStats.ts: the screen
 * imports it, the export's Python twin mirrors it, a bench runs both.
 */

/** The shape both callers already have: an ItemAnalytics row. */
export interface MajorityItem {
  wrong:    number;
  answered: number;
}

/**
 * NEW 2026-11-15 (Grace, post-UAT):
 *
 *   "Instead of Items students got wrong, it should be: Items incorrectly
 *    answered by the majority of the class. => more than 50% of the
 *    population of the Class got wrong answer in this item."
 *
 * STRICTLY MORE THAN HALF. `wrong * 2 > answered`, not `>=`, and not a float
 * comparison: 2 of 4 is not a majority, and integer arithmetic cannot drift
 * the way `wrong / answered > 0.5` can at the boundary.
 *
 * THE DENOMINATOR IS `answered` — the papers that actually have a result for
 * THAT item — and this is the one judgement call in the change, so it is
 * written down rather than buried.
 *
 *   `papers_total` would count papers that have not been graded at all. They
 *   contribute nothing to `wrong`, so an item every graded student missed
 *   would be diluted below half by papers nobody has checked yet, and the
 *   table would stay empty while the teacher stares at a class that plainly
 *   failed it.
 *
 *   `answered` cannot do that. Its weakness is the opposite one: with 3 of 40
 *   papers graded, "the majority" means the majority of three. That is why
 *   the row PRINTS its own denominator — "3 of 3 (100%)" — and why the
 *   not-included banner above the table stays.
 *
 * `wrong` ALREADY INCLUDES BLANKS. analytics_service counts `wrong` as
 * `is_correct = False` and `blank` as a subset of it; this page has said so
 * in its own footnote since 2026-11-11. So "got wrong answer" and Doc
 * Rubrica's "did not get the correct answer" are the same number, and no
 * subtraction is needed to honour either sentence.
 *
 * Items still UNDER REVIEW are in neither `wrong` nor `correct`, so they
 * cannot push an item over the line. An item can therefore cross the
 * threshold later, once those decisions are made — which is correct, and the
 * footnote says it.
 */
export const isMajorityWrong = (it: { wrong: number; answered: number }): boolean =>
  it.answered > 0 && it.wrong * 2 > it.answered;

/**
 * The percentage, to ONE DECIMAL where it needs one.
 *
 * NOT Math.round to a whole number, and this was found by the bench rather
 * than by reading. With 101 papers the smallest majority is 51, and
 * `Math.round(51 / 101 * 100)` is **50** — so a row would have printed
 * "51 of 101 (50%)" directly under a heading promising MORE than 50%. A
 * table that appears to contradict its own heading is worse than one with no
 * percentage at all.
 *
 * One decimal fixes it for every class size this system can hold: the
 * smallest majority of n is floor(n/2)+1, which is at least 50 + 50/n
 * percent, and that only rounds back down to 50.0 once n exceeds 1000.
 * MAX_BULK_ROWS and the per-exam paper count are both far below that.
 */
export const wrongPercent = (wrong: number, answered: number): string => {
  const p = Math.round((wrong / answered) * 1000) / 10;
  return `${p}%`;
};

/**
 * The rows, in the order they are shown. The page filtered inline; the
 * export needs the same list, so the filter lives here too rather than
 * being written a second time next to a second copy of the predicate.
 *
 * INPUT ORDER IS KEPT — `filter`, not a sort. The caller already has the
 * items in question-number order from analytics_service, and re-sorting
 * here would hide it if that ever stopped being true.
 */
export const majorityWrong = <T extends MajorityItem>(items: readonly T[]): T[] =>
  items.filter(isMajorityWrong);
