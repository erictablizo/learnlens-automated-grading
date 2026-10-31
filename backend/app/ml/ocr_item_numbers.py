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
# CHANGED 2026-10-31. The class was [A-F], which is why exam 8's Column B
# running to H could not be read: "G." and "H." were not labels at all. Any
# letter matches now, and option_labels below keeps only the contiguous run
# from A, so a stray "Part V." cannot widen the alphabet.
_OPTION_LABEL = re.compile(r"^([A-Z])\s*[.)]$")

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

# How far below the last item number read on a page its own answer may sit,
# in ladder pitches. A wrapped question pushes its options down; 2.16 is the
# largest measured. See the end-of-ladder rescue in assign_to_items.
END_TAIL_PITCHES = 2.5


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


def option_labels(d) -> set:
    """Every option label ("A.", "B.", ...) PRINTED on the page.

    Split out of page_alphabet 2026-10-28 so the same one pass can also answer
    "does this page offer options at all", which is what decides whether a
    circle detection means anything. See ocr_page_numbered.
    """
    out: set = set()
    if d is None:
        return out
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
        out.add(m.group(1))
    # CHANGED 2026-10-31. _OPTION_LABEL now accepts any letter, so "Part V."
    # matches it - MEASURED on key_p2 and paper_p2, both of which produce a
    # stray 'V'. The printed options of a real question run A, B, C, ... with
    # no gaps, so walk up from A and stop at the first letter the page does
    # not print. The stray has no G..U beneath it and is dropped; a genuine
    # Column B running to H survives whole.
    #
    # This belongs here and not in page_alphabet because ocr_page_numbered
    # asks `bool(option_labels(...))` whether the page offers options at all.
    # A True/False sheet headed "Part V." must still answer no, or the
    # 2026-10-28 NO_OPTION_LETTERS fix is undone.
    run: set = set()
    for ch in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
        if ch not in out:
            break
        run.add(ch)
    return run


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
    seen = option_labels(d)
    if not seen:
        return fallback
    top = max(seen)
    # CHANGED 2026-10-31. The slice source used to be "ABCDEF", so a Column B
    # running to H silently came back as ABCDEF - "ABCDEF"[:8] is "ABCDEF" -
    # and G and H could never be read. `seen` is already the contiguous run
    # from A (see option_labels), so this cannot widen past what is printed.
    alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[: ord(top) - ord("A") + 1]
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
        out.append((int(m.group(1)), x_num, y_mid, conf / 100.0, t,
                    d["left"][i], d["height"][i]))

    # A number inside the question's own TEXT matches this pattern just as
    # well as an item number does, and on one row it can outnumber the real
    # one three to one.
    #
    # MEASURED 2026-10-28 on a 12-item multiple-choice answer key. Item 4 is
    # "If a triangle has sides 3, 4, and 5, it is:" - which yields "3," "4,"
    # and "5," at x = 386, 409 and 477, on the same row as item 4's own "4."
    # at x = 147. The false "3," sits at y=494, six pixels above item 4's
    # number and 78 below the real "3." at y=416, and the ascending-run rule
    # cannot choose between two ladders of equal length. It took the false
    # one, so item 3's circled C at y=439 had no anchor above it, was
    # discarded as an orphan, and the item vanished from the key - which is
    # how it was reported. The date's "12," and item 1's "+ 1," are the same
    # thing, and were already harmless only by luck of where they sit.
    #
    # The rule is therefore NOT "an item number starts its line".
    #
    # REJECTED 2026-10-28, measured: that stricter rule, in both forms - the
    # leftmost word of its Tesseract line, and the leftmost word of its
    # geometric row. Both delete her English 101 items 1 to 6, because on her
    # sheet the answer blank is printed to the LEFT of the item number, and
    # both keep the stray "8." that is really an option label "B.". It cost
    # her page 1 six of its eleven items and cost the True/False key its item
    # 1 - MEASURED, 11 items -> 5, and 116/120 -> 115/120.
    #
    # What holds instead: of two item-number-shaped tokens on the SAME ROW,
    # only the leftmost can be the item number. That cannot remove a real
    # item number unless two items share a row, which a numbered single
    # column cannot do, and it needs no threshold beyond "same row".
    kept = []
    for a in out:
        if any(b is not a and b[5] < a[5]
               and abs(b[2] - a[2]) <= 0.6 * max(a[6], b[6])
               for b in out):
            continue                      # an item number is already to its left
        kept.append(a[:5])
    return sorted(kept, key=lambda r: (r[2], r[1]))


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


def assign_to_items(ladder: dict[int, float], groups, text_h: float
                    ) -> tuple[dict[int, DetectedAnswer], list[DetectedAnswer]]:
    """Put each detection in the slot of the item number it sits under.

    `groups` is a list of detection LISTS in PRIORITY order, most specific
    detector first; a plain flat list is still accepted and treated as one
    group. Returns ({item_number: DetectedAnswer}, detections with no item).

    A detection ABOVE the first item number belongs to no item and is dropped.
    MEASURED on page 1, that silently removes all three of the header's
    phantoms - the circle the encircled detector finds in "ANSWER KEY" at
    0.96 confidence, and the two answer lines the identification detector
    finds in the Name/Date rules - without a single rule written about them.

    CHANGED 2026-10-26 - priority, after a real paper lost a correct answer.
    Two detections can land on the same item, and the merged list used to be
    sorted by position alone, so which one won was arbitrary. MEASURED on
    Ben Alcantara's page 2:

        CIRCLES  ('A', y=1135, conf 0.40)   ('D', y=1277, conf 0.32)
        WORDS    VERB y=1152                THESISSTATEMENT y=1287

    The circle detector fits circles to the round letters of the handwriting
    in Part IV, and the phantom "A" took item 21 from "VERB". The genuine
    circle at item 12 was not found at all on that copy.

    So the ranking is by how much STRUCTURE a detector needs before it will
    fire, which is a property of the detectors, not a tuned number:

      identification  a printed rule 8+ text-heights long and 15:1 thin,
                      in a column of its own
      encircled       a Hough circle, which can fit any round handwriting
      written_letter  a short blank, the weakest shape of the three

    A phantom circle can still take an item nothing else claims. It cannot
    take one from a word.
    """
    if not ladder:
        flat = [d for g in groups for d in g] if groups and isinstance(groups[0], list) else list(groups)
        return {}, flat
    if not (groups and isinstance(groups[0], list)):
        groups = [list(groups)]

    items = sorted(ladder.items(), key=lambda kv: kv[1])
    tol = BELOW_TOLERANCE_TEXT_HEIGHTS * text_h

    # How far below its own anchor a detection may still be claimed by it.
    #
    # CHANGED 2026-10-26, second fault found on the same paper. A detection
    # took "the last anchor at or above it" with no upper bound, so when an
    # item number was missing from the ladder the detection BELONGING to that
    # item reached back and took the previous one. MEASURED on Ben's page 2,
    # whose ladder is [... 17, 18, 20 ...] with 19 absent: the word
    # COMMUNICATION (item 19) claimed item 18, item 18's own "F" then found
    # 18 occupied and fell through to the counting rule, which put it in 19.
    # Both answers were real, both ended up one slot out.
    #
    # Between CONSECUTIVE numbers nothing can be hiding, so the reach stays
    # unbounded - an encircled answer sits well below its question. Across a
    # gap that skips numbers the reach is one implied item pitch, so a
    # detection cannot cross a number that is missing. It is left unclaimed
    # and the counting rule below places it.
    reach: dict[int, float] = {}
    for (n, y), (n2, y2) in zip(items, items[1:]):
        reach[n] = (y2 - y) / (n2 - n) if n2 - n > 1 else float("inf")

    slots: dict[int, DetectedAnswer] = {}
    orphans: list[DetectedAnswer] = []

    for group in groups:
        for det in sorted(group, key=lambda a: (a.y, a.x)):
            # The NEAREST anchor above is the only candidate. Testing the
            # reach inside this loop was wrong - FIXED 2026-10-26 after it
            # cost two items on a real paper. When the nearest anchor failed
            # the test the scan carried on to earlier ones, and `reach` is
            # infinite between consecutive numbers, so the detection fell
            # back one item FURTHER away instead of being left alone:
            # COMMUNICATION, rejected by item 18, took item 17.
            owner = None
            for n, y in items:
                if y <= det.y + tol:
                    owner = n
                else:
                    break
            if owner is not None and \
                    det.y - ladder[owner] > reach.get(owner, float("inf")) + tol:
                owner = None          # would cross a missing number
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

    # The counting rule above pairs each anchor with the NEXT one, so it can
    # only ever see a hole BETWEEN two numbers it read. An item whose number
    # is the first or the last one on the page has no such pair, and its
    # detection is simply dropped - the item does not even appear as an empty
    # slot, because ocr_page_numbered walks `set(ladder) | set(slots)`.
    #
    # REPORTED 2026-10-29 on a 30-item multiple-choice exam across three
    # pages: the key ran 1-9, then 11-19, then 20-29. Item 10 is the first on
    # page 2 and item 30 the last on page 3 - precisely the two positions this
    # blind spot covers, and the only two items lost.
    #
    # The ladder's own pitch says where the missing number would have been.
    # One item is recovered at each end, and only when EXACTLY ONE unclaimed
    # detection lies in that item's band, so a page with several strays is
    # left alone rather than guessed at.
    #
    # The bands are not symmetric, and the measurement is why. Above the first
    # anchor the window is one pitch: a detection sits BELOW its own number,
    # so item n0-1's answer lies between where its number would be and n0's.
    # Below the last anchor the window runs from one pitch to 2.5, because the
    # last question's text can wrap and push its options further down - on the
    # World Literature sheet item 10's circle sits 2.16 pitches below item 9.
    #
    # MEASURED 2026-10-29 over thirteen real scans, deleting the first and
    # then the last anchor of each (26 trials):
    #
    #     recovered in the right slot        24
    #     left empty, as today               2
    #     FILLED WITH THE WRONG ANSWER       0
    #     intact ladders changed at all      0
    #
    # The two it leaves alone are her English 101 page 2 and its paper, where
    # the first anchor is a header artifact and the real gap is five pitches
    # wide. Leaving those empty is the behaviour we already have.
    #
    # The "intact ladders changed: 0" row is the one that matters most: this
    # cannot invent an item on a page that has no hole, because a slot is only
    # filled when its number is absent from the ladder entirely.
    if len(items) >= 2 and orphans:
        (n0, y0), (n1, y1) = items[0], items[1]
        (nP, yP), (nL, yL) = items[-2], items[-1]
        p0 = (y1 - y0) / float(n1 - n0) if n1 > n0 else 0.0
        pL = (yL - yP) / float(nL - nP) if nL > nP else 0.0

        if p0 > 0 and n0 > 1 and (n0 - 1) not in slots:
            band = [o for o in orphans if y0 - p0 < o.y < y0]
            if len(band) == 1:
                slots[n0 - 1] = band[0]
                orphans.remove(band[0])
                print(f"DEBUG[item_numbers]: recovered item {n0 - 1} above the "
                      f"first number read on this page")

        if pL > 0 and (nL + 1) not in slots:
            band = [o for o in orphans
                    if yL + pL < o.y < yL + END_TAIL_PITCHES * pL]
            if len(band) == 1:
                slots[nL + 1] = band[0]
                orphans.remove(band[0])
                print(f"DEBUG[item_numbers]: recovered item {nL + 1} below the "
                      f"last number read on this page")

    return slots, orphans