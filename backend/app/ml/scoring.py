"""
app/ml/scoring.py
=================
NEW 2026-11-20 — what a paper is worth, when items are worth different things.

    Sir Alex Passion, Recommendations page 12:
      "1 item equivalent to how many points"
      "the equivalent points per item will be used in the computation of
       total scores of each Student."

ONE MODULE, NO DATABASE, NO IMPORTS FROM THE APP. Every place that currently
counts correct answers - the grader, the per-answer override, the review
queue, Data Analytics, the Summary Report, the Excel export - will call this
instead of doing its own arithmetic. Six copies of a sum is six chances for
one of them to disagree with the others about a student's mark.

THE CONTROL THAT MATTERS: with every item worth 1, every number this returns
is identical to the count it replaces. `points_earned` IS `correct`,
`points_possible` IS `total_items`, and `percent` is the same figure to the
same rounding. The bench asserts that over the whole fixture rather than
assuming it, because an exam priced at 1 point an item is every exam that
exists today and most of the ones that will exist tomorrow.

WHY `max_points` EXISTS, AND WHY IT IS NOT THE SCORE
-----------------------------------------------------
An identification item under review has not been marked yet. The existing
code already treats a paper with anything under review as unfinished and its
score as a FLOOR (`paper.checked = needs_review == 0`, and `max_possible` in
paper_answer_service). That distinction gets more important with weighted
points, not less: one 10-point item under review is the difference between a
pass and a fail, and showing a single number would hide that.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable, List, Mapping, Optional

# The dropdown Alex specified: 1 to 10. Mirrored by the CHECK constraint in
# migrations/2026-11-20_answer_key_points.sql - stated twice, because a rule
# about marks is worth stating twice.
MIN_POINTS = 1
MAX_POINTS = 10
DEFAULT_POINTS = 1

CORRECT = "correct"
REVIEW = "review"
WRONG = "wrong"


def clamp_points(value) -> int:
    """A usable points value, whatever arrives.

    Anything unparseable, missing, or outside 1-10 becomes the DEFAULT rather
    than raising: a paper must still score if one key row is malformed. The
    database CHECK is what prevents a bad value being stored in the first
    place; this is what stops a bad value stopping a class being marked.
    """
    try:
        n = int(value)
    except (TypeError, ValueError):
        return DEFAULT_POINTS
    if n < MIN_POINTS:
        return DEFAULT_POINTS
    return min(n, MAX_POINTS)


@dataclass
class ScoreSummary:
    """Everything a screen needs, computed once.

    `points_earned` is the mark. `max_points` is what it could still become if
    every item under review were resolved in the student's favour - a ceiling,
    not a prediction.
    """
    total_items:    int = 0
    correct_items:  int = 0
    review_items:   int = 0
    points_earned:  int = 0
    points_possible: int = 0
    points_review:  int = 0
    percent:        float = 0.0
    max_points:     int = 0
    max_percent:    float = 0.0
    is_final:       bool = True

    @property
    def needs_review(self) -> int:
        return self.review_items


def _pct(part: int, whole: int) -> float:
    """The existing rounding, kept: round(x / y * 100, 1)."""
    return round(part / whole * 100, 1) if whole else 0.0


def summarise(
    verdicts: Iterable[tuple[int, str]],
    points_by_question: Optional[Mapping[int, int]] = None,
) -> ScoreSummary:
    """Score a paper from (question_number, verdict) pairs.

    `verdicts` is what the rows say: 'correct', 'review' or 'wrong'. An item
    missing from `points_by_question` is worth DEFAULT_POINTS, which is how a
    paper graded before this feature existed still scores correctly.
    """
    pts = points_by_question or {}
    s = ScoreSummary()
    for q, verdict in verdicts:
        p = clamp_points(pts.get(q, DEFAULT_POINTS))
        s.total_items += 1
        s.points_possible += p
        v = (verdict or "").strip().lower()
        if v == CORRECT:
            s.correct_items += 1
            s.points_earned += p
        elif v == REVIEW:
            s.review_items += 1
            s.points_review += p
    s.max_points = s.points_earned + s.points_review
    s.percent = _pct(s.points_earned, s.points_possible)
    s.max_percent = _pct(s.max_points, s.points_possible)
    s.is_final = s.review_items == 0
    return s


def summarise_bools(
    results: Iterable[tuple[int, bool]],
    points_by_question: Optional[Mapping[int, int]] = None,
) -> ScoreSummary:
    """The same, for the paths that only know is_correct.

    `grade_detected` has no review state for letter items - it decides correct
    or wrong - so it hands booleans. Keeping one scoring function means the
    weighted sum cannot drift between the two callers.
    """
    return summarise(((q, CORRECT if ok else WRONG) for q, ok in results),
                     points_by_question)


def page_total(items: int, points_per_item) -> int:
    """The "Total Points on this page (Computed)" field, server side.

    The modal computes this as the teacher types. It is computed here as well,
    because a number the browser worked out is not a number the database
    should trust.
    """
    try:
        n = int(items)
    except (TypeError, ValueError):
        return 0
    return max(n, 0) * clamp_points(points_per_item)

# ---------------------------------------------------------------------------
# NEW 2026-11-21 - Sir Alex Passion, Recommendations page 13.
#
#   "Remove this line  1 item equivalent to how many points = Drop-down List"
#   "Instead add the following lines:
#      Range of item number from ____ to ____ 1 item equivalents to (1 to 10)
#      Range of item number from ____ to ____ 1 item equivalents to (1 to 10)
#      Range of item number from ____ to ____ 1 item equivalents to (1 to 10)"
#
# Page 12 priced a whole page at one rate. Page 13 replaces that with up to
# three priced BANDS, which is what a real paper looks like: twenty encircled
# items at 1 point and five identification items at 5.
#
# WHAT AN ITEM OUTSIDE EVERY BAND IS WORTH. One point. With the page-level
# dropdown gone there is no field left that could say otherwise, and the
# column default (points smallint not null default 1) already says it. So a
# teacher who fills in no bands at all generates exactly the key generated
# today - which is the control this whole change has to pass.
#
# WHY PARSING IS STRICT HERE AND clamp_points() IS FORGIVING. Different jobs.
# clamp_points reads a value already in the database and must never stop a
# class being marked. This reads what a teacher just typed, at the door,
# before anything is stored: a band typed "25-21" is a mistake worth a
# sentence, not a value worth guessing at.
# ---------------------------------------------------------------------------

MAX_RANGES = 3          # three lines, because Alex drew three lines
MAX_ITEM_NUMBER = 500   # the bound parts mode already uses


@dataclass(frozen=True)
class PointRange:
    """One of Alex's lines: items `first_item`..`last_item` are worth
    `points` each. Inclusive at both ends, the way a teacher reads
    "from 21 to 25"."""
    first_item: int
    last_item: int
    points: int

    @property
    def span(self) -> int:
        return self.last_item - self.first_item + 1


_RANGE_RE = re.compile(r"^\s*(\d{1,3})\s*-\s*(\d{1,3})\s*:\s*(\d{1,2})\s*$")


def parse_point_ranges(raw: Optional[Iterable[str]]) -> List[PointRange]:
    """Turn `["1-20:1", "21-25:5"]` into PointRanges, or raise ValueError
    with a sentence a teacher can act on.

    The wire form is `first-last:points`. It is a string rather than a nested
    body because the generate endpoint takes query parameters today and a
    POST that suddenly needs a JSON body is a breaking change to a route two
    screens depend on, twelve days out.

    Returns bands sorted by first_item. An empty or missing value returns [],
    which prices nothing and leaves every item at the column default.
    """
    if not raw:
        return []
    out: List[PointRange] = []
    for i, token in enumerate(raw, start=1):
        # An empty line is not a mistake. The dialog always renders three of
        # them and a teacher who prices one band leaves two blank; the client
        # drops them, and the server does too rather than depending on it.
        if token is None or not str(token).strip():
            continue
        m = _RANGE_RE.match(token)
        if not m:
            raise ValueError(
                f"Range {i} is not readable. Write it as first-last:points, "
                f"for example 21-25:5."
            )
        first, last, pts = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if first < 1 or last < 1 or first > MAX_ITEM_NUMBER or last > MAX_ITEM_NUMBER:
            raise ValueError(
                f"Range {i}: item numbers must be between 1 and {MAX_ITEM_NUMBER}."
            )
        if last < first:
            raise ValueError(
                f"Range {i}: the last item ({last}) comes before the first ({first})."
            )
        if pts < MIN_POINTS or pts > MAX_POINTS:
            raise ValueError(
                f"Range {i}: points must be between {MIN_POINTS} and {MAX_POINTS}."
            )
        out.append(PointRange(first, last, pts))

    if len(out) > MAX_RANGES:
        raise ValueError(f"At most {MAX_RANGES} ranges can be given for one page.")

    out.sort(key=lambda r: r.first_item)
    for a, b in zip(out, out[1:]):
        if b.first_item <= a.last_item:
            raise ValueError(
                f"Items {b.first_item}-{b.last_item} overlap items "
                f"{a.first_item}-{a.last_item}. Each item can only be worth one amount."
            )
    return out


def points_for_items(
    question_numbers: Iterable[int],
    ranges: Optional[Iterable[PointRange]] = None,
) -> dict:
    """{question_number: points} for the items actually on the page.

    An item no band covers is worth DEFAULT_POINTS. This is the function the
    route uses to price real generated rows, so the price follows the item
    numbers that were really created rather than the count the browser
    guessed at.
    """
    bands = list(ranges or [])
    out = {}
    for q in question_numbers:
        p = DEFAULT_POINTS
        for r in bands:
            if r.first_item <= q <= r.last_item:
                p = r.points
                break
        out[int(q)] = clamp_points(p)
    return out


def page_total_with_ranges(items, ranges: Optional[Iterable[PointRange]] = None) -> int:
    """The "Total Points on this page (Computed)" field, server side.

    Mirrors the arithmetic the modal shows while the teacher types: banded
    items at their band's price, everything else at 1. Items counted by a
    band beyond the page's item count are NOT subtracted here - the modal
    refuses that case before it can be sent, and silently discarding part of
    a band would hide the mistake rather than report it.
    """
    try:
        n = max(int(items), 0)
    except (TypeError, ValueError):
        return 0
    bands = list(ranges or [])
    if not bands:
        return n * DEFAULT_POINTS
    covered = sum(r.span for r in bands)
    priced = sum(r.span * clamp_points(r.points) for r in bands)
    return priced + max(0, n - covered) * DEFAULT_POINTS
