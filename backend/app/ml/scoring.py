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

from dataclasses import dataclass
from typing import Iterable, Mapping, Optional

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
