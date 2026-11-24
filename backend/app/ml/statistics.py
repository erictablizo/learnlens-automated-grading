"""
app/ml/statistics.py
====================
NEW 2026-11-23 — Ms. Melanie, Recommendations page 18, requirement 9.
Her words, in full:

    "Additional Info in Data Analytics:
     Mean : average score ng lahat; Mode: average kung saan item ang pinaka
     nagkamali lahat at naging tama lahat; Median

       Statistics (Measure) | Value
       Mean                 |
       Median               |
       Mode                 |"

CORRECTED 2026-11-24: this used to quote a sentence she did not write, and it
left out her gloss. HER MODE DESCRIBES AN ITEM - which question the class got
wrong most and right most - not the most common score, which is what this
module computes. See the long note in frontend/src/lib/scoreStats.ts. The
statistical reading is what the table's own heading argues for, and it is what
is built, but it is an open question for her.

ONE MODULE, NO DATABASE, NO IMPORTS FROM THE APP — the same shape as
app/ml/scoring.py, and for the same reason: three statistics computed in the
endpoint would be three more places that can disagree with the tables beside
them about who is in the class.

WHICH STUDENTS COUNT, stated rather than assumed
------------------------------------------------
Only papers that are CHECKED. A paper with items still under review has a
score that is a FLOOR, not a result - that is why Data Analytics already
leaves those papers out of its pass count and says so on screen. Putting
their floors into a mean would quietly pull it down, and a teacher comparing
the mean to the tables would find numbers that do not add up.

The caller passes the scores it already selected for the tables. This module
does not know what a paper is; it takes numbers.

WHAT "NO MODE" MEANS, AND WHY IT IS AN ANSWER
----------------------------------------------
With seven students and seven different scores there is no most-common score.
Reporting the lowest, or the first, or "7" would all be inventions. `mode` is
None in that case and the screen shows a dash - the same standard the rest of
this project uses for a value it does not have.

When several scores tie for most common, ALL of them are returned. A class
where 40 and 55 both occur three times has two modes; picking one would hide
the bimodal shape that makes the fact interesting.

ROUNDING matches app/ml/scoring.py's `_pct`: round(x, 1). A mean of 48.25
shows as 48.3, not 48.25, because every other number on that screen is to one
decimal place.
"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from typing import Iterable, List, Optional, Sequence


@dataclass
class ScoreStats:
    """What the three rows of her table show, plus what they are out of.

    `mode` is a LIST. Empty means there is no most-common score, which the
    screen renders as a dash. One entry is the ordinary case. More than one
    is a genuine tie and all of them are shown.
    """
    count:    int = 0
    mean:     Optional[float] = None
    median:   Optional[float] = None
    mode:     List[float] = field(default_factory=list)
    out_of:   Optional[int] = None

    @property
    def has_data(self) -> bool:
        return self.count > 0

    def mode_text(self, blank: str = "—") -> str:
        """The Mode cell. Several modes are joined, because several is the
        truth; `blank` when there is none."""
        if not self.mode:
            return blank
        return ", ".join(_trim(v) for v in self.mode)


def _trim(v: float) -> str:
    """48.0 -> '48', 48.3 -> '48.3'. A score of 48 should not read '48.0'
    next to a table that prints '48 / 65'."""
    return str(int(v)) if float(v).is_integer() else str(round(v, 1))


def _clean(values: Iterable) -> List[float]:
    """Numbers only. A None score - a paper never checked - is not a zero;
    it is a student who has no score yet, and averaging it as 0 would be a
    claim about their work. Dropped, not defaulted."""
    out: List[float] = []
    for v in values:
        if v is None:
            continue
        try:
            out.append(float(v))
        except (TypeError, ValueError):
            continue
    return out


def summarise_scores(values: Iterable, out_of: Optional[int] = None) -> ScoreStats:
    """Mean, median and mode of the scores handed in.

    `values` is whatever the endpoint already selected for the tables beside
    this - points earned, one per checked paper. `out_of` is the denominator
    the screen prints, so the three rows can read "48.3 / 65" and agree with
    every other score on the page.
    """
    xs = sorted(_clean(values))
    if not xs:
        return ScoreStats(count=0, out_of=out_of)

    n = len(xs)
    mean = round(sum(xs) / n, 1)

    mid = n // 2
    median = xs[mid] if n % 2 else (xs[mid - 1] + xs[mid]) / 2
    median = round(float(median), 1)

    counts = Counter(xs)
    top = max(counts.values())
    # No mode when every score is distinct - but a class of ONE has a mode,
    # and it is that student's score. The n > 1 guard is what tells those two
    # cases apart.
    modes = sorted(v for v, c in counts.items() if c == top) if (top > 1 or n == 1) else []

    return ScoreStats(count=n, mean=mean, median=median,
                      mode=modes, out_of=out_of)


def as_rows(stats: ScoreStats, blank: str = "—") -> Sequence[dict]:
    """Her table, in her order, ready for the screen.

    Built here rather than in the component so the three labels and the three
    values cannot drift apart, and so the dash for a missing value is decided
    once.
    """
    def num(v: Optional[float]) -> str:
        return blank if v is None else _trim(v)

    return (
        {"measure": "Mean",   "value": num(stats.mean)},
        {"measure": "Median", "value": num(stats.median)},
        {"measure": "Mode",   "value": stats.mode_text(blank)},
    )