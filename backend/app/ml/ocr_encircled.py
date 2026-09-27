"""
app/ml/ocr_encircled.py — Multiple Choice (Encircled) OCR
==========================================================

Detects hand-drawn circles around A/B/C/D and reads the letter inside.

FIX 2026-09-22 — "Answer key shows 16 answers but the sheet only has 12"
------------------------------------------------------------------------
Old pipeline: HoughCircles(param1=12, param2=4) on the whole page. With an
accumulator threshold that low, Hough "finds" 15,000+ circles in plain
printed text (every o, a, e, d, 0, 6, 9 is round). A 110px de-dup filter
then kept ~82 of them, and any that Tesseract happened to read as A-D became
extra answer-key rows → 16 instead of 12. The 110px filter could also delete
a real circle sitting next to a fake one.

New pipeline (generate candidates → strictly validate each one):
  1. Adaptive-threshold ink mask (handles shadows in phone photos) and an
     estimate of the printed text height, so every size limit scales with
     the photo resolution instead of fixed pixel values.
  2. Candidates = holes of closed contours + a lenient HoughCircles pass
     (radius 0.9-3.2 × text height). Candidates are cheap; none is trusted.
  3. RING TEST for every candidate: 72 rays are cast from the centre. A real
     hand-drawn circle gives ink on almost every ray (>=75 %) AND the ring
     radius changes smoothly from ray to ray, AND the inside is mostly empty
     (just the letter). Printed text gives gaps and jumpy radii and scores
     ~0.7-0.8; real circles score ~1.0. Threshold = 0.90.
  4. Overlapping candidates are merged (real answer circles never overlap)
     and size outliers are dropped (all circles on a sheet are similar).
  5. The letter inside is read with Tesseract (psm 10, whitelist ABCD) at a
     few crop sizes, keeping the most confident reading.
  6. Optional `expected_items` keeps only the N most confident circles.
Tested on the real answer key photo (p.6): 12/12 correct, 0 false positives.

FIX 2026-09-27 — "Only 9 of 10 expected answers were detected" (Castillo, v28)
------------------------------------------------------------------------------
On a low-contrast phone photo the hand-drawn ring runs into the printed
letter, so cropping the inside of the ring and asking Tesseract to read one
character fails: item 7's "C" came back empty (its circle was thrown away,
hence 9 answers instead of 10) and item 9's blurred "B" came back as "D".

The letter inside a circle is the *hardest* copy of it on the page — but the
same page also prints A. B. C. D. cleanly for every other option of the same
question. So the page is OCR'd once for option labels, the question's option
block is rebuilt around each circle (4 rows x 1 column, or 2 rows x 2 columns),
and the circle's slot in that block gives its letter. Every printed label in
the block must agree with the layout, otherwise the inference is discarded and
the per-crop reading is used as before — so a layout this does not recognise
can only fall back, never guess wrong.
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
    _sort_answers,
    limit_to_expected,
)

Circle = tuple[int, int, int]   # (cx, cy, r)


# ---------------------------------------------------------------------------
# Circle detection
# ---------------------------------------------------------------------------

def _ring_candidates(ink: "np.ndarray", text_h: float) -> list[tuple[Circle, float]]:
    """Candidate circles from hollow contours (loose — validated later)."""
    import cv2
    k = max(3, int(round(text_h / 6)))
    closed = cv2.morphologyEx(ink, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    contours, hierarchy = cv2.findContours(closed, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    if hierarchy is None:
        return []
    hierarchy = hierarchy[0]
    out: list[tuple[Circle, float]] = []
    for i, cnt in enumerate(contours):
        # holes (children) are the most reliable handle on a ring that
        # touches neighbouring printed text, so use them directly
        if hierarchy[i][3] == -1:
            continue
        x, y, w, h = cv2.boundingRect(cnt)
        if min(w, h) < 1.0 * text_h or max(w, h) > 6.5 * text_h:
            continue
        if not 0.5 <= w / float(h) <= 2.0:
            continue
        (cx, cy), r = cv2.minEnclosingCircle(cnt)
        out.append(((int(cx), int(cy), int(r + k)), 0.0))
    return out


def _hough_candidates(ink: "np.ndarray", text_h: float) -> list[tuple[Circle, float]]:
    """Lenient HoughCircles on the ink mask — every hit is validated later,
    so leniency here only costs time, never adds answers."""
    import cv2
    blur = cv2.GaussianBlur(ink, (9, 9), 2)
    circles = cv2.HoughCircles(
        blur, cv2.HOUGH_GRADIENT, dp=1.5,
        minDist=max(8, int(0.8 * text_h)),
        param1=60, param2=18,
        minRadius=int(0.9 * text_h), maxRadius=int(3.2 * text_h),
    )
    if circles is None:
        return []
    return [((int(c[0]), int(c[1]), int(c[2])), 0.0) for c in np.round(circles[0]).astype(int)]


def _ring_score(ink: "np.ndarray", cx: int, cy: int, r: int, text_h: float) -> tuple[float, int]:
    """How much does (cx, cy, r) look like a hand-drawn closed ring?
    Casts 72 rays; on each ray finds the ink run nearest the expected ring
    radius (0.7r-1.35r, hand circles are ellipses). A real ring gives a hit on
    almost every ray AND the hit radius changes smoothly from ray to ray.
    Printed text gives gaps (between lines) and jumpy radii.
    Returns (score 0-1, refined radius)."""
    H, W = ink.shape
    n = 72
    radii = np.arange(int(0.7 * r), int(1.35 * r) + 1)
    if len(radii) < 3:
        return 0.0, r
    hits: list[float] = []
    for t in np.linspace(0, 2 * np.pi, n, endpoint=False):
        xs = (cx + radii * np.cos(t)).astype(int)
        ys = (cy + radii * np.sin(t)).astype(int)
        ok = (xs >= 0) & (xs < W) & (ys >= 0) & (ys < H)
        vals = np.zeros(len(radii), bool)
        vals[ok] = ink[ys[ok], xs[ok]] > 0
        idx = np.where(vals)[0]
        if len(idx) == 0:
            hits.append(np.nan)
            continue
        prev = hits[-1] if hits and not np.isnan(hits[-1]) else r
        hits.append(float(radii[idx[np.argmin(np.abs(radii[idx] - prev))]]))
    h = np.array(hits)
    covered = ~np.isnan(h)
    coverage = covered.mean()
    if coverage < 0.75:
        return 0.0, r
    hv = np.where(covered, h, np.nanmedian(h))
    jumps = np.abs(np.diff(np.concatenate([hv, hv[:1]])))
    smooth = float((jumps < max(3.0, 0.12 * r)).mean())
    # The inside should be mostly empty (only the letter) — rejects dense text
    inner = []
    for t in np.linspace(0, 2 * np.pi, 36, endpoint=False):
        x = int(cx + 0.5 * r * np.cos(t)); y = int(cy + 0.5 * r * np.sin(t))
        if 0 <= x < W and 0 <= y < H:
            inner.append(ink[y, x] > 0)
    inner_fill = float(np.mean(inner)) if inner else 1.0
    if inner_fill > 0.45:
        return 0.0, r
    return float(coverage * smooth), int(np.nanmedian(h))


def _validate(ink, cands, text_h) -> list[tuple[Circle, float]]:
    out = []
    for (cx, cy, r), _ in cands:
        s, rr = _ring_score(ink, cx, cy, r, text_h)
        if s >= 0.90:          # real rings score ~0.97-1.0, text clutter ~0.7-0.87
            out.append(((cx, cy, rr), s))
    return out


def _dedupe(cands: list[tuple[Circle, float]]) -> list[tuple[Circle, float]]:
    """Remove concentric / overlapping duplicates (keep the best-scoring ring)."""
    cands = sorted(cands, key=lambda c: -c[1])
    kept: list[tuple[Circle, float]] = []
    for (cx, cy, r), s in cands:
        dup = False
        for (kx, ky, kr), _ in kept:
            # real answer circles never overlap each other
            if np.hypot(cx - kx, cy - ky) < 0.9 * (r + kr):
                dup = True
                break
        if not dup:
            kept.append(((cx, cy, r), s))
    return kept


def _drop_size_outliers(cands: list[tuple[Circle, float]]) -> list[tuple[Circle, float]]:
    """All teacher/student circles on a sheet are drawn at a similar size."""
    if len(cands) < 4:
        return cands
    med = float(np.median([c[0][2] for c in cands]))
    return [c for c in cands if 0.6 * med <= c[0][2] <= 1.45 * med]


def detect_circles(gray: "np.ndarray", ink: Optional["np.ndarray"] = None,
                   text_h: Optional[float] = None) -> list[Circle]:
    """Public helper (kept for backwards compatibility with old imports)."""
    if ink is None:
        ink = ink_mask(gray)
    if text_h is None:
        text_h = estimate_text_height(ink)
    cands = _ring_candidates(ink, text_h) + _hough_candidates(ink, text_h)
    cands = _validate(ink, cands, text_h)
    cands = _drop_size_outliers(_dedupe(cands))
    print(f"DEBUG[encircled]: text_h={text_h:.1f}px, circles={len(cands)}")
    return [c[0] for c in cands]


# ---------------------------------------------------------------------------
# Letter reading
# ---------------------------------------------------------------------------

_LETTER_MAP = {"A": "A", "B": "B", "C": "C", "D": "D",
               "8": "B", "0": "D", "O": "D", "G": "C", "(": "C", "4": "A"}



def _cd_shape(mask: "np.ndarray") -> str:
    """Tell C from D by shape. D is closed on the right in its middle band and
    has a straight stem on the left; C is open on the right.
    `mask` is the letter's ink (True = ink). Returns "C", "D" or ""."""
    ys, xs = np.where(mask)
    if len(xs) < 10:
        return ""
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    g = mask[y0:y1 + 1, x0:x1 + 1]
    h, w = g.shape
    if h < 6 or w < 4:
        return ""
    mid = g[int(0.35 * h):max(int(0.65 * h), int(0.35 * h) + 1), :]
    right = mid[:, int(0.72 * w):]
    right_fill = float(right.mean()) if right.size else 0.0
    left = g[:, :max(1, int(0.22 * w))]
    left_rows = float((left.sum(axis=1) > 0).mean())      # D: stem fills nearly every row
    if right_fill >= 0.30 and left_rows >= 0.80:
        return "D"
    if right_fill <= 0.12:
        return "C"
    return ""


def read_circle_letter(gray: "np.ndarray", cx: int, cy: int, radius: int) -> tuple[str, float]:
    """Try a few crop sizes (hand circles are not perfect) and keep the most
    confident A-D reading. Returns (letter, confidence 0-1).

    FIX 2026-09-25: all crop sizes are now tried (no early break). A tight crop
    can cut the right bowl off a "D", which Tesseract then reads as "C", and
    that wrong reading used to win because it looked confident. When the
    readings disagree between C and D, the letter's own shape decides, measured
    on the widest crop (the only one that always contains the whole letter).
    """
    results = []
    for f in (0.85, 0.72, 0.6):
        letter, conf = _read_letter_at(gray, cx, cy, radius, f)
        if letter:
            results.append((letter, conf, f))
    if not results:
        return "", 0.0

    letter, conf, _f = max(results, key=lambda r: r[1])
    letters = {r[0] for r in results}
    if letters & {"C", "D"} and (len(letters) > 1 or letter in ("C", "D")):
        mask = _clean_letter_mask(gray, cx, cy, radius, 0.85)
        if mask is not None:
            shape = _cd_shape(mask < 128)
            if shape and shape != letter:
                same = [r[1] for r in results if r[0] == shape]
                letter, conf = shape, max(same + [0.6])
    return letter, round(conf, 2)


def _clean_letter_mask(gray: "np.ndarray", cx: int, cy: int, radius: int, factor: float):
    """Crop the inside of the circle, remove the drawn ring, and return a
    black-letter-on-white image (or None when the crop is empty)."""
    import cv2

    H, W = gray.shape
    inner = max(4, int(radius * factor))        # stay inside the drawn ring
    x1, x2 = max(cx - inner, 0), min(cx + inner, W)
    y1, y2 = max(cy - inner, 0), min(cy + inner, H)
    crop = gray[y1:y2, x1:x2]
    if crop.size == 0:
        return None

    mask = np.zeros(crop.shape, np.uint8)
    cv2.circle(mask, (cx - x1, cy - y1), inner, 255, -1)
    crop = np.where(mask == 255, crop, 255).astype(np.uint8)

    _, th = cv2.threshold(crop, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)   # black text on white
    # Keep only the central ink blob group (removes ring fragments)
    inv = 255 - th
    n, lbl, stats, cents = cv2.connectedComponentsWithStats(inv, 8)
    if n > 1:
        c = np.array([crop.shape[1] / 2, crop.shape[0] / 2])
        keep = np.zeros_like(inv)
        for i in range(1, n):
            if stats[i, cv2.CC_STAT_AREA] < 8:
                continue
            if np.hypot(*(cents[i] - c)) < inner * 0.75:
                keep[lbl == i] = 255
        if cv2.countNonZero(keep) > 0:
            th = 255 - keep
    return th


def _read_letter_at(gray: "np.ndarray", cx: int, cy: int, radius: int, factor: float) -> tuple[str, float]:
    """OCR a single A-D letter from one crop size. Returns (letter, confidence 0-1)."""
    import cv2
    import pytesseract
    from pytesseract import Output

    th = _clean_letter_mask(gray, cx, cy, radius, factor)
    if th is None:
        return "", 0.0

    big = cv2.resize(th, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)
    big = cv2.copyMakeBorder(big, 20, 20, 20, 20, cv2.BORDER_CONSTANT, value=255)

    best_letter, best_conf = "", 0.0
    for cfg in ("--psm 10 -c tessedit_char_whitelist=ABCDabcd",
                "--psm 10"):
        try:
            data = pytesseract.image_to_data(big, config=cfg, output_type=Output.DICT)
        except Exception:
            continue
        for txt, conf in zip(data["text"], data["conf"]):
            txt = (txt or "").strip().upper()
            try:
                conf = float(conf)
            except (TypeError, ValueError):
                conf = -1
            if not txt or conf < 0:
                continue
            letter = _LETTER_MAP.get(txt[0], "")
            if letter and conf / 100.0 > best_conf:
                best_letter, best_conf = letter, conf / 100.0
        if best_letter and best_conf >= 0.5:
            break
    return best_letter, round(best_conf, 2)


# ---------------------------------------------------------------------------
# Printed option labels ("A." "B." "C." "D.") and the question's option block
# ---------------------------------------------------------------------------

# "A", "A.", "(A)", "B," — a lone lower-case letter is an English word
# ("a" in the option text), so it only counts as a label with punctuation.
_LABEL_RE    = re.compile(r"^[\(\[\{]?\s*([ABCD])\s*[\.\),:;]{0,2}[\]\)\}]?$")
_LABEL_LC_RE = re.compile(r"^[\(\[\{]?\s*([abcd])\s*[\.\),:;]{1,2}[\]\)\}]?$")

_LETTERS = "ABCD"

Label = tuple[str, int, int, int, int, float]     # (letter, cx, cy, w, h, conf)


def page_labels(gray: "np.ndarray", min_conf: float = 30.0) -> list[Label]:
    """Every printed option label on the page, with its position."""
    import pytesseract
    from pytesseract import Output

    found: list[Label] = []
    for cfg in ("--psm 6", "--psm 4"):
        try:
            data = pytesseract.image_to_data(gray, config=cfg, output_type=Output.DICT)
        except Exception:
            continue
        for i, txt in enumerate(data["text"]):
            txt = (txt or "").strip()
            m = _LABEL_RE.match(txt) or _LABEL_LC_RE.match(txt)
            if not m:
                continue
            try:
                conf = float(data["conf"][i])
            except (TypeError, ValueError):
                conf = -1.0
            if conf < min_conf:
                continue
            x, y = data["left"][i], data["top"][i]
            w, h = data["width"][i], data["height"][i]
            found.append((m.group(1).upper(), x + w // 2, y + h // 2, w, h, conf))
        if found:
            break

    deduped: list[Label] = []
    for lab in sorted(found, key=lambda l: -l[5]):
        if any(abs(lab[1] - k[1]) < 8 and abs(lab[2] - k[2]) < 8 for k in deduped):
            continue
        deduped.append(lab)
    return deduped


def option_pitch(labels: list[Label], text_h: float) -> float:
    """Vertical distance between two options of the same question (px).
    Only small gaps count — the gap between two questions is much larger."""
    ys = sorted({l[2] for l in labels})
    gaps = [b - a for a, b in zip(ys, ys[1:]) if 0.8 * text_h <= b - a <= 4.0 * text_h]
    return float(np.median(gaps)) if len(gaps) >= 2 else 2.4 * text_h


def _cluster_rows(points: list[tuple[int, tuple]], tol: float) -> list[tuple[float, list[tuple]]]:
    """Group (y, payload) pairs into printed rows."""
    rows: list[tuple[list[int], list[tuple]]] = []
    for y, payload in sorted(points, key=lambda p: p[0]):
        if rows and y - rows[-1][0][-1] <= tol:
            rows[-1][0].append(y)
            rows[-1][1].append(payload)
        else:
            rows.append(([y], [payload]))
    return [(float(np.mean(ys)), ps) for ys, ps in rows]


def label_for_circle(labels: list[Label], cx: int, cy: int, r: int,
                     pitch: float, circles: list[Circle]) -> tuple[str, str]:
    """Work out which option a circle sits on from the printed labels around it.
    Returns (letter, reason); letter is "" when nothing can be proved."""
    # 1. the label was read straight through the ring, e.g. "(A)"
    for letter, lx, ly, w, h, conf in labels:
        if abs(lx - cx) <= max(0.8 * r, 0.6 * w) and abs(ly - cy) <= max(0.8 * r, 0.6 * h):
            return letter, "printed label"

    # 2. rebuild the question's option block around the circle
    points: list[tuple[int, tuple]] = [(l[2], ("L", l[0], l[1])) for l in labels]
    points += [(oy, ("C", "", ox)) for ox, oy, _ in circles]
    rows = _cluster_rows(points, 0.55 * pitch)

    me = next((i for i, (ry, ps) in enumerate(rows)
               if any(k == "C" and abs(x - cx) <= 2 for k, _, x in ps)
               and abs(ry - cy) <= 0.8 * pitch), None)
    if me is None:
        return "", "row not found"

    lo = hi = me
    while lo - 1 >= 0 and rows[lo][0] - rows[lo - 1][0] <= 1.7 * pitch:
        lo -= 1
    while hi + 1 < len(rows) and rows[hi + 1][0] - rows[hi][0] <= 1.7 * pitch:
        hi += 1
    block = rows[lo:hi + 1]

    xs = sorted(x for _, ps in block for _, _, x in ps)
    cols: list[list[int]] = []
    for x in xs:
        if cols and x - cols[-1][-1] <= 4 * r:
            cols[-1].append(x)
        else:
            cols.append([x])
    col_x = [float(np.mean(c)) for c in cols]
    n_rows, n_cols = len(block), len(col_x)
    if n_cols > 2 or (n_cols == 1 and n_rows > 4) or (n_cols == 2 and n_rows > 2):
        return "", "unknown layout"
    if not any(k == "L" for _, ps in block for k, _, _ in ps):
        return "", "no printed label nearby"

    def slot(row: int, x: int) -> int:
        if n_cols == 2:            # A B on the left, C D on the right
            return int(np.argmin([abs(x - k) for k in col_x])) * 2 + row
        return row                 # A B C D straight down

    # every printed label in the block must land on its own letter
    for i, (_ry, ps) in enumerate(block):
        for kind, letter, x in ps:
            if kind != "L":
                continue
            k = slot(i, x)
            if not 0 <= k <= 3 or _LETTERS[k] != letter:
                return "", "labels disagree"

    k = slot(me - lo, cx)
    if not 0 <= k <= 3:
        return "", "outside block"
    return _LETTERS[k], f"option block {n_rows}x{n_cols}"


# ---------------------------------------------------------------------------
# Page pipeline
# ---------------------------------------------------------------------------

def ocr_page_encircled(image_path: str, expected_items: Optional[int] = None) -> OCRPageResult:
    try:
        gray, _scale = load_gray(image_path)
        ink = ink_mask(gray)
        text_h = estimate_text_height(ink)
        circles = detect_circles(gray, ink, text_h)

        if not circles:
            return OCRPageResult(
                image_path=image_path, answers=[], mean_conf=0.0,
                error=("No circled answers detected. Make sure the photo is clear, "
                       "flat, and each answer letter is fully circled."),
            )

        labels = page_labels(gray)
        pitch = option_pitch(labels, text_h)

        raw: list[DetectedAnswer] = []
        unread = 0
        for (cx, cy, r) in circles:
            letter, conf = read_circle_letter(gray, cx, cy, r)
            # The printed labels around the circle are far more legible than the
            # letter inside it, so they decide whenever the block can be proved.
            from_page, why = label_for_circle(labels, cx, cy, r, pitch, circles)
            if from_page:
                if from_page != letter:
                    print(f"DEBUG[encircled]: ({cx},{cy}) crop read {letter or '-'} "
                          f"({conf:.2f}) -> {from_page} from {why}")
                letter, conf = from_page, max(conf, 0.85)
            if letter:
                raw.append(DetectedAnswer(y=cy, x=cx, letter=letter, confidence=conf, size=2 * r))
            else:
                unread += 1

        if not raw:
            return OCRPageResult(
                image_path=image_path, answers=[], mean_conf=0.0,
                error=("Circles were found but no letters could be read. "
                       "Ensure A/B/C/D is clearly visible inside each circle."),
            )

        answers = _sort_answers(raw)
        answers, warn = limit_to_expected(answers, expected_items)
        if unread:
            extra = f"{unread} circle(s) had an unreadable letter and were skipped."
            warn = f"{warn} {extra}" if warn else extra

        mean_conf = round(sum(a.confidence for a in answers) / len(answers), 2)
        print(f"DEBUG[encircled]: {len(answers)} answers -> {[a.letter for a in answers]}")
        return OCRPageResult(image_path=image_path, answers=answers, mean_conf=mean_conf, warning=warn)

    except Exception as exc:
        return OCRPageResult(image_path=image_path, answers=[], mean_conf=0.0, error=str(exc))