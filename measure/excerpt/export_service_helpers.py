# -*- coding: utf-8 -*-
"""
measure/excerpt/export_service_helpers.py  -  PARTIAL, FOR MEASUREMENT ONLY

NOT the whole file. A verbatim excerpt of the three helpers
analytics_export_service.py imports from Grace's real
backend/app/services/export_service.py, read 2026-11-26, kept here so
measure/2026-11-26_analytics_workbook.py can load the REAL workbook builder
without her file.

It is loaded AS "app.services.export_service" by that bench, and lives under
measure/ rather than at the real path for the reason the password excerpt
gives: a file shipped at backend/app/services/export_service.py is one slip
from overwriting 250 lines of hers.

Her file is the authority. If these drift from it the bench cannot see it -
the same caveat the model mirrors carry.
"""
import math
from typing import Optional, Sequence

from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

HEADER_FILL = PatternFill("solid", fgColor="1F3864")
HEADER_FONT = Font(bold=True, color="FFFFFF")


def _style_header(ws, row_index: int = 1) -> None:
    for cell in ws[row_index]:
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center",
                                   wrap_text=True)


def _set_widths(ws, widths: Sequence[int]) -> None:
    for i, width in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = width


def passing_mark(total_items: int, passing_pct: float) -> int:
    if not total_items:
        return 0
    return math.ceil(total_items * passing_pct / 100.0)
