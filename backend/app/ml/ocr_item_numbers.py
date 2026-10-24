"""
app/ml/ocr_item_numbers.py — read the exam's own structure
===========================================================
NEW 2026-10-24.

Every detector in this package answers "what is written here". None of them
answers "which item is this". Until now the item number was the POSITION of a
detection in the list: the first answer found is item 1, the second is item 2.
That is why page 1 of Doc Rubrica's key produced nine answers and page 2 was
then numbered 10-28 instead of 12-30 - two blanks nobody could read on page 1
moved every item on page 2.

The exam sheet already carries the answer. "1." , "2." , "13." , "26." are
PRINTED, and printed digits are the one thing on these photographs Tesseract
reads well. So this module reads the item numbers off the page and hands back
{item_number: y}. A detector's job stays "what is written here"; this module
says which item that line belongs to, and an item nobody could read stays an
empty slot at its own number instead of shifting its neighbours.

MEASURED 2026-10-24 on the two pages of exam 118:

                                page 1 (items 1-11)   page 2 (items 12-30)
    item numbers recovered           11 of 11              19 of 19
    answers in the right slot         8 of 11              15 of 19
    header phantoms discarded              3                     0

For comparison on the same photographs: the current merge gives 9 answers on
page 1 and numbers page 2 from 10; declared parts gives 8/11 and 16/19 but
needs the teacher to state every range first.
"""

from __future__ import annotations

import bisect
import re
from typing import Optional

from app.ml.ocr_shared import DetectedAnswer

# A token is an item number when it ENDS in digits plus a separator, and the
# digits are not preceded by a dash. The dash test is what rejects the part
# headings "(Items 13-18)", "(Items 19-24)" and "(Items 25-30)", which are
# otherwise perfect item numbers sitting in the wrong place.
#
# The separator class is wider than ".": MEASURED, Tesseract returns "11," for
# item 11 on page 1 and "28," for item 28 on page 2. Requiring a full stop
# loses both.
_ITEM_TOKEN = re.compile(r"(?:^|[^0-9\-‐-―])(\d{1,3})\s*[.,):;]$")

# A PRINTED option label: "A.", "B.", "C.", "D." under a multiple-choice
# item, or the "A." - "F." of a matching type's Column B. The highest one
# printed anywhere on the page is the highest letter any answer on that page
# can legitimately be.
_OPTION_LABEL = re.compile(r"^([A-F])\s*[.)]$")

# An option label read below this confidence is ignored. The labels are
# PRINTED, so a real one reads high; this only keeps handwriting out.
MIN_OPTION_CONF = 50.0

# How far a detection may sit BELOW an item number and still belong to it.
# An encircled answer is on an option line under the question, so this is
# generous; the next item number ends the range anyway.
BELOW_TOLERANCE_TEXT_HEIGHTS = 1.5

# Pitch agreement for filling a gap. 0.10, not 0.18: MEASURED, at 0.18 the
# gap 16->19 on page 2 (107 px/item, because Part III ends and Part IV begins
# inside it) was accepted against Part IV's 91 px/item and placed items 17 and
# 18 where nothing is written.
PITCH_TOLERANCE = 0.10


def read_page_text(gray):
    """One Tesseract pass over the whole page, shared by everything here.

    Deliberately ONE call. The item numbers and the option labels come out of
    the same pass, because the cost model in the thesis counts passes and a
    second full-page read would show up in it.
    """
    import pytesseract
    from pytesseract import Output

    try:
        return pytesseract.image_to_data(gray, config="--psm 6", output_type=Output.DICT)
    except Exception:
        return None


def page_alphabet(d, fallback: str = "ABCDEFT") -> str:
    """The letters this page can legitimately contain, from its PRINTED
    option labels.

    MEASURED 2026-10-24 on three scans of her sheet. Page 1 prints A-D and
    nothing else; page 2 prints A-F because Part III's Column B runs to F.
    Reading a page-1 blank with the wide alphabet is not merely permissive,
    it is WORSE:

        page 1, ocr_page_written_letter on the six Part I blanks
            letters=ABCD     _ C D A C _   4 of 6, two honest blanks
            letters=ABCDT    _ C D A C _   4 of 6
            letters=ABCDEFT  F C F A C _   3 of 6

    Item 3 is the case that settles it. Its "D" reads correctly at 0.31 when
    the alphabet stops at D, and becomes "F" at 0.63 when F is allowed - the
    wide alphabet does not just accept a misread the narrow one rejected, it
    OUTRANKS a correct read. And "F" was never an option on a four-option
    item in the first place.

    "T" is always kept. Dropping it is what made every written letter come
    back as "F", and MEASURED on page 1 it costs nothing: ABCD and ABCDT give
    the same six readings.
    """
    if d is None:
        return fallback
    seen = set()
    for i, raw in enumerate(d["text"]):
        t = (raw or "").strip()
        m = _OPTION_LABEL.match(t)
        if not m:
            continue
        try:
            conf = float(d["conf"][i])
        except (TypeError, ValueError):
            continue
        if conf < MIN_OPTION_CONF:
            continue
        seen.add(m.group(1))
    if not seen:
        return fallback
    top = max(seen)
    alphabet = "ABCDEF"[: ord(top) - ord("A") + 1]
    if "T" not in alphabet:
        alphabet += "T"
    print(f"DEBUG[item_numbers]: option labels up to {top} -> letters={alphabet}")
    return alphabet


def _raw_tokens(d) -> list[tuple[int, int, float, float, str]]:
    """Every "<number><separator>" token on the page, as
    (number, x_of_number, y_centre, confidence, raw token)."""
    if d is None:
        return []

    out = []
    for i, raw in enumerate(d["text"]):
        t = (raw or "").strip()
        if not t:
            continue
        try:
            conf = float(d["conf"][i])
        except (TypeError, ValueError):
            continue
        if conf < 0:
            continue
        m = _ITEM_TOKEN.search(t)
        if not m:
            continue
        # "FALSE26." and "D14." happen where the handwriting touches the
        # number. Keep them: the digits are still the item number. Estimate
        # the number's own x from the share of the token it occupies.
        tail = t[m.start(1):]
        x_num = d["left"][i] + int(d["width"][i] * (1.0 - len(tail) / len(t)))
        y_mid = d["top"][i] + d["height"][i] / 2.0
        out.append((int(m.group(1)), x_num, y_mid, conf / 100.0, t))
    return sorted(out, key=lambda r: (r[2], r[1]))


def _longest_ascending(rows: list) -> list:
    """Keep the longest strictly ascending run of item numbers in page order.

    Item numbers ascend down the page. That is a property of the document, not
    a tuned threshold, and it is what removes the rest:

      MEASURED on page 1, the raw tokens are
          101, 22, 1, 8, 2, 8, 3, 8, 4, 8, 5, 6, 7, 8, 9, 10, 11
      "101" is the "English 101:" heading, "22" is the date "Oct. 22, 2026",
      and each stray "8" is an option label "B." that Tesseract read as "8.".
      The ascending run is 1..11 exactly, and every intruder is dropped.
    """
    nums = [r[0] for r in rows]
    tails: list[int] = []
    tail_idx: list[int] = []
    prev = [-1] * len(nums)
    for i, v in enumerate(nums):
        j = bisect.bisect_left(tails, v)
        if j == len(tails):
            tails.append(v)
            tail_idx.append(i)
        else:
            tails[j] = v
            tail_idx[j] = i
        prev[i] = tail_idx[j - 1] if j else -1
    keep: list[int] = []
    k = tail_idx[-1] if tail_idx else -1
    while k != -1:
        keep.append(k)
        k = prev[k]
    return [rows[i] for i in reversed(keep)]


def _fill_gaps(rows: list) -> dict[int, float]:
    """Interpolate a missing item number only where the gap's own pitch is
    corroborated by the segment immediately before or after it.

    A wrong anchor is worse than a missing one. A missing number leaves its
    item blank; a wrong one hands that slot somebody else's answer. So a gap
    that spans a part boundary is left alone and the counting rule in
    `assign_to_items` deals with it instead.
    """
    out = {r[0]: r[2] for r in rows}
    if len(rows) < 3:
        return out

    seg: list[Optional[float]] = []
    for k in range(len(rows) - 1):
        dn = rows[k + 1][0] - rows[k][0]
        dy = rows[k + 1][2] - rows[k][2]
        seg.append(dy / dn if dn > 0 and dy > 0 else None)

    for k, pitch in enumerate(seg):
        if pitch is None or rows[k + 1][0] - rows[k][0] <= 1:
            continue
        nbrs = [seg[j] for j in (k - 1, k + 1) if 0 <= j < len(seg) and seg[j]]
        if not any(abs(pitch - nb) <= PITCH_TOLERANCE * nb for nb in nbrs):
            continue
        n0, y0 = rows[k][0], rows[k][2]
        for miss in range(n0 + 1, rows[k + 1][0]):
            out.setdefault(miss, y0 + pitch * (miss - n0))
    return out


def find_item_numbers(d) -> dict[int, float]:
    """{item_number: y} for every item number printed on the page.

    Takes the shared `read_page_text` result, not the image, so the page is
    read once.
    """
    raw = _raw_tokens(d)
    if len(raw) < 2:
        return {}
    ladder = _fill_gaps(_longest_ascending(raw))
    print(f"DEBUG[item_numbers]: {len(ladder)} items -> {sorted(ladder)}")
    return ladder


def assign_to_items(ladder: dict[int, float], detections: list[DetectedAnswer],
                    text_h: float) -> tuple[dict[int, DetectedAnswer], list[DetectedAnswer]]:
    """Put each detection in the slot of the item number it sits under.

    Returns ({item_number: DetectedAnswer}, detections that belong to no item).

    A detection ABOVE the first item number belongs to no item and is dropped.
    MEASURED on page 1, that silently removes all three of the header's
    phantoms - the circle the encircled detector finds in "ANSWER KEY" at
    0.96 confidence, and the two answer lines the identification detector
    finds in the Name/Date rules - without a single rule written about them.
    """
    if not ladder:
        return {}, list(detections)

    items = sorted(ladder.items(), key=lambda kv: kv[1])
    tol = BELOW_TOLERANCE_TEXT_HEIGHTS * text_h
    slots: dict[int, DetectedAnswer] = {}
    orphans: list[DetectedAnswer] = []

    for det in sorted(detections, key=lambda a: (a.y, a.x)):
        owner = None
        for n, y in items:
            if y <= det.y + tol:
                owner = n
            else:
                break
        if owner is None or owner in slots:
            orphans.append(det)
            continue
        slots[owner] = det

    # An item number the OCR could not read leaves a hole between two anchors.
    # If the hole is m items wide and exactly m unclaimed detections fall
    # inside it, the numbering is forced. This is counting, not a threshold.
    #
    # MEASURED on page 2: items 14, 15, 17 and 18 are never read as tokens,
    # because the handwritten answer touches the number ("D14."). Their four
    # detections fall between anchors 13/16 and 16/19, two in each gap, and
    # the rule recovers all four.
    numbers = sorted(ladder)
    for a, b in zip(numbers, numbers[1:]):
        missing = [n for n in range(a + 1, b) if n not in slots]
        if not missing:
            continue
        inside = [o for o in orphans if ladder[a] < o.y <= ladder[b]]
        if len(inside) != len(missing):
            continue
        for n, det in zip(missing, sorted(inside, key=lambda a: (a.y, a.x))):
            slots[n] = det
            orphans.remove(det)
        print(f"DEBUG[item_numbers]: recovered {missing} by counting")

    return slots, orphans