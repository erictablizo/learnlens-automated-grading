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

# A blank holds a WORD (TRUE / FALSE) rather than a single letter when its
# ink is BOTH wide and made of several glyphs. Both tests are required.
#
# MEASURED 2026-10-26 on page 1 and page 2 of her sheet, 18 blanks:
#     one letter per blank      3.4x - 4.5x text_h, 2 ink blobs
#     TRUE / FALSE written out  5.9x - 7.2x text_h, 4 - 6 ink blobs
#
# REGRESSION that forced the blob test, same day: width alone was tried
# first, and on the deployed scan of PAGE 1 the Part I blanks crossed 5.0x
# (they are longer printed rules than Part III's) so items 1, 2 and 4 were
# handed to the True/False classifier and came back T, F, F. Width depends on
# how much of the printed rule lands in the crop; the number of glyphs does
# not. One letter is 2 blobs on every blank measured, a word is at least 4.
WORD_WIDTH_TEXT_HEIGHTS = 5.0
WORD_MIN_GLYPH_BLOBS = 3

# A blank can hold a word WITHOUT passing the geometric test above, because
# both of its measurements scale with how large the student writes.
#
# MEASURED 2026-10-28 on a 60-item purely True/False sheet (6 scans, 88
# blanks): every TRUE/FALSE written on it is 3.6x - 5.4x text_h and 2 - 5
# blobs, so 83 of the 88 fail WORD_WIDTH_TEXT_HEIGHTS and were read as single
# letters out of "ABCDEFT". That read is right only by luck - TRUE and FALSE
# begin with the two letters that alphabet already holds - and it still cost
# 7 items on the answer key and 4 on the paper.
#
# The instrument that does separate them is what Tesseract SPELLS, because one
# hand-written letter cannot come back as three letters of text:
#
#   60-item True/False sheet, 88 blanks   3 - 5 alpha chars ("TUE", "FASE",
#                                         "TRVUE", "PAUSE", "FALSE")
#   her written-letter parts, 24 blanks   0 - 3 ("C", "A 4", "DS;", "FOY")
#
# "FOY" is the one letter-blank that reaches three characters, so length alone
# is not enough either: it sits 4 edits from FALSE, where the True/False
# sheet's worst read is 3 ("FAY", "PAE"). Both tests are therefore required.
TF_WORD_MIN_ALPHA = 3
TF_WORD_MAX_EDITS = 3

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

# A handwritten G is a C with a horizontal bar across its middle, and that bar
# is the only thing separating them. MEASURED on exam 8's key and paper: all
# four G glyphs read "C" from Tesseract at 0.64-0.92 with G in the whitelist,
# at every crop size. The bar has to be found by shape, exactly as _cd_shape
# finds D's bowl.
#
# Feature 1, the longest horizontal RUN of ink in the middle band, over the
# glyph width. D contributes no run there - its right side is a vertical
# stroke - and C has only its thin left spine:
#
#     C   0.261  0.308  0.286  0.222      highest 0.308
#     D   0.280  0.286  0.240  0.300      highest 0.300
#     G   0.519  0.536  0.600  0.680      lowest  0.519
#
# Feature 2 is needed because E, F and H have long bars too, and an E misread
# as "C" would otherwise become a G - MEASURED, that is exam 8's paper item
# 15. WHERE the run starts separates them: G's bar comes in from the right,
# while E, F and H hang theirs off the left spine.
#
#     E   0.000  0.050  0.053  0.095     F   0.048  0.053  0.091  0.100
#     H   0.048  0.050                   A   0.100  0.130  0.143  0.211
#     G   0.320  0.360  0.407  0.429      <- lowest 0.320
G_MID_BAR_WIDTH = 0.40
G_MID_BAR_START = 0.25
G_MID_BAND = (0.38, 0.72)


def _has_mid_bar(mask: "np.ndarray") -> bool:
    """Does this glyph have a long horizontal stroke coming in from the RIGHT
    across its middle? That stroke is a G's bar."""
    ys, xs = np.where(mask)
    if len(xs) < 10:
        return False
    g = mask[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = g.shape
    if h < 6 or w < 4:
        return False
    lo = int(G_MID_BAND[0] * h)
    hi = max(int(G_MID_BAND[1] * h), lo + 1)
    best = start = 0
    for row in g[lo:hi]:
        cur = at = 0
        for x, v in enumerate(row):
            if v:
                if cur == 0:
                    at = x
                cur += 1
                if cur > best:
                    best, start = cur, at
            else:
                cur = 0
    return best >= G_MID_BAR_WIDTH * w and start >= G_MID_BAR_START * w

# An E has a bottom arm and an F does not - that one stroke is the whole
# difference. MEASURED on every E and F glyph of exam 8's key and paper,
# longest horizontal run of ink in the bottom band over glyph width:
#
#     F   0.263  0.273  0.286  0.300      highest 0.300
#     E   0.857  0.900  0.947             lowest  0.857
#
# The fourth E, the paper's item 15, measures 0.238 - but it is an E whose
# bottom arm was erased with the printed rule it sits on (see
# _crop_above_blank), and Tesseract reads it "C", so this branch never sees
# it. That erasure is a separate fault and is not fixed here.
E_FOOT_WIDTH = 0.55
E_FOOT_BAND = 0.78


def _has_bottom_bar(mask: "np.ndarray") -> bool:
    """Does this glyph have a long horizontal stroke along its base?"""
    ys, xs = np.where(mask)
    if len(xs) < 10:
        return False
    g = mask[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = g.shape
    if h < 6 or w < 4:
        return False
    best = 0
    for row in g[int(E_FOOT_BAND * h):]:
        cur = 0
        for v in row:
            cur = cur + 1 if v else 0
            if cur > best:
                best = cur
    return best >= E_FOOT_WIDTH * w

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

    # An E read where an F is written. Only this direction: the reverse has no
    # measured instance, and applying an arbiter outside its measured regime
    # is what made _cd_shape harmful. Both letters must be on offer, so a page
    # that prints only one of them is untouched.
    if letter == "E" and {"E", "F"} <= set(letters.upper()) \
            and not _has_bottom_bar(glyph > 0):
        return "F", max(conf, 0.6)

    # A G reads as "C" every time - see _has_mid_bar. Tested BEFORE the C/D
    # arbiter below, because on exam 8's key item 4 that arbiter had already
    # turned the misread C into a D, burying the G twice over. The guard on
    # the alphabet is what keeps this off every page that does not print a
    # "G." label: there, G was never an available answer in the first place.
    if letter in ("C", "D") and "G" in letters.upper() and _has_mid_bar(glyph > 0):
        return "G", max(conf, 0.6)   

    # C and D are the pair Tesseract gets wrong most often on handwriting: a
    # tight crop can clip D's right bowl and it reads as C. The letter's own
    # shape decides, exactly as read_circle_letter() does for circled answers.
    if letter in ("C", "D") and {"C", "D"} <= set(letters.upper()):
        shape = _cd_shape(glyph > 0)
        if shape and shape != letter:
            letter, conf = shape, max(conf, 0.6)
    return letter, conf



def _looks_like_a_word(tight: "np.ndarray", text_h: float) -> bool:
    """Is the ink on this blank a WORD rather than a single letter?

    Wide AND several glyphs. See WORD_WIDTH_TEXT_HEIGHTS for the measurements
    and for why width on its own is not enough.
    """
    import cv2
    if tight.shape[1] < WORD_WIDTH_TEXT_HEIGHTS * text_h:
        return False
    m = (tight > 0).astype("uint8")
    n, _lbl, stats, _cent = cv2.connectedComponentsWithStats(m, 8)
    floor = max(6, 0.08 * text_h * text_h)
    blobs = sum(1 for k in range(1, n) if stats[k, cv2.CC_STAT_AREA] >= floor)
    return blobs >= WORD_MIN_GLYPH_BLOBS


def _edits(a: str, b: str) -> int:
    """Levenshtein distance between two short strings."""
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def _spells_true_false(raw: str) -> bool:
    """Did Tesseract read this blank as the WORD "TRUE" or "FALSE"?

    `raw` is the third value classify_tf returns - the word text it read off
    the crop, before any T/F decision. See TF_WORD_MIN_ALPHA for why the
    length and the distance are both needed.

    REJECTED 2026-10-28, measured: letting the SPELLING choose between TRUE
    and FALSE instead of classify_tf's pixel vote. It was written to rescue
    item 46 of the paper's page 3, where the student's TRUE reads "ACLE" and
    the vote answers F at 0.72 - but "ACLE" is 3 edits from TRUE and 3 from
    FALSE, so the spelling cannot choose either. Over the other 87 blanks the
    two never disagreed. A rule that changes nothing is not worth its lines.
    """
    alpha = "".join(ch for ch in (raw or "").upper() if ch.isalpha())
    if len(alpha) < TF_WORD_MIN_ALPHA:
        return False
    return min(_edits(alpha, "TRUE"), _edits(alpha, "FALSE")) <= TF_WORD_MAX_EDITS


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
        # classify_tf runs on EVERY blank now, for its word text. One extra
        # Tesseract pass per blank buys the spelling test below, which is the
        # only thing that finds a word written small.
        from app.ml.ocr_true_false import classify_tf
        tf_letter, tf_conf, tf_raw = classify_tf(tight, text_h)
        if _looks_like_a_word(tight, text_h) or _spells_true_false(tf_raw):
            # A whole word on the blank: TRUE / FALSE. classify_tf votes on
            # the word, classify_letter would judge its first glyph alone.
            letter, conf = tf_letter, tf_conf
            if not letter:
                letter, conf = classify_letter(tight, text_h, letters)
        else:
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