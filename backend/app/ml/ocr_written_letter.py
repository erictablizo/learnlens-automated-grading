"""
app/ml/ocr_written_letter.py — a LETTER written on a blank
===========================================================

NEW 2026-10-23 — Doc Rubrica, sixth comment: her English 101 sheet answers
multiple choice in two different ways and adds a matching-type part.

    Part I.   Multiple Choice - Write the Letter   items 1-6    B C D A C B
    Part II.  Multiple Choice - Encircle the Letter items 7-12  C A D B C D
    Part III. Matching Type                       items 13-18   C D A E B F

Parts I and III are answered by WRITING a letter on the blank before the item
number. Neither existing detector reads that:

  * ocr_encircled  looks for a hand-drawn ring. There is none.
  * ocr_true_false finds the blanks correctly - 6 of 6 in each part, measured
    on her real sheet - but `classify_tf()` whitelists only T and F, so every
    written letter came back as "F". Truth B C D A C B was read F F F F F F.

So the geometry was already right and only the classifier was wrong. This
module reuses ocr_true_false's blank finding and cropping UNCHANGED and swaps
in a letter classifier over a configurable alphabet.

WHY IT IMPORTS PRIVATE NAMES
`_find_blanks`, `_crop_above_blank`, `_tight` and `_first_glyph` live in
ocr_true_false.py. They are imported rather than copied so that a fix to the
blank geometry benefits both detectors; copying them is how the two would
drift. If they are ever promoted to ocr_shared.py, change the import here.

ALPHABET
`letters` defaults to "ABCD" (four-option multiple choice). Matching type needs
the range its Column B actually uses - "ABCDEF" for her sheet. Restricting the
alphabet matters: Tesseract with a narrow whitelist is markedly more accurate,
and it is what stops a matching-type "F" being read as something outside the
column.
"""

from __future__ import annotations

from typing import Optional

import numpy as np

from app.ml.ocr_shared import (
    DetectedAnswer,
    OCRPageResult,
    load_gray,
    ink_mask,
    estimate_text_height,
    sort_column_aware,
    limit_to_expected,
)
from app.ml.ocr_true_false import (
    _find_blanks,
    _crop_above_blank,
    _tight,
    _first_glyph,
)
# _cd_shape already tells a C from a D by shape - the single most common
# confusion in a circled or written letter. Reused rather than rewritten.
from app.ml.ocr_encircled import _cd_shape

DEFAULT_LETTERS = "ABCD"

# Characters Tesseract commonly returns for a hand-written letter, mapped back.
# Only applied when the target letter is in the allowed alphabet, so a
# matching-type sheet that stops at D never gains an E or F by accident.
_CONFUSIONS: dict[str, str] = {
    "A": "A", "4": "A", "^": "A",
    "B": "B", "8": "B", "13": "B",
    "C": "C", "G": "C", "(": "C", "{": "C", "<": "C",
    "D": "D", "0": "D", "O": "D", "Q": "D",
    "E": "E", "3": "E",
    "F": "F", "P": "F", "7": "F",
}


def _tess_letter(glyph_white_on_black: "np.ndarray", letters: str) -> tuple[str, float]:
    """Read one hand-written letter. Returns (letter, confidence 0-1)."""
    import cv2
    import pytesseract
    from pytesseract import Output

    img = 255 - glyph_white_on_black
    h = img.shape[0]
    s = max(1.0, 90.0 / max(1, h))
    img = cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_CUBIC)
    img = cv2.copyMakeBorder(img, 25, 25, 25, 25, cv2.BORDER_CONSTANT, value=255)

    allowed = set(letters.upper())
    whitelist = letters.upper() + letters.lower()
    best, conf = "", -1.0
    # psm 10 = "a single character". The unrestricted pass is a fallback for a
    # letter the whitelist pass refuses to see at all.
    #
    # MEASURED 2026-10-23 on her real sheet: the floor used to be conf > 0,
    # which threw away a correctly-read "C" that Tesseract reported at
    # confidence 0. On a CONSTRAINED alphabet a zero-confidence reading is
    # still worth more than nothing, because the teacher reviews the generated
    # key in ExamKeyViewer before it is used. The reading is kept and its low
    # confidence is passed through, so a doubtful item is visible rather than
    # silently missing.
    for cfg in (f"--psm 10 -c tessedit_char_whitelist={whitelist}", "--psm 10"):
        try:
            d = pytesseract.image_to_data(img, config=cfg, output_type=Output.DICT)
        except Exception:
            continue
        for t, c in zip(d["text"], d["conf"]):
            t = (t or "").strip().upper()
            try:
                c = float(c)
            except (TypeError, ValueError):
                continue
            if not t or c < 0:
                continue
            mapped = _CONFUSIONS.get(t[0], t[0] if t[0] in allowed else "")
            if mapped in allowed and c / 100.0 > conf:
                best, conf = mapped, c / 100.0
        if best and conf >= 0.5:
            break
    return best, round(max(conf, 0.0), 2)


def classify_letter(bin_crop: "np.ndarray", text_h: float,
                    letters: str = DEFAULT_LETTERS) -> tuple[str, float]:
    """Classify the handwriting on one blank as a letter from `letters`."""
    glyph = _first_glyph(bin_crop, text_h)
    if glyph is None:
        return "", 0.0

    # MEASURED 2026-10-23: one glyph at one scale read her page-1 hand poorly
    # ("B" -> "4", "D" -> "'"). read_circle_letter() already solves the same
    # problem for circled letters by trying several crops and keeping the most
    # confident, so the same is done here: the isolated glyph, plus the whole
    # tidied crop, plus a padded version that keeps the ascender/descender a
    # tight bounding box can clip.
    import cv2
    candidates = [glyph]
    if bin_crop is not glyph:
        candidates.append(bin_crop)
    pad = int(max(2, 0.25 * text_h))
    candidates.append(cv2.copyMakeBorder(glyph, pad, pad, pad, pad,
                                         cv2.BORDER_CONSTANT, value=0))

    letter, conf = "", 0.0
    for cand in candidates:
        if cand is None or cand.size == 0:
            continue
        l, c = _tess_letter(cand, letters)
        if l and c > conf:
            letter, conf = l, c
        if conf >= 0.8:
            break

    # C and D are the pair Tesseract gets wrong most often on handwriting: a
    # tight crop can clip D's right bowl and it reads as C. The letter's own
    # shape decides, exactly as read_circle_letter() does for circled answers.
    if letter in ("C", "D") and {"C", "D"} <= set(letters.upper()):
        shape = _cd_shape(glyph > 0)
        if shape and shape != letter:
            letter, conf = shape, max(conf, 0.6)
    return letter, conf


def _blank_mode_letters(ink: "np.ndarray", text_h: float, letters: str,
                        keep_blanks: bool) -> list[DetectedAnswer]:
    """ocr_true_false._blank_mode, with the letter classifier in place of the
    T/F one. The blank selection is deliberately identical - same dominant
    column, same width consistency - because that is the part already proven
    to find 6 of 6 blanks in both of her written-letter parts."""
    import cv2

    blanks = _find_blanks(ink, text_h)
    if len(blanks) < 2:
        return []

    xs = np.array([b[0] for b in blanks])
    counts = [int(np.sum(np.abs(xs - x0) <= 3 * text_h)) for x0 in xs]
    top = max(counts)
    keep = [b for b, c in zip(blanks, counts) if c >= max(2, 0.4 * top)]
    if not keep:
        return []
    widths = np.array([b[2] for b in keep])
    med_w = float(np.median(widths))
    keep = [b for b in keep if 0.5 * med_w <= b[2] <= 2.0 * med_w]

    def _top_limit(b):
        above = [o for o in blanks if o is not b and o[1] < b[1] - 0.5 * text_h
                 and o[0] < b[0] + b[2] and b[0] < o[0] + o[2]]
        if not above:
            return None
        o = max(above, key=lambda o: o[1])
        return o[1] + o[3] + 2

    answers: list[DetectedAnswer] = []
    for b in keep:
        crop = _crop_above_blank(ink, b, text_h, _top_limit(b))
        tight = _tight(crop)
        min_ink = max(15, int(0.25 * text_h * text_h * 0.3))
        if tight is None or cv2.countNonZero(crop) < min_ink or tight.shape[0] < 0.4 * text_h:
            answers.append(DetectedAnswer(y=b[1], x=b[0], letter="", confidence=0.0,
                                          size=int(text_h)))
            continue
        letter, conf = classify_letter(tight, text_h, letters)
        answers.append(DetectedAnswer(y=b[1], x=b[0], letter=letter, confidence=conf,
                                      size=int(text_h)))
    if not keep_blanks:
        answers = [a for a in answers if a.letter]
    return answers


def ocr_page_written_letter(image_path: str, expected_items: Optional[int] = None,
                            keep_blanks: bool = False,
                            letters: str = DEFAULT_LETTERS) -> OCRPageResult:
    """keep_blanks=True (student papers) keeps an unanswered blank as '' so the
    numbering of later items is not shifted. For answer keys it is False."""
    try:
        gray, _ = load_gray(image_path)
        ink = ink_mask(gray)
        text_h = estimate_text_height(ink)

        answers = _blank_mode_letters(ink, text_h, letters, keep_blanks)
        if not answers:
            return OCRPageResult(
                image_path=image_path, answers=[], mean_conf=0.0,
                error=("No written-letter answers detected. Ensure each answer is "
                       "written clearly on the blank before the item number."),
            )

        answers = sort_column_aware(answers, gray.shape[1])
        answers, warn = limit_to_expected(answers, expected_items)
        answered = [a for a in answers if a.letter]
        mean_conf = (round(sum(a.confidence for a in answered) / len(answered), 2)
                     if answered else 0.0)
        print(f"DEBUG[written_letter]: letters={letters} {len(answers)} answers -> "
              f"{[a.letter or '_' for a in answers]}")
        return OCRPageResult(image_path=image_path, answers=answers,
                             mean_conf=mean_conf, warning=warn)

    except Exception as exc:
        return OCRPageResult(image_path=image_path, answers=[], mean_conf=0.0, error=str(exc))


__all__ = ["ocr_page_written_letter", "classify_letter", "DEFAULT_LETTERS"]