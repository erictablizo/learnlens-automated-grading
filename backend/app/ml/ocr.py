"""
app/ml/ocr.py — Main OCR Router
================================
Routes an image to the right detector:
  "encircled"      → Multiple Choice (circled A/B/C/D)   → ocr_encircled
  "true_false"     → True/False (written T/F)            → ocr_true_false
  "written_letter" → a LETTER written on a blank         → ocr_written_letter   NEW 2026-10-23
  "mixed"          → one page with BOTH MC and T/F parts → both, merged by position

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

NEW 2026-10-23 — Doc Rubrica, sixth comment. Her English 101 sheet has FIVE
parts in three different mechanics, and page 2 alone holds four of them:

    Part II   item 12      encircled
    Part III  items 13-18  letter written on a blank (A-F)
    Part IV   items 19-24  identification (a word) - NOT YET SUPPORTED
    Part V    items 25-30  True/False

One `question_type` per page cannot express that, and a plain union of
detectors cannot either: "F" is a valid matching-type letter AND the first
letter of FALSE. Part III item 18 really is F; Part V item 26 really is FALSE.

So `ocr_page_parts()` takes the item ranges the teacher declares and assigns
detections to them using a Y-CURSOR: parts run down the page in item order, so
each part claims the next detections of ITS type that lie below the previous
part. That is what keeps Part III's letters apart from Part V's words even
though both are "handwriting on a blank".
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, Optional

from app.ml.ocr_shared import DetectedAnswer, OCRPageResult, setup_tesseract
from app.ml.ocr_encircled import ocr_page_encircled
from app.ml.ocr_true_false import ocr_page_true_false
from app.ml.ocr_written_letter import ocr_page_written_letter, DEFAULT_LETTERS

QUESTION_TYPES = ("encircled", "true_false", "written_letter", "mixed")


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
    # NEW 2026-10-23
    if q in ("written_letter", "writtenletter", "written", "letter",
             "write_the_letter", "matching", "matching_type"):
        return "written_letter"
    return q


def infer_question_type(answers: Iterable[str]) -> str:
    """Work out how a paper must be read from the answer key of its page:
    all T/F -> 'true_false', all A-D -> 'encircled', a bit of both -> 'mixed'.

    NOTE 2026-10-23: this cannot distinguish 'encircled' from 'written_letter',
    because both store a bare letter. When a page was generated with declared
    parts, the paper must be checked with those same parts rather than with
    this guess - see ocr_page_parts().
    """
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
    letters: str = DEFAULT_LETTERS,
) -> OCRPageResult:
    qt = normalize_question_type(question_type)
    print(f"\n{'=' * 70}\nOCR_PAGE: {image_path}\nType: {qt}  expected_items: {expected_items}  "
          f"keep_blanks: {keep_blanks}\n{'=' * 70}\n")

    if qt == "true_false":
        return ocr_page_true_false(image_path, expected_items=expected_items, keep_blanks=keep_blanks)
    if qt == "encircled":
        return ocr_page_encircled(image_path, expected_items=expected_items)
    if qt == "written_letter":
        return ocr_page_written_letter(image_path, expected_items=expected_items,
                                       keep_blanks=keep_blanks, letters=letters)
    if qt == "mixed":
        return ocr_page_mixed(image_path, expected_items=expected_items, keep_blanks=keep_blanks)
    return OCRPageResult(
        image_path=image_path, answers=[], mean_conf=0.0,
        error=(f"Unknown question type '{question_type}'. Use "
               "'encircled', 'written_letter', 'true_false' or 'mixed'."),
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


# ---------------------------------------------------------------------------
# NEW 2026-10-23 — declared parts
# ---------------------------------------------------------------------------

@dataclass
class PagePart:
    """One declared part of a page: 'items 13 to 18 are written letters A-F'."""
    first_item: int
    last_item:  int
    question_type: str
    letters: str = DEFAULT_LETTERS          # only meaningful for written_letter

    @property
    def count(self) -> int:
        return max(0, self.last_item - self.first_item + 1)


@dataclass
class PartsResult:
    """{item_number: (letter, confidence)} plus whatever went wrong."""
    answers: dict[int, tuple[str, float]] = field(default_factory=dict)
    success: bool = True
    reason:  str = ""
    warnings: list[str] = field(default_factory=list)


def ocr_page_parts(image_path: str, parts: list[PagePart],
                   keep_blanks: bool = True) -> PartsResult:
    """
    Read a page whose parts the teacher has declared.

    Each distinct detector runs ONCE over the whole page - running it per part
    would multiply the cost, and the cost is already the complaint behind the
    fourth comment. Detections are then handed out with a Y-CURSOR: parts are
    taken in item order, and each claims the next `count` detections of its own
    type that lie BELOW the previous part. That is what separates Part III's
    written letters from Part V's written TRUE/FALSE, which a plain union
    cannot do because both are handwriting on a blank and "F" is valid in both.

    keep_blanks=True leaves an unreadable item as "" in its own slot. Do not
    turn this off for an answer key: dropping item 2 would make item 3's answer
    become the key for item 2 and silently corrupt every later item.
    """
    if not parts:
        return PartsResult(success=False, reason="No parts were declared for this page.")

    ordered = sorted(parts, key=lambda p: p.first_item)

    # 1. run each distinct detector once
    by_type: dict[str, list[DetectedAnswer]] = {}
    errors: list[str] = []
    warnings: list[str] = []
    for qt in {normalize_question_type(p.question_type) for p in ordered}:
        letters = next((p.letters for p in ordered
                        if normalize_question_type(p.question_type) == qt), DEFAULT_LETTERS)
        res = ocr_page(image_path, question_type=qt, keep_blanks=keep_blanks, letters=letters)
        if res.error:
            errors.append(f"{qt}: {res.error}")
        if res.warning:
            warnings.append(f"{qt}: {res.warning}")
        by_type[qt] = sorted(res.answers, key=lambda a: (a.y, a.x))

    # 2. hand them out with a y-cursor
    out: dict[int, tuple[str, float]] = {}
    cursor = -1.0
    for part in ordered:
        qt = normalize_question_type(part.question_type)
        pool = [a for a in by_type.get(qt, []) if a.y > cursor]
        taken = pool[:part.count]
        if len(taken) < part.count:
            warnings.append(
                f"items {part.first_item}-{part.last_item}: found {len(taken)} of "
                f"{part.count} answers. The missing ones are left blank.")
        for i, a in enumerate(taken):
            out[part.first_item + i] = (a.letter, a.confidence)
        for i in range(len(taken), part.count):
            out[part.first_item + i] = ("", 0.0)
        if taken:
            cursor = taken[-1].y

    if not any(letter for letter, _ in out.values()):
        return PartsResult(
            success=False,
            reason=("No answers could be read from this page. "
                    + (" ".join(errors) if errors else "Check that the photo is clear.")),
            warnings=warnings,
        )
    return PartsResult(answers=out, success=True, warnings=warnings)


__all__ = [
    "ocr_page", "ocr_page_mixed", "ocr_page_parts", "PagePart", "PartsResult",
    "infer_question_type", "normalize_question_type", "QUESTION_TYPES",
    "DetectedAnswer", "OCRPageResult", "setup_tesseract",
]