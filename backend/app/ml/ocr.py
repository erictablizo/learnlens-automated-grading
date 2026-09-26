"""
app/ml/ocr.py — Main OCR Router
================================
Routes an image to the right detector:
  "encircled"  → Multiple Choice (circled A/B/C/D)  → ocr_encircled
  "true_false" → True/False (written T/F)           → ocr_true_false
  "mixed"      → one page with BOTH parts           → both, merged by position

FIX 2026-09-22:
  * `expected_items` — how many items the page really has (from the
    "Number of items on this page" field, or from the answer key when checking
    a paper). Extra false detections are dropped instead of being saved.
  * `keep_blanks` — for student papers: an unanswered T/F blank stays in its
    place as "" so later items are not shifted.
  * `infer_question_type()` — lets Checking Paper use the same detector
    the answer key was made with (it used to always use the circle detector).
NEW 2026-09-26:
  * "mixed" question type for a page like
    "Part I - Multiple Choice (1-5)" + "Part II - True or False (6-10)".
"""

from __future__ import annotations

from typing import Iterable, Optional

from app.ml.ocr_shared import DetectedAnswer, OCRPageResult, setup_tesseract
from app.ml.ocr_encircled import ocr_page_encircled
from app.ml.ocr_true_false import ocr_page_true_false

QUESTION_TYPES = ("encircled", "true_false", "mixed")


def normalize_question_type(qt: Optional[str]) -> str:
    q = (qt or "encircled").strip().lower()
    for ch in ("-", " ", "/"):
        q = q.replace(ch, "_")
    if q in ("true_false", "truefalse", "tf", "true_or_false"):
        return "true_false"
    if q in ("encircled", "multiple_choice", "mc", "multiplechoice"):
        return "encircled"
    if q in ("mixed", "both", "mc_tf", "multiple_choice_true_false", "combined"):
        return "mixed"
    return q


def infer_question_type(answers: Iterable[str]) -> str:
    """Work out how a paper must be read from the answer key of its page:
    all T/F -> 'true_false', all A-D -> 'encircled', a bit of both -> 'mixed'."""
    vals = [a.strip().upper() for a in answers if a and a.strip()]
    if not vals:
        return "encircled"
    tf = [v for v in vals if v in ("T", "F", "TRUE", "FALSE")]
    mc = [v for v in vals if v in ("A", "B", "C", "D")]
    if tf and mc:
        return "mixed"
    if tf and len(tf) == len(vals):
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
    if qt == "mixed":
        return ocr_page_mixed(image_path, expected_items=expected_items, keep_blanks=keep_blanks)
    return OCRPageResult(
        image_path=image_path, answers=[], mean_conf=0.0,
        error=f"Unknown question type '{question_type}'. Use 'encircled', 'true_false' or 'mixed'.",
    )


def ocr_page_mixed(image_path: str, expected_items: Optional[int] = None,
                   keep_blanks: bool = False) -> OCRPageResult:
    """
    NEW 2026-09-26 — one page that holds BOTH kinds of items, e.g.
        Part I  - Multiple Choice (circled A-D)   items 1-5
        Part II - True or False  (written words)  items 6-10
    Both detectors are run on the page and their answers are merged in reading
    order (top to bottom), so the item numbers stay 1..N across both parts.
    A True/False blank that sits on the same line as a circled answer is
    dropped, so an answer is never counted twice.
    """
    from app.ml.ocr_shared import limit_to_expected

    mc = ocr_page_encircled(image_path)
    tf = ocr_page_true_false(image_path, keep_blanks=keep_blanks)

    answers = [a for a in mc.answers if a.letter]
    sizes = [a.size for a in answers if a.size]
    line_tol = (0.6 * (sum(sizes) / len(sizes))) if sizes else 30.0
    for a in tf.answers:
        if any(abs(a.y - m.y) <= line_tol for m in answers):
            continue                      # same line as a circle -> already counted
        answers.append(a)
    answers.sort(key=lambda a: (a.y, a.x))

    if not answers:
        return OCRPageResult(
            image_path=image_path, answers=[], mean_conf=0.0,
            error=(mc.error or tf.error or
                   "No answers detected on this page. Check that the photo is clear."),
        )

    answers, warn = limit_to_expected(answers, expected_items)
    answered = [a for a in answers if a.letter]
    mean_conf = round(sum(a.confidence for a in answered) / len(answered), 2) if answered else 0.0
    print(f"DEBUG[mixed]: {len(answers)} answers -> {[a.letter or '_' for a in answers]}")
    return OCRPageResult(image_path=image_path, answers=answers, mean_conf=mean_conf, warning=warn)


__all__ = [
    "ocr_page", "ocr_page_mixed", "infer_question_type", "normalize_question_type", "QUESTION_TYPES",
    "DetectedAnswer", "OCRPageResult", "setup_tesseract",
]