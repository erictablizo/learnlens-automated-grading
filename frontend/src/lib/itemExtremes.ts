/**
 * lib/itemExtremes.ts
 * ===================
 * NEW 2026-11-24 — Ms. Melanie, Recommendations page 18, requirement 9, her
 * definition of Mode:
 *
 *   "Mode: average kung saan item ang pinaka nagkamali lahat at naging tama
 *    lahat"
 *
 * — the item the class got wrong most, and the item they got right most.
 *
 * WHY THIS IS NOT lib/scoreStats.ts. That module computes the STATISTICAL
 * mode: the most common score. Grace confirmed on 24 November that Ms.
 * Melanie's sentence is to be followed as written, so the Mode row is about
 * an ITEM, and an item is a different kind of thing from a score. Mean and
 * Median keep coming from scoreStats.ts; only Mode comes from here. Two
 * modules because they take different inputs — one takes a list of scores,
 * this takes the per-item counts the analytics endpoint already returns.
 *
 * WORTH SAYING OUT LOUD, because a panellist may ask: a row labelled "Mode"
 * in a table headed "Statistics (Measure)" would normally hold the most
 * common score. This one holds an item number instead, because that is what
 * the panellist who asked for the table asked it to hold. The statistical
 * mode is still computed and still correct in lib/scoreStats.ts, and showing
 * it instead is a one-line change if she reconsiders.
 *
 * TIES ARE ALL REPORTED. Three items missed by six students each is three
 * items, and picking one would hide that the class struggled with three
 * things rather than one — the same rule scoreStats.ts applies to a tied
 * score mode.
 *
 * `wrong` ALREADY INCLUDES BLANKS — analytics_service counts a blank as
 * `is_correct = False` — so "pinaka nagkamali" and "did not get the correct
 * answer" are the same number, which is what the page's own footnote has
 * said since 11 November.
 */

export interface ItemCounts {
  question_number: number;
  wrong:    number;
  correct:  number;
  answered: number;
}

export interface ItemExtremes {
  /** The item number(s) the most students got wrong. */
  mostWrong:  number[];
  wrongCount: number;
  /** The item number(s) the most students got right. */
  mostRight:  number[];
  rightCount: number;
  /** The papers counted for those items, so the row can print its own
   *  denominator — "6 of 7" is checkable, a bare "6" is not. */
  wrongOutOf: number;
  rightOutOf: number;
}

/** Items with no answered papers tell us nothing and are dropped: an item
 *  nobody has reached is not an item nobody got right. */
const counted = (items: ReadonlyArray<ItemCounts>) =>
  items.filter(i => i.answered > 0);

export function itemExtremes(
  items: ReadonlyArray<ItemCounts> | null | undefined,
): ItemExtremes | null {
  const xs = counted(items ?? []);
  if (xs.length === 0) return null;

  const topWrong = Math.max(...xs.map(i => i.wrong));
  const topRight = Math.max(...xs.map(i => i.correct));

  const pick = (n: number, key: "wrong" | "correct") =>
    xs.filter(i => i[key] === n).map(i => i.question_number).sort((a, b) => a - b);

  const wrongItems = pick(topWrong, "wrong");
  const rightItems = pick(topRight, "correct");

  // The denominator is the answered count of the items being named. They can
  // differ between items when some papers are part-graded, so the LOWEST is
  // used — the honest "of N" for a claim about all of them.
  const outOf = (nums: number[]) =>
    Math.min(...xs.filter(i => nums.includes(i.question_number)).map(i => i.answered));

  return {
    mostWrong:  wrongItems,
    wrongCount: topWrong,
    mostRight:  rightItems,
    rightCount: topRight,
    wrongOutOf: outOf(wrongItems),
    rightOutOf: outOf(rightItems),
  };
}

const list = (nums: number[]) =>
  nums.length === 1 ? `item ${nums[0]}` : `items ${nums.join(", ")}`;

/** The two lines of the Mode cell.
 *
 *  NOT one joined string: the cell holds two separate facts and reading them
 *  as one sentence is how "item 7 item 2" happens. */
export function itemModeLines(x: ItemExtremes | null, blank = "—"): string[] {
  if (!x) return [blank];
  // An item nobody got wrong is not interesting, and saying "most missed:
  // item 1 (0 of 7)" states a problem that does not exist.
  const lines: string[] = [];
  lines.push(x.wrongCount > 0
    ? `Most missed: ${list(x.mostWrong)} — ${x.wrongCount} of ${x.wrongOutOf} wrong`
    : "Most missed: none — every item was answered correctly by everyone");
  lines.push(x.rightCount > 0
    ? `Most correct: ${list(x.mostRight)} — ${x.rightCount} of ${x.rightOutOf} right`
    : "Most correct: none — no item was answered correctly by anyone");
  return lines;
}