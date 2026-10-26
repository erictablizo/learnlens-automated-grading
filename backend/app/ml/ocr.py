"""
app/ml/ocr.py — Main OCR Router
================================
Routes an image to the right detector:
  "encircled"      → Multiple Choice (circled A/B/C/D)   → ocr_encircled
  "true_false"     → True/False (written T/F)            → ocr_true_false
  "written_letter" → a LETTER written on a blank         → ocr_written_letter   NEW 2026-10-23
  "identification" → a WORD written on an answer line     → ocr_identification   NEW 2026-10-23
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
    Part IV   items 19-24  identification (a word)
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
from app.ml.ocr_identification import ocr_page_identification
from app.ml.ocr_item_numbers import (read_page_text, find_item_numbers,
                                     assign_to_items, page_alphabet)

QUESTION_TYPES = ("encircled", "true_false", "written_letter", "identification", "mixed")

# "mixed" is not told which blank belongs to which part, so every short blank
# on the page is read with ONE alphabet: A-F covers a matching-type key, T
# covers TRUE, F covers both FALSE and the letter F. See ocr_page_mixed.
MIXED_LETTERS = "ABCDEFT"

# Fewer answer lines than this is not treated as an identification part in
# "mixed" - a two-rule "Name: ____ Date: ____" header is the same shape.
MIXED_MIN_IDENT_LINES = 3


def mixed_alphabet(letters: Optional[str] = None) -> str:
    """The alphabet `mixed` reads short blanks with.

    MEASURED 2026-10-24, why this cannot be one constant. On Doc Rubrica's
    page 1 (Part I, options A-D only) and page 2 (Part III A-F + Part V T/F),
    `ocr_page_written_letter` scores:

                 page 1 blanks        page 2 blanks
        ABCD        3/6, 2 left blank    3/12
        ABCDT       3/6, 2 left blank    8/12
        ABCDEF      3/6, 2 read as "E"   5/12
        ABCDEFT     3/6, 2 read as "E"  10/12

    Page 2 needs E, F and T. Page 1 must NOT have E or F: items 1 and 6 are
    unreadable either way, and a wider alphabet does not read them correctly,
    it only fills them with an "E" that Part I never offered. Same score,
    worse key - a teacher can see an empty slot, but an "E" on a four-option
    item looks like an answer.

    So a caller that knows the page's options should narrow it. T is always
    kept, because dropping it is what made every written letter read as "F".
    """
    base = (letters or "").strip().upper() or MIXED_LETTERS
    return base if "T" in base else base + "T"


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
    if q in ("identification", "identify", "ident", "id", "fill_in_the_blank",
             "fill_in_blank", "fill_in_blanks", "short_answer", "word"):
        return "identification"
    return q


def infer_question_type(answers: Iterable[str]) -> str:
    """Work out how a paper must be read from the answer key of its page:
    all T/F -> 'true_false', all A-D -> 'encircled', a bit of both -> 'mixed'.

    NOTE 2026-10-23: this cannot distinguish 'encircled' from 'written_letter',
    because both store a bare letter. When a page was generated with declared
    parts, the paper must be checked with those same parts rather than with
    this guess - see ocr_page_parts().

    An answer longer than one character and not TRUE/FALSE can only have come
    from identification, so that one IS recoverable.
    """
    vals = [a.strip().upper() for a in answers if a and a.strip()]
    if not vals:
        return "encircled"
    tf = [v for v in vals if v in ("T", "F", "TRUE", "FALSE")]
    mc = [v for v in vals if v in ("A", "B", "C", "D")]
    if any(len(v) > 1 and v not in ("TRUE", "FALSE") for v in vals):
        return "identification"
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
    expected_lines: Optional[int] = None,
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
    if qt == "identification":
        return ocr_page_identification(image_path, expected_items=expected_items,
                                       keep_blanks=keep_blanks,
                                       expected_lines=expected_lines)
    if qt == "mixed":
        # An explicit alphabet from the caller wins; the plain "ABCD" default
        # means "not stated" and leaves mixed on its own wider alphabet.
        return ocr_page_mixed(image_path, expected_items=expected_items,
                              keep_blanks=keep_blanks,
                              letters=(None if letters == DEFAULT_LETTERS else letters))
    return OCRPageResult(
        image_path=image_path, answers=[], mean_conf=0.0,
        error=(f"Unknown question type '{question_type}'. Use 'encircled', "
               "'written_letter', 'identification', 'true_false' or 'mixed'."),
    )


def ocr_page_numbered(image_path: str, keep_blanks: bool = False,
                      letters: Optional[str] = None) -> Optional[OCRPageResult]:
    """Read a page using the item numbers PRINTED on it.

    Returns None when the page carries no readable ladder of item numbers, so
    the caller can fall back to merging by position.

    NEW 2026-10-24. This is the answer to "detection should be based on the
    structure of the exam in the image". The three detectors still answer
    "what is written here"; `ocr_item_numbers` answers "which item is this",
    and an item nobody can read becomes an empty slot at its own number
    instead of pulling every later item up by one.

    MEASURED on the two pages of exam 118:

                                  page 1          page 2
        slots produced            11 (items 1-11) 19 (items 12-30)
        answers correct            8              15
        header phantoms dropped    3               0

        the old merge              9 answers      19 answers numbered 10-28
        declared parts             8/11           16/19, after declaring 6 ranges

    Page 2 is the point. The old merge numbered it from 10 because page 1 came
    up two short; here page 2 says 12-30 itself and page 1 cannot affect it.
    """
    from app.ml.ocr_shared import load_gray, ink_mask, estimate_text_height

    try:
        gray, _ = load_gray(image_path)
        ink = ink_mask(gray)
        text_h = estimate_text_height(ink)
    except Exception:
        return None

    page_text = read_page_text(gray)
    ladder = find_item_numbers(page_text)
    if len(ladder) < 2:
        return None

    # The page says which letters it can contain. A caller that states an
    # alphabet still wins; "not stated" now means "ask the page" rather than
    # "assume A-F".
    alphabet = (mixed_alphabet(letters) if letters
                else page_alphabet(page_text, fallback=MIXED_LETTERS))
    mc    = ocr_page_encircled(image_path)
    ident = ocr_page_identification(image_path, keep_blanks=False)
    wl    = ocr_page_written_letter(image_path, keep_blanks=False, letters=alphabet)

    dets = [a for a in list(mc.answers) + list(ident.answers) + list(wl.answers)
            if a.letter]
    slots, orphans = assign_to_items(ladder, dets, text_h)

    # The counting rule in assign_to_items recovers items whose printed
    # number was never read as a token ("D14.", "FALSE26."), so the slots can
    # hold numbers the ladder does not. Walk the union or those rows vanish -
    # MEASURED, that dropped items 14, 15, 17 and 18 of page 2.
    answers: list[DetectedAnswer] = []
    for n in sorted(set(ladder) | set(slots)):
        det = slots.get(n)
        if det is None:
            # The slot is kept whatever `keep_blanks` says, which is the one
            # place in this package that ignores it - CHANGED 2026-10-26, and
            # deliberate. Everywhere else the flag decides whether a blank
            # shifts its neighbours; here nothing can shift, because the row
            # carries the item number PRINTED on the page. Both callers then
            # get what they need: generate_answer_key drops blanks itself with
            # `if a.letter`, and grade_paper matches on item_number, so an
            # unanswered item counts as unanswered instead of vanishing.
            answers.append(DetectedAnswer(y=int(ladder.get(n, 0)), x=0, letter="",
                                          confidence=0.0, size=int(text_h),
                                          item_number=n))
            continue
        det.item_number = n
        answers.append(det)

    answered = [a for a in answers if a.letter]
    if not answered:
        return None

    warn = None
    blanks = [a.item_number for a in answers if not a.letter]
    if blanks:
        warn = (f"{len(blanks)} item(s) could not be read and were left blank: "
                + ", ".join(str(n) for n in blanks) + ".")
    mean_conf = round(sum(a.confidence for a in answered) / len(answered), 2)
    print(f"DEBUG[numbered]: items {min(ladder)}-{max(ladder)}, "
          f"{len(answered)} read, {len(blanks)} blank, "
          f"{len(orphans)} detection(s) outside every item")
    return OCRPageResult(image_path=image_path, answers=answers,
                         mean_conf=mean_conf, warning=warn)


def ocr_page_mixed(image_path: str, expected_items: Optional[int] = None,
                   keep_blanks: bool = False,
                   letters: Optional[str] = None) -> OCRPageResult:
    """
    One page that holds items of DIFFERENT mechanics, read without the teacher
    declaring where each part starts.

        Part I   items 1-6    letter written on a blank
        Part II  items 7-12   letter encircled
        Part III items 13-18  letter written on a blank (A-F)
        Part IV  items 19-24  a word written on an answer line
        Part V   items 25-30  TRUE/FALSE written on a blank

    Three detectors run over the page and their answers are merged in reading
    order, so item numbers stay 1..N across every part. A detection that sits
    on the same line as a circled answer is dropped, so no item is counted
    twice.

    REWRITTEN 2026-10-24 — it used to run only `ocr_page_encircled` and
    `ocr_page_true_false`. Every blank with no circle on its line therefore
    went to a classifier whose alphabet is {T, F}, so Doc Rubrica's Part I,
    Part III and Part IV all came back as runs of "F", and Part IV's six
    answer lines were found by neither detector, which pushed every Part V
    answer six item numbers up the key. MEASURED on her two pages:

                             page 1 (11 items)   page 2 (19 items)
        encircled + tf              5/11               2/19
        encircled + identification
          + written_letter          7/11              15/19
        ocr_page_parts (declared)   8/11              16/19

    Why these three, and not the True/False detector:

    * A CIRCLE is geometric and unambiguous, so `ocr_page_encircled` keeps
      first claim on any line it finds one.
    * An ANSWER LINE is geometric too: 8+ text-heights long and 15:1 thin,
      where a T/F blank is 6.6x and a letter blank 4.9x. So Part IV can be
      pulled out by shape alone and no longer vanishes.
    * A SHORT BLANK is where the ambiguity actually lives. "B on a blank" and
      "F on a blank" are the same shape; only the part number says which
      alphabet applies, and that is what this function is not told. So every
      short blank is read ONCE with the union alphabet `MIXED_LETTERS`
      ("ABCDEFT") instead of twice with two narrow ones.

    Cost of the union alphabet, stated rather than hidden. On her Part V,
    `classify_tf` reads T F T T T T (6/6); the union alphabet reads
    T D T T T T (5/6) — item 26's FALSE comes back as "D" at 0.41. On her
    Part I the position is reversed: `classify_tf` gets 0/6 and the union
    alphabet 3/6. Across both parts it is 8/12 against 6/12, so the union
    wins, and it loses one real True/False item to do it.

    REJECTED 2026-10-24, measured: "re-read the blank with `classify_tf` when
    the union read is weak (<0.50) and the T/F read is strong (>0.90)". It
    does fix item 26 (D@0.41 -> F@0.95) and it breaks Part I item 3 by the
    same rule (D@0.41 -> F@0.99, truth D). Net zero, so the extra pass is not
    worth its cost.

    REJECTED 2026-10-24, measured: arbitrating the two narrow classifiers by
    confidence. On written letters `classify_tf` returns F at 0.98-0.99 while
    `classify_letter` returns the correct letter at 0.41-0.96, so "most
    confident wins" still answers F on five of six.

    KNOWN LIMITATION. An identification column of fewer than
    MIXED_MIN_IDENT_LINES lines is ignored here, because a two-rule
    "Name: ____  Date: ____" header and a two-item identification part are the
    same shape, and `_find_answer_lines` can only check the even-pitch rule
    from three lines up. On page 1 that header does produce a two-line column
    which would otherwise be read as two phantom word answers. A mixed page
    with a one- or two-item identification part needs `ocr_page_parts`.

    This function stays a FALLBACK. `ocr_page_parts()` is better on both pages
    because the y-cursor lets a part reject a detection that lies outside its
    band — which is how it discards the phantom circle this page's header
    produces at y=184, and how it keeps Part III's letters apart from Part V's
    without a shared alphabet. Use declared parts whenever the teacher has
    told the system where the parts are.
    """
    from app.ml.ocr_shared import limit_to_expected

    # The page's own item numbers beat anything this function can infer from
    # the order of detections. Only when they cannot be read does the old
    # position-based merge below run.
    numbered = ocr_page_numbered(image_path, keep_blanks=keep_blanks, letters=letters)
    if numbered is not None:
        return numbered

    alphabet = mixed_alphabet(letters)

    mc    = ocr_page_encircled(image_path)
    ident = ocr_page_identification(image_path, keep_blanks=keep_blanks)
    wl    = ocr_page_written_letter(image_path, keep_blanks=keep_blanks,
                                    letters=alphabet)

    words = ident.answers if len(ident.answers) >= MIXED_MIN_IDENT_LINES else []
    if ident.answers and not words:
        print(f"DEBUG[mixed]: ignoring {len(ident.answers)} answer-line "
              f"detection(s) - too few to tell from a page header")

    answers = [a for a in mc.answers if a.letter]
    sizes = [a.size for a in answers if a.size]
    line_tol = (0.6 * (sum(sizes) / len(sizes))) if sizes else 30.0
    for pool in (words, wl.answers):
        for a in pool:
            if any(abs(a.y - m.y) <= line_tol for m in answers):
                continue                  # same line as a circle -> already counted
            answers.append(a)
    answers.sort(key=lambda a: (a.y, a.x))

    if not answers:
        return OCRPageResult(
            image_path=image_path, answers=[], mean_conf=0.0,
            error=(mc.error or wl.error or ident.error or
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
        mine = [p for p in ordered if normalize_question_type(p.question_type) == qt]
        letters = next((p.letters for p in mine), DEFAULT_LETTERS)
        # How many items of this type the teacher declared on this page. The
        # identification finder uses it to reject a column of printed rules
        # that is nothing like that many lines - without it, the Name/Date
        # rules in a page header read as two phantom answers.
        declared = sum(p.count for p in mine)
        res = ocr_page(image_path, question_type=qt, keep_blanks=keep_blanks,
                       letters=letters, expected_lines=declared)
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
    "ocr_page", "ocr_page_mixed", "ocr_page_numbered", "mixed_alphabet", "ocr_page_parts", "PagePart", "PartsResult",
    "infer_question_type", "normalize_question_type", "QUESTION_TYPES",
    "DetectedAnswer", "OCRPageResult", "setup_tesseract",
]