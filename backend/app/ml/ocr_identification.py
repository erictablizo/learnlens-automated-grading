"""
app/ml/ocr_identification.py — a WORD written on an answer line
===============================================================

NEW 2026-10-23 — Doc Rubrica, sixth comment, Part IV (items 19-24).

    Part IV. Identification (Items 19-24)
    Directions: Identify the term being described. Write your answer on the blank.

    19. The process of exchanging information, thoughts, and feelings ...
    Answer: ____COMMUNICATION_________

This is the hardest of the five parts, and it is hard for a reason worth
stating plainly in the thesis: Parts I, II, III and V are CLOSED questions -
the answer is one of a handful of known symbols, so the job is classification.
Identification is OPEN - the answer is an arbitrary word, so the job is
handwriting recognition, and Tesseract is trained on print, not on hand-printed
capitals.

WHAT MADE IT LOOK IMPOSSIBLE, AND WHAT IT ACTUALLY WAS
-------------------------------------------------------
The earlier note recorded "zero of the six word answers were detected in any
mode", and blamed `_blank_mode`'s single-column assumption. MEASURED 2026-10-23,
that was only the second cause. The first one is smaller and sharper:

    raw horizontal segments on key_p2, Part IV band
       x=207 y=1090 w=424 h= 9   KEEP
       x=206 y=1180 w=425 h= 9   KEEP
       x=205 y=1270 w=425 h=10   drop
       x=204 y=1360 w=425 h=10   drop
       x=203 y=1451 w=426 h=10   drop
       x=201 y=1541 w=427 h=10   drop

All six lines are found cleanly. Four are thrown away by `_find_blanks`'s
`h > 0.6 * text_h` gate, which with text_h=16 is 9.6 - and the line is 10 px
thick lower down the page, where the paper curves away from the camera.

So the gate is wrong in principle, not just in value: the thickness of a
PRINTED RULE is a property of the printer and the camera, not of the font size
it happens to sit under. What distinguishes a rule from handwriting is its
ASPECT RATIO. These lines are 42:1 and 47:1. No handwritten stroke is.

`_find_blanks` in ocr_true_false.py is deliberately NOT changed. It is the fix
for the "107 answers" bug and relaxing its gates is how that bug comes back.
This module gets its own finder, which is looser on thickness and much
stricter on everything else - length, aspect, shared column, shared width.

GRADING IS VERIFICATION, NOT RECOGNITION
-----------------------------------------
The important design point. Reading `PROGERBADING` off a page and having to
know it says PROOFREADING is open-vocabulary recognition, and it is a research
problem. But when a PAPER is checked the expected word is already known, from
the answer key. So the question is only "is this handwriting consistent with
PROOFREADING?" - verification against one candidate, which is a far easier
question and is what `grade_identification()` answers. And where even that is
not safe, it says REVIEW rather than guessing; the measurement that forces
three outcomes instead of two is written out above `REVIEW_FLOOR` below.

That is why `ocr_page_identification()` returns the raw read and a confidence,
and never tries to correct itself. On an answer key the teacher reviews and
fixes the read in ExamKeyViewer; on a paper the read is compared to the key.

SCHEMA - THIS WILL NOT WORK WITHOUT A MIGRATION
------------------------------------------------
`answer_keys.correct_answer`, `paper_scores.student_answer` and
`paper_scores.correct_answer` are all `String(10)`.

    'COMMUNICATION'     13 chars
    'PROOFREADING'      12 chars
    'THESIS STATEMENT'  16 chars

Three of her six answers cannot be stored. `MAX_ANSWER_LEN` below is what this
module truncates to, and it must match the column width after the migration.
"""

from __future__ import annotations

import re
from typing import Optional

import numpy as np

from app.ml.ocr_shared import (
    DetectedAnswer,
    OCRPageResult,
    load_gray,
    ink_mask,
    estimate_text_height,
    limit_to_expected,
)

Box = tuple[int, int, int, int]          # x, y, w, h

# Must match the migrated column width. 100 is the recommendation; the current
# schema is 10 and three of her six answers do not fit in it.
MAX_ANSWER_LEN = 100

# An answer line must be at least this many text-heights long. Her lines are
# 26x. A Part V true/false blank is 6.6x and a Part III letter blank is 4.9x,
# so 8 separates them with room to spare in both directions.
MIN_LINE_TEXT_HEIGHTS = 8.0

# A printed rule is long and thin. Measured on her sheet: 42:1 to 58:1.
# Handwriting does not reach 15:1, which is what makes this the right gate.
MIN_LINE_ASPECT = 15.0

# How much of the band above the line to read. The word sits on the line and
# its ascenders reach about two text-heights up.
BAND_TEXT_HEIGHTS = 2.4


def _find_answer_lines(ink: "np.ndarray", text_h: float,
                       expected_lines: Optional[int] = None) -> list[Box]:
    """Find the long printed rules a word is written on.

    Deliberately NOT ocr_true_false._find_blanks: that one gates on thickness
    (`h <= 0.6 * text_h`), which drops four of her six lines. This gates on
    aspect ratio instead, then requires the surviving lines to look like a
    COLUMN - same left edge, same width - because a part's answer lines are
    printed from the same template, while a stray rule in a header is not.
    """
    import cv2

    H, W = ink.shape
    klen = max(25, int(3.0 * text_h))
    horiz = cv2.morphologyEx(
        ink, cv2.MORPH_OPEN,
        cv2.getStructuringElement(cv2.MORPH_RECT, (klen, 1)))
    horiz = cv2.dilate(
        horiz, cv2.getStructuringElement(cv2.MORPH_RECT, (int(text_h * 0.4) + 1, 3)))
    contours, _ = cv2.findContours(horiz, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    cand: list[Box] = []
    for c in contours:
        x, y, w, h = cv2.boundingRect(c)
        if w < MIN_LINE_TEXT_HEIGHTS * text_h:       # too short: a T/F or letter blank
            continue
        if w > 0.80 * W:                             # a full-width page rule
            continue
        if h <= 0 or w < MIN_LINE_ASPECT * h:        # too thick to be a printed rule
            continue
        cand.append((x, y, w, h))
    if not cand:
        return []

    # Column consistency: keep the largest group of lines that share a left
    # edge and a width, because a part's answer lines are printed from one
    # template.
    best: list[Box] = []
    for ref in cand:
        grp = [b for b in cand
               if abs(b[0] - ref[0]) <= 2.0 * text_h
               and 0.85 * ref[2] <= b[2] <= 1.15 * ref[2]]
        if len(grp) > len(best):
            best = grp
    best = sorted(best, key=lambda b: b[1])

    floor = 1 if expected_lines == 1 else 2
    if len(best) < floor:
        return []

    # MEASURED FALSE POSITIVE 2026-10-23. Column consistency alone is not
    # enough. Page 1 of her sheet has no identification part at all, yet the
    # header
    #     Name: ______________________   Date: __________
    #     Section: ____________________
    # produced a consistent pair - x 182 and 168 (within 14 px), w 528 and 542
    # (within 3%) - and would have been read as two phantom answers for items
    # 19 and 20. Two further rules reject it.

    # 1. Even pitch. Answer lines are printed from a template and repeat at a
    #    fixed interval; her six are 90, 90, 90, 91, 90 px apart. A header's
    #    rules are placed by the sentence they sit in. Only checkable from
    #    three lines up, which is why rule 2 also exists.
    if len(best) >= 3:
        gaps = [best[i + 1][1] - best[i][1] for i in range(len(best) - 1)]
        mean = sum(gaps) / len(gaps)
        if mean <= 0:
            return []
        spread = (sum((g - mean) ** 2 for g in gaps) / len(gaps)) ** 0.5
        if spread / mean > 0.25:
            return []

    # 2. Agreement with what the teacher declared. She says the part has six
    #    items; a candidate column of two is not that part, whatever else it
    #    looks like. 60% allows for a line clipped by the edge of the photo
    #    while still rejecting the header pair against a declared six.
    if expected_lines and len(best) < max(floor, int(0.6 * expected_lines + 0.999)):
        return []

    # KNOWN LIMITATION, stated rather than hidden. With a declared count of 6
    # the header pair above is rejected and her page 2 still reads 6 of 6. With
    # a declared count of 1 or 2 it is NOT rejected, because a two-rule header
    # and a two-item identification part are the same shape and nothing in the
    # geometry tells them apart. A page that mixes a Name/Date header with a
    # one- or two-item identification part needs the teacher to check those
    # items. Reading the printed "Answer:" cue would fix it and would also make
    # the detector depend on her exact wording, which is the trade this project
    # has refused everywhere else.
    return best


def normalize_answer(text: str) -> str:
    """Fold a read or a key answer to the form the two are compared in.

    Spaces are REMOVED, not collapsed. Hand-printed capitals break into pieces
    at unpredictable places - Tesseract read COMMUNICATION as 'COMM UNICATION'
    and THESIS STATEMENT as 'THESISSTATEMENT' - so a space carries no
    information here and keeping it would only ever cause false mismatches.
    """
    return re.sub(r"[^A-Z0-9]", "", (text or "").upper())


def _edit_distance(a: str, b: str) -> int:
    """Levenshtein. Written out rather than pulled from a dependency: this is
    the one number a grading decision rests on, so it is auditable here."""
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def similarity(student: str, key: str) -> float:
    """0.0 to 1.0. 1.0 is an exact match after normalisation."""
    s, k = normalize_answer(student), normalize_answer(key)
    if not s and not k:
        return 1.0
    if not s or not k:
        return 0.0
    return 1.0 - _edit_distance(s, k) / max(len(s), len(k))


# Grading verdicts. Identification is NOT auto-graded, and the measurement
# below is why.
CORRECT = "correct"      # exact after normalisation
REVIEW  = "review"       # close, but a human must decide
WRONG   = "wrong"        # not this answer

# MEASURED 2026-10-23 on her sheet. Each of the 12 reads was scored against the
# correct answer (12 pairs) and against the five other answers on the same
# sheet (60 pairs):
#
#     worst score for a CORRECT answer   0.600   ('ESY' for ESSAY)
#     best  score for a DIFFERENT answer 0.267
#
# So on HER sheet any threshold between 0.30 and 0.60 grades all 12 correctly
# and accepts none of the 60 wrong pairings. That looks like a solved problem.
# It is not, and the reason must be stated rather than buried:
#
#     similarity('UBSECT', 'SUBJECT') = 0.714   <- CORRECT, read badly
#     similarity('OBJECT', 'SUBJECT') = 0.714   <- WRONG, read perfectly
#
#     similarity('ANTONY',  'ANTONYM') = 0.857  <- CORRECT, clipped
#     similarity('ANTONYN', 'ANTONYM') = 0.857  <- a misspelling
#
# Identical scores. No threshold anywhere separates those pairs, because the
# information needed to separate them is not in the string - it is in the
# handwriting. A system that auto-grades identification at 0.80 marks OBJECT
# as SUBJECT and tells nobody.
#
# Hence three outcomes, not two. An exact match is marked correct, something
# far from every candidate is marked wrong, and the band in between is handed
# back to the teacher with the cropped image. The system's claim is that it can
# READ the word and KNOW WHEN IT IS UNSURE - not that it can grade handwriting.
REVIEW_FLOOR = 0.40


def grade_identification(student: str, key: str) -> str:
    """CORRECT, REVIEW or WRONG. Read the block above before changing this."""
    s = similarity(student, key)
    if s >= 1.0:
        return CORRECT
    if s >= REVIEW_FLOOR:
        return REVIEW
    return WRONG


def match_identification(student: str, key: str, threshold: float = 0.80) -> bool:
    """DEPRECATED - kept only so existing callers do not break.

    A boolean cannot express this decision honestly; see grade_identification.
    Anything this returns True for at the default threshold includes OBJECT for
    SUBJECT.
    """
    return similarity(student, key) >= threshold


def _read_word(band: "np.ndarray", text_h: float) -> tuple[str, float]:
    """Read one hand-printed word from a white-on-black band. (text, conf 0-1).

    An ensemble over page-segmentation modes, because MEASURED 2026-10-23 no
    single mode wins on her sheet: psm 6 read ANTONYM and SUBJECT that psm 7
    mangled, and psm 7 read COMMUNICATION on the paper that psm 6 also got but
    psm 8 reduced to 'UMTION'. The candidate with the highest mean word
    confidence wins, longer text breaking a tie.
    """
    import cv2
    import pytesseract
    from pytesseract import Output

    ys, xs = np.nonzero(band)
    if len(ys) == 0:
        return "", 0.0
    tight = band[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    if tight.shape[0] < 0.4 * text_h:
        return "", 0.0

    img = 255 - tight
    s = max(1.0, 110.0 / img.shape[0])
    img = cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_CUBIC)
    img = cv2.copyMakeBorder(img, 30, 30, 30, 30, cv2.BORDER_CONSTANT, value=255)

    white = "ABCDEFGHIJKLMNOPQRSTUVWXYZ "
    # CHANGED 2026-10-26. `tessedit_char_whitelist` switches OFF Tesseract 5's
    # dictionary, so a word one letter from a real one stays broken: the key's
    # THESIS STATEMENT came back "THHESISSTATEMENT". Two unrestricted passes
    # are added to the ensemble so the language model gets a vote. MEASURED on
    # her page 2: THHESISSTATEMENT -> THESIS STATEMENT, nothing else changed.
    #
    # The cost is punctuation ("_ COMMUNICATION ."). `normalize_answer` strips
    # it for grading, but the key is DISPLAYED raw, so the edges are trimmed
    # below - the teacher should not see an answer key full of stray dots.
    configs = [f"--psm {psm} -c tessedit_char_whitelist={white}" for psm in (7, 6, 8)]
    configs += [f"--psm {psm}" for psm in (7, 6)]
    best, best_conf = "", -1.0
    for cfg in configs:
        try:
            d = pytesseract.image_to_data(img, config=cfg, output_type=Output.DICT)
        except Exception:
            continue
        # Group the words by the TEXT LINE Tesseract put them on, and treat
        # each line as its own candidate. psm 6 reads the band as a block and
        # can return a line of speckle above the real answer - it read item 21
        # as "PSWWSS\nSUBJECT". Concatenating gave "PSWWSS SUBJECT" (0.54
        # similarity, graded wrong); taking the better LINE gives "SUBJECT".
        # MEASURED 2026-10-23: +1 correct on the key, no regressions anywhere.
        groups: dict[tuple, list[tuple[str, float]]] = {}
        for i, (t, c) in enumerate(zip(d["text"], d["conf"])):
            t = (t or "").strip().upper()
            try:
                c = float(c)
            except (TypeError, ValueError):
                continue
            if not t or c < 0:
                continue
            key = (d["block_num"][i], d["par_num"][i], d["line_num"][i])
            groups.setdefault(key, []).append((t, c))
        for ws in groups.values():
            text = " ".join(w for w, _ in ws)
            conf = sum(c for _, c in ws) / len(ws) / 100.0
            if (conf > best_conf) or (abs(conf - best_conf) < 1e-9
                                      and len(normalize_answer(text)) > len(normalize_answer(best))):
                best, best_conf = text, conf
    best = re.sub(r"^[^A-Z0-9]+|[^A-Z0-9]+$", "", best.upper()).strip()
    return best[:MAX_ANSWER_LEN], round(max(best_conf, 0.0), 2)


def ocr_page_identification(image_path: str, expected_items: Optional[int] = None,
                            keep_blanks: bool = True,
                            expected_lines: Optional[int] = None) -> OCRPageResult:
    """Read the words written on a page's identification answer lines.

    keep_blanks defaults to True here, unlike the letter detectors. An
    identification item a student left empty must still occupy its slot, or
    every later answer shifts up by one and is graded against the wrong key.

    `expected_lines` is how many identification items the teacher DECLARED on
    this page. It is used only to reject a candidate column that is nothing
    like that many lines; it never trims or pads the result.

    `expected_items` trims extras through `limit_to_expected`, which keeps the
    N MOST CONFIDENT answers. That is the wrong rule for this detector -
    Tesseract reports confidence 0 on most hand-printed words, so the trim
    would be close to arbitrary. Pass it only from a single-part page where
    the count is certain. `ocr_page_parts()` deliberately passes None and lets
    its y-cursor choose by position instead.
    """
    try:
        import cv2

        gray, _ = load_gray(image_path)
        ink = ink_mask(gray)
        text_h = estimate_text_height(ink)
        H, W = ink.shape

        lines = _find_answer_lines(ink, text_h, expected_lines)
        if not lines:
            return OCRPageResult(
                image_path=image_path, answers=[], mean_conf=0.0,
                error=("No identification answer lines found. Each item needs a "
                       "printed line for the answer, and the whole line must be "
                       "inside the photo."),
            )

        # Erase the printed rules, so they are not read as underscores and do
        # not join the letters sitting on them into one blob.
        klen = max(25, int(3.0 * text_h))
        rules = cv2.morphologyEx(
            ink, cv2.MORPH_OPEN,
            cv2.getStructuringElement(cv2.MORPH_RECT, (klen, 1)))
        rules = cv2.dilate(
            rules, cv2.getStructuringElement(cv2.MORPH_RECT, (int(text_h * 0.4) + 1, 3)))
        clean = cv2.subtract(ink, rules)
        # REJECTED ARM, recorded so it is not retried: a vertical closing here
        # to reconnect letter strokes the rule removal cuts (the S of SUBJECT
        # sits on the line). MEASURED 2026-10-23 over three kernel heights it
        # swung the result both ways - height 3 fixed the key (6/6) and broke
        # the paper's ESSAY to "E"; height 2 did the reverse. With six samples
        # that is noise, not a finding, and tuning to it would be overfitting
        # a thesis cannot defend. Left out.

        answers: list[DetectedAnswer] = []
        for (x, y, w, h) in lines:
            top = max(0, int(y - BAND_TEXT_HEIGHTS * text_h))
            band = clean[top:min(H, y + h), x:min(W, x + w)]
            text, conf = _read_word(band, text_h)
            answers.append(DetectedAnswer(y=y, x=x, letter=text, confidence=conf,
                                          size=int(text_h)))

        if not keep_blanks:
            answers = [a for a in answers if a.letter]

        answers, warn = limit_to_expected(answers, expected_items)
        answered = [a for a in answers if a.letter]
        mean_conf = (round(sum(a.confidence for a in answered) / len(answered), 2)
                     if answered else 0.0)
        print(f"DEBUG[identification]: {len(answers)} answers -> "
              f"{[a.letter or '_' for a in answers]}")
        return OCRPageResult(image_path=image_path, answers=answers,
                             mean_conf=mean_conf, warning=warn)

    except Exception as exc:
        return OCRPageResult(image_path=image_path, answers=[], mean_conf=0.0, error=str(exc))


__all__ = ["ocr_page_identification", "grade_identification", "match_identification",
           "similarity", "normalize_answer", "MAX_ANSWER_LEN",
           "CORRECT", "REVIEW", "WRONG", "REVIEW_FLOOR"]