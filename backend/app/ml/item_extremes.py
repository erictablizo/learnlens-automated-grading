# -*- coding: utf-8 -*-
"""
backend/app/ml/item_extremes.py                                  2026-11-26
============================================================================

The Mode cell of the Data Analytics table, without a browser.

    Ms. Melanie, Recommendations page 22, requirement 3: the Excel document
    must hold "all the contents of the Data Analytics Page (especially the
    info encircled with yellow COLOR)" - and the yellow circle is the
    Statistics table, whose third row is this.

A TWIN OF frontend/src/lib/itemExtremes.ts, line for line and decision for
decision, exactly as ml/statistics.py twins lib/scoreStats.ts. That file's
bench says why the Python copy exists at all:

    "The Python module stays because the Excel export will want the same
     numbers without a browser. Two implementations of one definition is a
     liability unless something holds them together, and reading them side
     by side is not that something."

measure/2026-11-26_item_extremes_twins.mjs is that something here. It runs
both on the same fixtures and fails if they disagree about anything.

THE THREE DECISIONS THAT ARE EASY TO GET WRONG, all taken from the
TypeScript rather than re-derived:

  * an item with `answered == 0` is DROPPED before anything is measured. An
    item nobody has reached is not an item nobody got right.
  * ties are ALL listed, lowest number first, because "items 7, 10, 11" is
    the truth and picking one of them is not.
  * the denominator is the LOWEST `answered` among the items being named,
    not the highest and not the paper count. They differ when some papers
    are part-graded, and the lowest is the honest "of N" for a claim about
    all of them.

The two sentences are returned as SEPARATE LINES, not one joined string, for
the reason the TypeScript gives: "the cell holds two separate facts and
reading them as one sentence is how 'item 7 item 2' happens."

CHANGED 2026-11-28 - Ms. Melanie, on the live screen: the row said "Most
missed" above a number counting WRONG. Blanks are folded into `wrong`, so a
line labelled "missed" was reporting both without saying so. Her
instruction: show both figures when there are blanks, say "most wrong" when
there are not, and match the label to the word on the other line too.

    Most wrong: item 11 - 23 of 39 wrong, 7 left blank
    Most wrong: item 11 - 23 of 39 wrong          (when none were blank)
    Most right: item 1 - 33 of 39 right

No blank figure on the right line: a blank is never right, so it would be
zero on every exam ever graded. That line's fix was the label alone.

A TIE CAN DISAGREE ABOUT BLANKS where the wrong count cannot - two items
tied at 6 wrong may be 2 blank and 5 blank - so a range is printed rather
than a sum, which would invent a figure larger than the class.
"""
from dataclasses import dataclass
from typing import Any, Iterable, List, Mapping, Optional, Sequence

BLANK = "—"          # the em dash the screen uses for "nothing to show"


@dataclass(frozen=True)
class ItemExtremes:
    """Mirrors the ItemExtremes interface in lib/itemExtremes.ts."""
    most_wrong:  List[int]
    wrong_count: int
    most_right:  List[int]
    right_count: int
    # The papers counted for those items, so the row can print its own
    # denominator - "6 of 7" is checkable, a bare "6" is not.
    wrong_out_of: int
    right_out_of: int
    # How many of those wrong answers were blank, across the items named.
    # Equal when one item is named or a tie agrees; a range otherwise.
    wrong_blank_low: int
    wrong_blank_high: int


def _counted(items: Iterable[Mapping[str, Any]]) -> List[Mapping[str, Any]]:
    """Items with no answered papers tell us nothing and are dropped."""
    return [i for i in items or [] if int(i.get("answered") or 0) > 0]


def item_extremes(
    items: Optional[Sequence[Mapping[str, Any]]],
) -> Optional[ItemExtremes]:
    """The most-missed and most-correct items, or None when there are none.

    `items` are schemas.analytics.ItemAnalytics rows as mappings - the same
    shape the screen receives, so the two sides read the same fields.
    """
    xs = _counted(items or [])
    if not xs:
        return None

    top_wrong = max(int(i.get("wrong") or 0) for i in xs)
    top_right = max(int(i.get("correct") or 0) for i in xs)

    def pick(n: int, key: str) -> List[int]:
        return sorted(int(i["question_number"]) for i in xs
                      if int(i.get(key) or 0) == n)

    wrong_items = pick(top_wrong, "wrong")
    right_items = pick(top_right, "correct")

    def out_of(nums: List[int]) -> int:
        # The LOWEST answered count among the named items. See the header.
        return min(int(i.get("answered") or 0) for i in xs
                   if int(i["question_number"]) in nums)

    # The blanks sitting inside that wrong count, for the items named. A
    # tie can disagree, so both ends are kept and the caller decides how to
    # say it.
    blanks = [int(i.get("blank") or 0) for i in xs
              if int(i["question_number"]) in wrong_items]

    return ItemExtremes(
        most_wrong=wrong_items,
        wrong_count=top_wrong,
        most_right=right_items,
        right_count=top_right,
        wrong_out_of=out_of(wrong_items),
        right_out_of=out_of(right_items),
        wrong_blank_low=min(blanks),
        wrong_blank_high=max(blanks),
    )


def _list(nums: Sequence[int]) -> str:
    return f"item {nums[0]}" if len(nums) == 1 else "items " + ", ".join(
        str(n) for n in nums)


def _blank_clause(low: int, high: int) -> str:
    """", 7 left blank" / ", 2 to 5 left blank" / "" when there are none."""
    if high == 0:
        return ""
    if low == high:
        return f", {high} left blank"
    return f", {low} to {high} left blank"


def item_mode_lines(x: Optional[ItemExtremes], blank: str = BLANK) -> List[str]:
    """The two lines of the Mode cell, in the screen's words.

    An item nobody got wrong is not interesting, and saying
    "most wrong: item 1 (0 of 7)" states a problem that does not exist - so
    the zero cases get their own sentence, as they do on screen.
    """
    if x is None:
        return [blank]
    lines = []
    lines.append(
        f"Most wrong: {_list(x.most_wrong)} — {x.wrong_count} of "
        f"{x.wrong_out_of} wrong"
        + _blank_clause(x.wrong_blank_low, x.wrong_blank_high)
        if x.wrong_count > 0
        else "Most wrong: none — every item was answered correctly by everyone")
    lines.append(
        f"Most right: {_list(x.most_right)} — {x.right_count} of "
        f"{x.right_out_of} right"
        if x.right_count > 0
        else "Most right: none — no item was answered correctly by anyone")
    return lines
