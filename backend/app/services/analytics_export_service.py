# -*- coding: utf-8 -*-
"""
backend/app/services/analytics_export_service.py                 2026-11-26
============================================================================

The Data Analytics page as an .xlsx.

    Ms. Melanie, Recommendations page 22, requirement 3:
    "This new excel document to be generated should have all the contents of
     the 'Data Analytics' Page (especially the info encircled with yellow
     COLOR) and not the existing 'Download Excel' Info."

The yellow circle is the Statistics table - Mean, Median and the two Mode
lines - so that block is the thing this file exists to carry, and the rest
of the page comes with it.

NOT A SHEET ADDED TO build_workbook(). Her last sentence rules that out:
this is a different document, not a fourth tab on the existing one. The exam
page keeps its Download Excel and this screen gets its own, and the two
answer different questions.

TWO DENOMINATORS, AND BOTH ARE KEPT. The page is careful about this and a
file that flattened it would be wrong in a way that reads as right:

  * "Students" counts EVERY paper on the exam.
  * Mean, Median and the four lists count only papers that are CHECKED and
    scored - the page's `final`. An unchecked paper's score is a floor, not
    a result.
  * the two Mode lines count every GRADED paper, checked or not, because
    they are about questions rather than people. The page's own caption says
    so: "it is counted over every graded paper, not only the checked ones."

So the caption travels into the file with the numbers. Without it the three
counts look inconsistent.

THE NUMBERS COME FROM THE SHARED MODULES, not from arithmetic written here:
ml/statistics.summarise_scores and ml/item_extremes.item_extremes, each with
a twins bench proving it agrees with the TypeScript the screen runs. A third
implementation would be a third thing to keep in step.

SCORES ARE WRITTEN AS NUMBERS, not as the "26 / 30" the screen prints. The
denominator is in the column heading instead. A spreadsheet whose Score
column cannot be sorted or averaged is a picture of a table rather than a
table, and the heading loses nothing.
"""
from io import BytesIO
from typing import Any, Mapping, Optional, Sequence

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font

from app.ml.item_extremes import item_extremes, item_mode_lines
# as_rows, not three labels written out here: the screen builds its table
# from it, so the file gets the same three labels, the same order and the
# same dash for a missing value. _trim is private and shared on purpose -
# the alternative is a second rounding rule for the same numbers.
from app.ml.statistics import _trim, as_rows, summarise_scores
# The same helpers the three-sheet workbook uses, so the two files look like
# they came from one system.
from app.services.export_service import _set_widths, _style_header, passing_mark

DASH = "—"
TITLE_FONT = Font(bold=True, size=14, color="1F3864")
LABEL_FONT = Font(bold=True)
NOTE_FONT = Font(italic=True, size=9, color="595959")


def _name(p: Mapping[str, Any], key: str) -> str:
    return str(p.get(key) or "").strip()


def _score(p: Mapping[str, Any]) -> Optional[float]:
    v = p.get("total_score")
    return None if v is None else float(v)


def _checked(papers: Sequence[Mapping[str, Any]]) -> list:
    """The page's `final`: checked AND scored.

    `p.checked && p.total_score !== null` in analytics/page.tsx. A paper
    under review has a score that is still a floor, and averaging a floor
    with a result is not an average of anything.
    """
    return [p for p in papers if p.get("checked") and _score(p) is not None]


def _by_score_desc(rows: Sequence[Mapping[str, Any]]) -> list:
    """Highest first, then surname - the screen's byScoreDesc."""
    return sorted(rows, key=lambda p: (-(_score(p) or 0.0),
                                       _name(p, "last_name").lower(),
                                       _name(p, "first_name").lower()))


def build_analytics_workbook(
    exam: Mapping[str, Any],
    papers: Sequence[Mapping[str, Any]],
    items: Sequence[Mapping[str, Any]],
    passing_pct: float = 60.0,
) -> bytes:
    """One sheet of bytes, ready to stream.

    exam    - exam_name, subject, schedule, total_items, total_points
    papers  - last_name, first_name, total_score, checked
    items   - schemas.analytics.ItemAnalytics rows as mappings
    """
    total_items = int(exam.get("total_items") or 0)
    total_points = int(exam.get("total_points") or total_items)
    mark = passing_mark(total_points, passing_pct)

    final = _checked(papers)
    scores = [_score(p) for p in final]
    stats = summarise_scores(scores, total_points if total_points > 0 else None)
    extremes = item_extremes(items)
    mode_lines = item_mode_lines(extremes)

    wb = Workbook()
    ws = wb.active
    ws.title = "Data Analytics"

    r = 1
    ws.cell(row=r, column=1, value="Data Analytics").font = TITLE_FONT
    r += 2

    # ── the header line of the page ──────────────────────────────────────
    for label, value in (
        ("Exam",     exam.get("exam_name") or DASH),
        ("Subject",  exam.get("subject") or DASH),
        # "Section", not "Schedule" - page 18 requirement 8 relabelled it on
        # every screen. The FIELD is still exams.schedule; see the note in
        # analytics/page.tsx about why the column rename is its own push.
        ("Section",  exam.get("schedule") or DASH),
        ("Students", len(papers)),
        ("Items",    total_items),
        ("Passing mark",
         f"{passing_pct:g}%  ({mark} of {total_points} points)"),
    ):
        ws.cell(row=r, column=1, value=label).font = LABEL_FONT
        ws.cell(row=r, column=2, value=value)
        r += 1
    r += 1

    # ── the yellow circle ────────────────────────────────────────────────
    head = r
    ws.cell(row=r, column=1, value="Statistics (Measure)")
    ws.cell(row=r, column=2, value="Value")
    _style_header(ws, head)
    r += 1
    for row in as_rows(stats):
        label = row["measure"]
        ws.cell(row=r, column=1, value=label).font = LABEL_FONT
        if label == "Mode":
            # REQUIREMENT 9 REDEFINED THIS ROW. as_rows still returns the
            # most common SCORE, which is what Mode means in statistics; the
            # screen overrides the cell with the most missed and most correct
            # ITEM, and the file follows the screen. Taking as_rows' value
            # here would put a different number under the same label in the
            # two places.
            #
            # BOTH LINES IN ONE CELL, separated by a newline, as the screen
            # shows them - two facts, not one sentence. wrap_text so the
            # second is visible without widening the column.
            cell = ws.cell(row=r, column=2, value="\n".join(mode_lines))
            cell.alignment = Alignment(wrap_text=True, vertical="top")
            ws.row_dimensions[r].height = 30
        else:
            ws.cell(row=r, column=2, value=row["value"])
        r += 1
    r += 1

    note = (
        f"Over the {stats.count} checked "
        f"{'paper' if stats.count == 1 else 'papers'}"
        + (f", out of {total_points} points" if total_points else "")
        + ". The same papers as the tables below. Mode names the ITEM the "
          "class got wrong most and the item they got right most; it is "
          "counted over every graded paper, not only the checked ones. Ties "
          "are all listed."
    )
    ws.cell(row=r, column=1, value=note).font = NOTE_FONT
    r += 2

    # ── the four lists ───────────────────────────────────────────────────
    highest = max(scores) if scores else None
    categories = [
        ("got the highest score",
         [] if highest is None else [p for p in final if _score(p) == highest],
         "no checked papers yet" if highest is None
         else f"the highest anyone scored is {_trim(highest)}"
              + (f" / {total_points}" if total_points else "")),
        ("passed",
         [] if not total_points else [p for p in final if (_score(p) or 0) >= mark],
         "no answer key yet" if not total_points
         else f"scored {mark} / {total_points} or more"),
        ("failed",
         [] if not total_points else [p for p in final if (_score(p) or 0) < mark],
         "no answer key yet" if not total_points
         else f"scored below {mark} / {total_points}"),
        ("scored zero",
         [p for p in final if _score(p) == 0],
         # Said plainly because the four numbers do NOT add up to the class
         # size, and a reader who assumes they do will think the file is wrong.
         "also counted under “failed”"),
    ]

    score_heading = ("Score" if not total_points
                     else f"Score (out of {total_points})")
    for label, rows, sub in categories:
        rows = _by_score_desc(rows)
        ws.cell(row=r, column=1, value=f"{len(rows)} {label}").font = LABEL_FONT
        ws.cell(row=r, column=2, value=sub).font = NOTE_FONT
        r += 1
        head = r
        for col, title in enumerate(("#", "Last Name", "First Name",
                                     score_heading), start=1):
            ws.cell(row=head, column=col, value=title)
        _style_header(ws, head)
        r += 1
        if not rows:
            ws.cell(row=r, column=1, value="No students in this group.") \
              .font = NOTE_FONT
            r += 1
        for i, p in enumerate(rows, start=1):
            ws.cell(row=r, column=1, value=i)
            ws.cell(row=r, column=2, value=_name(p, "last_name") or DASH)
            ws.cell(row=r, column=3, value=_name(p, "first_name") or DASH)
            ws.cell(row=r, column=4, value=_score(p))
            r += 1
        r += 1

    _set_widths(ws, [34, 46, 24, 18])

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


def filename_for_analytics(exam: Mapping[str, Any]) -> str:
    """Safe on Windows, and says which exam it is.

    The same shape as export_service.filename_for, kept separate so the two
    files cannot be mistaken for each other in a downloads folder.
    """
    raw = str(exam.get("exam_name") or "exam").strip() or "exam"
    safe = "".join(c if (c.isalnum() or c in " -_") else "-" for c in raw)
    safe = "-".join(safe.split()) or "exam"
    return f"{safe}-data-analytics.xlsx"