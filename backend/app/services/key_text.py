"""Parser for an enumerated answer-key image's OCR text."""
from __future__ import annotations
import re
from dataclasses import dataclass, field
from typing import List, Optional, Sequence

TRUE_WORDS  = ("TRUE", "T")
FALSE_WORDS = ("FALSE", "F")

# ONE ITEM, found ANYWHERE in a line. Scanned with finditer rather than
# matched at the start, because a two-column key comes back from tesseract as
# "1.C 21.A" on a single line - MEASURED, and reading only the first pair
# found 20 of 40 answers on a 40-item sheet.
#
# THE COMMA IS LOAD-BEARING. Tesseract reads a printed "1." as "1," on
# handwritten sheets constantly - 8 of 20 lines on the real T/F key.
#
# THE SPACE AFTER THE SEPARATOR IS OPTIONAL. A printed "1. C" comes back as
# "1.C"; requiring whitespace there found ZERO items on every letter key.
PAIR_RE = re.compile(
    r"(?:(?<=\s)|^)[\(\[]?(\d{1,3})\s*(?:[.,):\-\]]\s*|\s+)([^\s]+)")

# The number itself did not read: "g, RUE" (handwritten 6) or "B)A" (printed
# 8 read as B). The character is NOT decoded - the number comes from POSITION,
# which is exact, where guessing at the glyph is not.
BADNUM_RE = re.compile(r"^\s*([0-9A-Za-z]{1,3})\s*[.,):\-\]]\s*(\S.*)$")

# "4A" - the separator was dropped too. Only safe when the WHOLE line is a
# number and one or two letters, which is a letter key and nothing else.
TIGHT_RE = re.compile(r"^\s*(\d{1,3})\s*([A-Za-z]{1,2})\s*$")


@dataclass
class KeyItem:
    question_number: int
    answer: str
    raw: str
    confident: bool = True
    note: str = ""


@dataclass
class ParseResult:
    items: List[KeyItem] = field(default_factory=list)
    skipped: List[str] = field(default_factory=list)
    problems: List[str] = field(default_factory=list)


def _levenshtein(a: str, b: str) -> int:
    if a == b: return 0
    if not a: return len(b)
    if not b: return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def _closest(token: str, words: Sequence[str], max_dist: int) -> Optional[str]:
    best, best_d = None, max_dist + 1
    for w in words:
        d = _levenshtein(token, w)
        if d < best_d:
            best, best_d = w, d
    return best if best_d <= max_dist else None


def normalise(token: str, mode: str) -> tuple[str, bool, str]:
    """(answer, confident, note). `mode` is 'letter', 'truefalse' or 'free'."""
    t = re.sub(r"[^A-Za-z0-9]", "", token).upper()
    if not t:
        return "", False, "nothing readable"

    if mode == "truefalse":
        if t in TRUE_WORDS:  return "TRUE", True, ""
        if t in FALSE_WORDS: return "FALSE", True, ""
        # Tesseract reads handwriting as RUE / TEVE / FALSF / FAUEA. Allow a
        # distance of 2 - enough for one dropped and one swapped character,
        # not enough to turn TRUE into FALSE (distance 4).
        hit = _closest(t, ("TRUE", "FALSE"), 2)
        if hit:
            return hit, False, f'read as "{token.strip()}"'
        # A trailing capital from the statement column ("FAUEA" = FALSE + A).
        for w in ("TRUE", "FALSE"):
            if t.startswith(w[:3]) and _levenshtein(t[:len(w)], w) <= 2:
                return w, False, f'read as "{token.strip()}"'
        return t, False, f'not TRUE or FALSE: "{token.strip()}"'

    if mode == "letter":
        if len(t) == 1 and t in "ABCDE":
            return t, True, ""
        if t and t[0] in "ABCDE":
            return t[0], False, f'read as "{token.strip()}"'
        # 0/O, 1/I, 8/B, 5/S are the usual single-character confusions.
        sub = {"0": "D", "O": "D", "1": "A", "I": "A", "8": "B", "5": "S", "6": "G"}
        if t and t[0] in sub and sub[t[0]] in "ABCDE":
            return sub[t[0]], False, f'read as "{token.strip()}"'
        return t, False, f'not a letter A-E: "{token.strip()}"'

    return token.strip(), True, ""


def parse_key_text(text: str, mode: str = "auto", max_items: int = 500) -> ParseResult:
    """OCR text -> numbered answers.

    THE NUMBERING IS THE STRONGEST SIGNAL. Keys run 1..N in order, so a line
    whose number will not parse is recovered from its POSITION rather than by
    guessing at the digit. MEASURED on the real T/F key: tesseract read item
    6's number as "g"; position recovers it exactly, digit-guessing cannot.
    """
    lines = [ln for ln in (text or "").splitlines() if ln.strip()]
    if mode == "auto":
        mode = _detect_mode(lines)

    res = ParseResult()
    expected = 1
    for ln in lines:
        found = [(int(m.group(1)), m.group(2), False)
                 for m in PAIR_RE.finditer(ln)]
        if not found:
            m = TIGHT_RE.match(ln)
            if m:
                found = [(int(m.group(1)), m.group(2), False)]
            else:
                m = BADNUM_RE.match(ln)
                tok = (m.group(2).split()[0] if m and m.group(2).split() else "")
                # Only a line that HAS a separator AND whose next token reads
                # as an answer becomes an item. Otherwise a wrapped statement
                # line ("tense.") would turn into a phantom answer.
                if m and tok and normalise(tok, mode)[0]:
                    found = [(None, tok, True)]
        if not found:
            res.skipped.append(ln.strip())
            continue

        for num, token, recovered in found:
            if num is None:
                num = expected
            if not 1 <= num <= max_items:
                res.skipped.append(ln.strip())
                continue
            answer, confident, note = normalise(token, mode)
            if not answer:
                res.skipped.append(ln.strip())
                continue
            if recovered:
                confident = False
                note = (note + "; " if note else "") + \
                       "item number unreadable, taken from its position"
            res.items.append(KeyItem(num, answer, ln.strip(), confident, note))
            expected = num + 1

    # A two-column sheet arrives interleaved (1, 21, 2, 22, ...). Sorting here
    # means the ORDER of the scan never has to be the order of the key.
    res.items.sort(key=lambda i: i.question_number)
    _check_sequence(res)
    return res


def _detect_mode(lines: Sequence[str]) -> str:
    joined = " ".join(lines).upper()
    tf = len(re.findall(r"\b(TRUE|FALSE)\b", joined))
    if tf >= max(2, len(lines) // 3):
        return "truefalse"
    letters = 0
    for ln in lines:
        for m in PAIR_RE.finditer(ln):
            tok = re.sub(r"[^A-Za-z]", "", m.group(2))
            if len(tok) == 1 and tok.upper() in "ABCDE":
                letters += 1
    return "letter" if letters >= max(2, len(lines) // 3) else "free"


def _check_sequence(res: ParseResult) -> None:
    nums = [i.question_number for i in res.items]
    if not nums:
        res.problems.append("No numbered answers were found in this image.")
        return
    seen, dupes = set(), []
    for n in nums:
        if n in seen: dupes.append(n)
        seen.add(n)
    if dupes:
        res.problems.append("Item(s) read twice: " + ", ".join(map(str, sorted(set(dupes)))))
        # MEASURED on the project's own encircled multiple-choice key: a
        # QUESTIONNAIRE page read by this parser returns question words as
        # answers ("If", "what", "Solve") and repeats most item numbers,
        # because "1." appears in the question AND in the options. Heavy
        # duplication is that signature, and the honest thing is to name the
        # mistake rather than let a teacher correct 38 nonsense rows by hand.
        if len(set(dupes)) >= max(3, len(set(nums)) // 5):
            res.problems.append(
                "This looks like a questionnaire page rather than a list of "
                "answers. Upload a picture of the answers only - \"1. A\", "
                "\"2. B\", one per line - or use Regenerate to read the "
                "questionnaire instead."
            )
    gaps = [n for n in range(1, max(nums) + 1) if n not in seen]
    if gaps:
        res.problems.append("Item(s) missing: " + ", ".join(map(str, gaps)))
    if min(nums) != 1:
        res.problems.append(f"The list starts at item {min(nums)}, not 1.")