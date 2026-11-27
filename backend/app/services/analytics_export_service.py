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
from openpyxl.utils import get_column_letter

from app.ml.item_extremes import item_extremes, item_mode_lines
# Page 23 requirement 1. The rule the screen uses, imported rather than
# re-stated: lib/majorityWrong.ts and this module are twinned by
# measure/2026-11-27_majority_twins.mjs.
from app.ml.majority_wrong import as_count, majority_wrong, wrong_percent
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


def _write_majority(ws, r: int, items: Sequence[Mapping[str, Any]]) -> int:
    """"Items incorrectly answered by the majority of the class", at row `r`;
    returns the next free row.

    A FUNCTION RATHER THAN MORE LINES INSIDE THE BUILDER, for one reason
    worth stating: Ms. Melanie asked for this section to sit AFTER the
    scored-zero list, and a call that can be moved is a placement a mutation
    can move. measure/2026-11-26_analytics_workbook_mutations.py moves it,
    and the bench compares the two row indexes.

    THE RULE IS NOT WRITTEN HERE. ml/majority_wrong twins
    lib/majorityWrong.ts and measure/2026-11-27_majority_twins.mjs runs both
    on the same fixtures; a third copy would be a third thing to keep in
    step.
    """
    rows = majority_wrong(items)
    counted = len(items)
    ws.cell(row=r, column=1,
            value=f"{len(rows)} "
                  + ("item" if len(rows) == 1 else "items")
                  + " incorrectly answered by the majority of the class") \
      .font = LABEL_FONT
    ws.cell(row=r, column=2,
            value="more than 50% of the papers counted for an item got it "
                  "wrong").font = NOTE_FONT
    r += 1

    if counted == 0:
        # Not an error, and it must not read like one.
        ws.cell(row=r, column=1,
                value="No paper in this exam has been graded yet, so there "
                      "are no per-item results.").font = NOTE_FONT
        r += 1
    elif not rows:
        # The GOOD outcome. The screen says so in these words rather than
        # printing an empty table, and says how many items it looked at so
        # the nothing is not mistaken for a failure to load.
        ws.cell(row=r, column=1,
                value=f"No item was missed by more than half the class. All "
                      f"{counted} "
                      + ("item was" if counted == 1 else "items were")
                      + " answered correctly by at least half of the papers "
                        "counted.").font = NOTE_FONT
        r += 1
    else:
        head = r
        # EIGHT columns, and the counts are NUMBERS. The screen prints
        # "3 of 6 (50%)" in one cell; a spreadsheet that did the same could
        # not sort or filter on it, so the three facts get three columns and
        # the percentage - the screen's own string, from the shared
        # formatter - rides along as a label.
        for col, title in enumerate(("Item", "Answer", "Got it wrong",
                                     "Out of", "% wrong", "Correct",
                                     "Blank", "Under review"), start=1):
            ws.cell(row=head, column=col, value=title)
        _style_header(ws, head)
        r += 1
        for row in rows:
            answer = str(row.get("correct_answer") or "").strip() or DASH
            if row.get("key_mismatch"):
                # The screen's orange ⚠ on this cell, in the only form a
                # spreadsheet has. The footnote below says what it means.
                answer += " ⚠"
            ws.cell(row=r, column=1, value=as_count(row, "question_number"))
            ws.cell(row=r, column=2, value=answer)
            ws.cell(row=r, column=3, value=as_count(row, "wrong"))
            ws.cell(row=r, column=4, value=as_count(row, "answered"))
            ws.cell(row=r, column=5,
                    value=wrong_percent(as_count(row, "wrong"),
                                        as_count(row, "answered")))
            ws.cell(row=r, column=6, value=as_count(row, "correct"))
            ws.cell(row=r, column=7, value=as_count(row, "blank"))
            ws.cell(row=r, column=8, value=as_count(row, "review"))
            r += 1
        r += 1

        hidden = counted - len(rows)
        foot = (
            f"{len(rows)} of {counted} "
            + ("item" if counted == 1 else "items")
            + " shown."
            + (f" The other {hidden} "
               + ("was" if hidden == 1 else "were")
               + " answered correctly by at least half of the papers counted."
               if hidden > 0 else "")
            + " Blank is part of Wrong, not a separate group. An item still "
              "under review counts as neither, so an item can appear here "
              "later once those decisions are made."
            + (" A ⚠ marks an item whose papers were graded against more "
               "than one answer key - those counts are not reliable until "
               "the exam is re-checked."
               if any(row.get("key_mismatch") for row in rows) else "")
        )
        ws.cell(row=r, column=1, value=foot).font = NOTE_FONT
        r += 2
    return r


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

    # ── page 23 requirement 1: the blue circle ───────────────────────────
    #
    #     "Please include also this info 'Items incorrectly answered by
    #      the majority of the class' (encircled in BLUE Color) ... to be
    #      included on this lowest portion (located after the 1 scored
    #      zero portion)."
    #
    # AFTER the four lists, because she said where. The screen shows it
    # last too, so the file and the page now read in the same order top
    # to bottom.
    r = _write_majority(ws, r, items)

    _set_widths(ws, [34, 46, 24, 18])
    # Columns 5-8 exist only in the majority table and are set with
    # openpyxl's own API rather than by lengthening the list above: this
    # file does not own _set_widths and must not assume how many widths
    # it accepts.
    for col, width in ((5, 11), (6, 10), (7, 9), (8, 13)):
        ws.column_dimensions[get_column_letter(col)].width = width


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