"""
app/ml/__init__.py

CHANGED 2026-10-23 — the new question types and the three-state grading are
re-exported here too, so `from app.ml import ...` keeps working the way the
existing imports do. Nothing is removed: every name the old file exported is
still exported, in the same order.
"""

from app.ml.ocr import (
    ocr_page,
    ocr_page_parts,
    PagePart,
    PartsResult,
    normalize_question_type,
    infer_question_type,
    QUESTION_TYPES,
    setup_tesseract,
    OCRPageResult,
    DetectedAnswer,
)
from app.ml.grader import (
    grade_pages,
    grade_detected,
    GradingResult,
    QuestionResult,
    CORRECT,
    REVIEW,
    WRONG,
)

__all__ = [
    # unchanged
    "ocr_page",
    "setup_tesseract",
    "OCRPageResult",
    "DetectedAnswer",
    "grade_pages",
    "GradingResult",
    "QuestionResult",
    # NEW 2026-10-23 — declared parts
    "ocr_page_parts",
    "PagePart",
    "PartsResult",
    "normalize_question_type",
    "infer_question_type",
    "QUESTION_TYPES",
    # NEW 2026-10-23 — three-state grading
    "grade_detected",
    "CORRECT",
    "REVIEW",
    "WRONG",
]