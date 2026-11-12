"""
app/services/export_service.py
==============================
NEW 2026-11-12 — "Results: Export -> to Excel / PDF" with "Sorting ->"
(Alex Passion / Julius Bancud, post-UAT page 2, item 6).

WHY THE WORKBOOK BUILDER TAKES DICTS, NOT ORM ROWS
---------------------------------------------------
`build_workbook` touches no model, no session and no import from this project.
It is a pure function from plain data to bytes, so it can be run and checked
without a database — which is how the zero/under-review distinction below was
verified rather than assumed. The route does the mapping; this does the file.

THREE DECISIONS, each measured
------------------------------
1. SCORES ARE NUMBERS, in their own column, with `Total Items` beside them.
   Writing "12 / 15" as text would make the one thing a spreadsheet is for -
   sorting, filtering, AVERAGE() - impossible. `Percentage` is a real number
   with a % format, not a string.

2. AN UNFINISHED PAPER GETS A SCORE BUT NO PERCENTAGE. A paper still under
   review has a score that is a FLOOR (the same rule the analytics page states
   on screen). The floor is worth showing; a percentage next to it reads as a
   result, so it is left blank and `Status` says why.

   MEASURED: a student who genuinely scored 0 must still show 0%. `if score:`
   is false for both 0 and None, which would report a real zero as missing
   data. Every test here is `is not None`.

3. SORTING IS BOTH. Rows are written in the order the exam page shows them -
   surname, then given name - so the file matches the screen the teacher
   exported it from. A frozen header row and an autofilter then let them
   re-sort by score or status in Excel without touching the system.
"""
from __future__ import annotations

import io
import math
from typing import Any, Mapping, Optional, Sequence

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

HEADER_FILL = PatternFill("solid", fgColor="1F3864")
HEADER_FONT = Font(bold=True, color="FFFFFF")
PERCENT_FORMAT = "0.0%"


def _style_header(ws, row_index: int = 1) -> None:
    for cell in ws[row_index]:
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)


def _set_widths(ws, widths: Sequence[int]) -> None:
    for i, width in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = width


def _ratio(numerator: Optional[int], denominator: Optional[int]) -> Optional[float]:
    """A proportion, or None when there is nothing to divide by.

    Guards the two real cases: an exam with no answer key yet (total_items 0)
    and an item nobody answered. Both would be ZeroDivisionError.
    """
    if numerator is None or not denominator:
        return None
    return numerator / denominator


def passing_mark(total_items: int, passing_pct: float) -> int:
    """Items needed to pass.

    `ceil`, not round, and the same rule the analytics page uses: 75% of 15
    items is 11.25 and the mark is 12. Rounding would put the boundary BELOW
    the percentage the teacher typed.
    """
    if not total_items:
        return 0
    return math.ceil(total_items * passing_pct / 100.0)


def build_workbook(
    exam: Mapping[str, Any],
    papers: Sequence[Mapping[str, Any]],
    items: Sequence[Mapping[str, Any]],
    passing_pct: float = 75.0,
) -> bytes:
    """Three sheets of bytes, ready to stream.

    exam    - exam_name, subject, schedule, total_items
    papers  - student_number, last_name, first_name, total_score, checked
              ALREADY SORTED by the caller, so the file matches the screen
    items   - question_number, correct_answer, answered, correct, wrong,
              blank, review, key_mismatch
              (the field names of schemas.analytics.ItemAnalytics)
    """
    total_items = int(exam.get("total_items") or 0)
    mark = passing_mark(total_items, passing_pct)
    wb = Workbook()

    # ------------------------------------------------------------ Scores
    # The Student No. column is DROPPED ENTIRELY when not one paper carries a
    # number. Papers added before the student roster existed have
    # test_papers.student_id = NULL, so on those exams every cell is blank -
    # and 36 empty cells read as a fault in the export rather than as "these
    # papers were never linked to a roster student". The column returns on its
    # own as soon as one paper has a number, so nothing needs changing later.
    has_numbers = any((p.get("student_number") or "").strip() for p in papers)

    ws = wb.active
    ws.title = "Scores"
    header = ["#"]
    if has_numbers:
        header.append("Student No.")
    header += ["Last Name", "First Name", "Score", "Total Items",
               "Percentage", "Status"]
    ws.append(header)
    _style_header(ws)

    for n, p in enumerate(papers, start=1):
        score = p.get("total_score")
        final = bool(p.get("checked"))
        if final:
            status = "Checked"
        elif score is not None:
            status = "Under review"
        else:
            status = "Not checked"
        row: list[Any] = [n]
        if has_numbers:
            row.append(p.get("student_number") or "")
        row += [
            p.get("last_name") or "",
            p.get("first_name") or "",
            score,
            total_items,
            _ratio(score, total_items) if final else None,
            status,
        ]
        ws.append(row)

    # Found by NAME, not by a hardcoded index: the column moves by one when
    # Student No. is dropped, and a fixed 7 would format the Total Items
    # column as a percentage on exactly the exams that drop it.
    pct_col = header.index("Percentage") + 1
    for r in range(2, ws.max_row + 1):
        ws.cell(r, pct_col).number_format = PERCENT_FORMAT
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = (
        f"A1:{get_column_letter(len(header))}{max(ws.max_row, 1)}"
    )
    _set_widths(ws, [5] + ([14] if has_numbers else []) + [20, 18, 8, 11, 12, 14])

    # ----------------------------------------------------- Item Analysis
    # Doc Rubrica, page 1: "Provide also info of number that students did not
    # get the correct answer."
    ws2 = wb.create_sheet("Item Analysis")
    ws2.append(["Item", "Correct Answer", "Answered", "Correct", "Wrong",
                "of which blank", "For Review", "% Correct", "Note"])
    _style_header(ws2)

    for it in items:
        answered = it.get("answered") or 0
        ws2.append([
            it.get("question_number"),
            it.get("correct_answer") or "",
            answered,
            it.get("correct") or 0,
            it.get("wrong") or 0,
            # A SUBSET of `wrong`, not a fourth category - the column is
            # headed "of which blank" so the three cannot be read as summing
            # to `answered`. A high blank count on one item usually means the
            # scanner missed that row, not that the class did not know it.
            it.get("blank") or 0,
            it.get("review") or 0,
            _ratio(it.get("correct"), answered),
            # Same flag the analytics page marks with a warning: MIN and MAX of
            # correct_answer differ, so the key was edited after some papers
            # were checked and the wrong-count is not a fact about the students.
            "Key was edited after some papers were checked - re-check them"
            if it.get("key_mismatch") else "",
        ])

    for r in range(2, ws2.max_row + 1):
        ws2.cell(r, 8).number_format = PERCENT_FORMAT
    ws2.freeze_panes = "A2"
    # NEW: the Scores sheet has had one from the start. Sorting this sheet by
    # "% Correct" is how a teacher finds the questions the class actually
    # struggled with, which is the whole point of the sheet.
    ws2.auto_filter.ref = f"A1:I{max(ws2.max_row, 1)}"
    _set_widths(ws2, [7, 15, 11, 9, 8, 15, 11, 11, 56])

    # ----------------------------------------------------------- Summary
    counted = [p for p in papers
               if p.get("checked") and p.get("total_score") is not None]
    scores = [int(p["total_score"]) for p in counted]
    top = max(scores) if scores else None

    summary: list[tuple[str, Any]] = [
        ("Exam", exam.get("exam_name") or ""),
        ("Subject", exam.get("subject") or ""),
        ("Schedule", exam.get("schedule") or ""),
        ("Total items", total_items),
        ("", ""),
        ("Passing mark", f"{passing_pct:g}%  ({mark} of {total_items} items)"),
        ("Papers in this exam", len(papers)),
        ("Papers checked", len(counted)),
        ("Papers excluded (under review / not checked)", len(papers) - len(counted)),
        ("", ""),
        ("Highest score", top if top is not None else "-"),
        ("Students with the highest score",
         sum(1 for s in scores if s == top) if top is not None else 0),
        ("Students who passed", sum(1 for s in scores if s >= mark)),
        ("Students who failed", sum(1 for s in scores if s < mark)),
        ("Students who scored zero", sum(1 for s in scores if s == 0)),
        ("", ""),
        ("Note",
         "Only checked papers are counted - a paper under review has a score "
         "that is still a floor. Zero is a subset of failed, so these numbers "
         "do not sum to the class size."),
    ]
    ws3 = wb.create_sheet("Summary")
    for key, value in summary:
        ws3.append([key, value])
    for r in range(1, ws3.max_row + 1):
        ws3.cell(r, 1).font = Font(bold=True)
    ws3.cell(ws3.max_row, 2).alignment = Alignment(wrap_text=True, vertical="top")
    _set_widths(ws3, [44, 66])

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def filename_for(exam: Mapping[str, Any]) -> str:
    """A safe download name.

    Exam names hold spaces, slashes and apostrophes ("BSCS1A Midterm 2"), and a
    slash in a Content-Disposition filename is how a download silently lands
    somewhere else or is rejected.
    """
    raw = (exam.get("exam_name") or "exam").strip()
    safe = "".join(ch if (ch.isalnum() or ch in " -_") else "-" for ch in raw)
    safe = "-".join(safe.split()) or "exam"
    return f"{safe}-results.xlsx"