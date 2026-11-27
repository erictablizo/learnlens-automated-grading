# -*- coding: utf-8 -*-
"""
backend/app/ml/majority_wrong.py                                 2026-11-27
============================================================================

"Items incorrectly answered by the majority of the class", without a
browser.

    Ms. Melanie, Recommendations page 23, requirement 1:
    "Please include also this info 'Items incorrectly answered by the
     majority of the class' (encircled in BLUE Color) ... to be included on
     this lowest portion (located after the 1 scored zero portion)."

A TWIN OF frontend/src/lib/majorityWrong.ts, decision for decision, exactly
as ml/item_extremes.py twins lib/itemExtremes.ts and ml/statistics.py twins
lib/scoreStats.ts. measure/2026-11-27_majority_twins.mjs runs both on the
same fixtures and fails if they disagree about anything.

THE RULE IS NOT RE-DERIVED HERE. The three decisions, and their reasons, are
written out in the TypeScript and summarised once:

  * STRICTLY more than half: `wrong * 2 > answered`, never `>=`, and integer
    arithmetic rather than `wrong / answered > 0.5`. 2 of 4 is not a
    majority, and the integer form cannot drift at the boundary.
  * the denominator is `answered` - the papers that have a result for THAT
    item - not the paper count. An item every graded student missed must not
    be diluted below half by papers nobody has checked yet.
  * `wrong` already includes blanks, and an item still under review is in
    neither `wrong` nor `correct`, so it cannot push an item over the line.

ONE DELIBERATE ASYMMETRY WITH THE TYPESCRIPT, and it is written down rather
than discovered later. `wrong_percent` REFUSES `answered <= 0`; the
TypeScript would divide by zero and print "Infinity%". Neither caller can
reach it - `is_majority_wrong` is False whenever `answered` is 0, and both
callers filter before they format - so the asymmetry is on an input that
does not occur, and the bench asserts that contract instead of asserting a
behaviour the TypeScript does not have.
"""
from math import floor
from typing import Any, Iterable, List, Mapping

# The same rounding-and-trimming rule the Statistics table uses. A second
# number-to-string rule for the same kind of number is how "48.0" appears
# next to "48" in one file.
from app.ml.statistics import _trim


def as_count(it: Mapping[str, Any], key: str) -> int:
    """A count off an analytics row, as an int.

    A missing or null count is 0: the rows analytics_service returns always
    carry all four, and a row that somehow does not is not evidence that the
    class got the item wrong.

    PUBLIC, and used by analytics_export_service as well as by the rule
    below. A count read one way here and another way where the row is
    written into a cell is how a table disagrees with its own filter.
    """
    v = it.get(key)
    try:
        return int(v or 0)
    except (TypeError, ValueError):
        return 0


def is_majority_wrong(it: Mapping[str, Any]) -> bool:
    """`it.answered > 0 && it.wrong * 2 > it.answered`, and nothing else."""
    answered = as_count(it, "answered")
    return answered > 0 and as_count(it, "wrong") * 2 > answered


def majority_wrong(items: Iterable[Mapping[str, Any]]) -> List[Mapping[str, Any]]:
    """The rows the screen shows, in the order they arrive.

    `filter`, not a sort: analytics_service already returns them in
    question-number order, and re-sorting here would hide it if that ever
    stopped being true.
    """
    return [it for it in items if is_majority_wrong(it)]


def wrong_percent(wrong: int, answered: int) -> str:
    """"50.5%". ONE DECIMAL WHERE IT NEEDS ONE, and it is not cosmetic.

    The TypeScript's own note: with 101 papers the smallest majority is 51,
    and rounding 51/101 to a whole number gives **50** - a row reading
    "51 of 101 (50%)" directly under a heading promising MORE than 50%.

    HALF ROUNDS UP, because JavaScript's Math.round does. Python's round()
    is banker's rounding - round(506.5) is 506, Math.round(506.5) is 507 -
    so floor(x + 0.5) is used rather than round(x), and the twins bench
    carries a fixture that lands exactly on .5 to hold it there.
    """
    if answered <= 0:
        raise ValueError(
            "wrong_percent needs answered > 0; filter with is_majority_wrong "
            "first (see the asymmetry note at the top of this module)")
    p = floor((wrong / answered) * 1000 + 0.5) / 10
    return f"{_trim(p)}%"
