"""
app/ml/ocr.py — Main OCR Router
================================
Routes an image to the right detector:
  "encircled"  → Multiple Choice (circled A/B/C/D)  → ocr_encircled
  "true_false" → True/False (written T/F)           → ocr_true_false
 
FIX 2026-09-22:
  * `expected_items` — how many items the page really has (from the
    "Number of items on this page" field, or from the answer key when checking
    a paper). Extra false detections are dropped instead of being saved.
  * `keep_blanks` — for student papers: an unanswered T/F blank stays in its
    place as "" so later items are not shifted.
  * `infer_question_type()` — lets Checking Paper use the same detector
    the answer key was made with (it used to always use the circle detector).
"""
 
from __future__ import annotations
 
from typing import Iterable, Optional
 
from app.ml.ocr_shared import DetectedAnswer, OCRPageResult, setup_tesseract
from app.ml.ocr_encircled import ocr_page_encircled
from app.ml.ocr_true_false import ocr_page_true_false
 
QUESTION_TYPES = ("encircled", "true_false")
 
 
def normalize_question_type(qt: Optional[str]) -> str:
    q = (qt or "encircled").strip().lower()
    for ch in ("-", " ", "/"):
        q = q.replace(ch, "_")
    if q in ("true_false", "truefalse", "tf", "true_or_false"):
        return "true_false"
    if q in ("encircled", "multiple_choice", "mc", "multiplechoice"):
        return "encircled"
    return q
 
 
def infer_question_type(answers: Iterable[str]) -> str:
    """All answers are T/F → 'true_false', otherwise 'encircled'."""
    vals = [a.strip().upper() for a in answers if a and a.strip()]
    if vals and all(v in ("T", "F", "TRUE", "FALSE") for v in vals):
        return "true_false"
    return "encircled"
 
 
def ocr_page(
    image_path: str,
    question_type: str = "encircled",
    expected_items: Optional[int] = None,
    keep_blanks: bool = False,
) -> OCRPageResult:
    qt = normalize_question_type(question_type)
    print(f"\n{'=' * 70}\nOCR_PAGE: {image_path}\nType: {qt}  expected_items: {expected_items}  "
          f"keep_blanks: {keep_blanks}\n{'=' * 70}\n")
 
    if qt == "true_false":
        return ocr_page_true_false(image_path, expected_items=expected_items, keep_blanks=keep_blanks)
    if qt == "encircled":
        return ocr_page_encircled(image_path, expected_items=expected_items)
    return OCRPageResult(
        image_path=image_path, answers=[], mean_conf=0.0,
        error=f"Unknown question type '{question_type}'. Use 'encircled' or 'true_false'.",
    )
 
 
__all__ = [
    "ocr_page", "infer_question_type", "normalize_question_type", "QUESTION_TYPES",
    "DetectedAnswer", "OCRPageResult", "setup_tesseract",
]