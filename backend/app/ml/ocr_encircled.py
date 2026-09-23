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
 
 
def read_circle_letter(gray: "np.ndarray", cx: int, cy: int, radius: int) -> tuple[str, float]:
    """Try a few crop sizes (hand circles are not perfect) and keep the most
    confident A-D reading. Returns (letter, confidence 0-1)."""
    best = ("", 0.0)
    for f in (0.72, 0.6, 0.85):
        res = _read_letter_at(gray, cx, cy, radius, f)
        if res[1] > best[1]:
            best = res
        if best[1] >= 0.8:
            break
    return best
 
 
def _read_letter_at(gray: "np.ndarray", cx: int, cy: int, radius: int, factor: float) -> tuple[str, float]:
    """Crop the inside of the circle (ring removed), OCR a single A-D letter.
    Returns (letter, confidence 0-1)."""
    import cv2
    import pytesseract
    from pytesseract import Output
 
    H, W = gray.shape
    inner = max(4, int(radius * factor))        # stay inside the drawn ring
    x1, x2 = max(cx - inner, 0), min(cx + inner, W)
    y1, y2 = max(cy - inner, 0), min(cy + inner, H)
    crop = gray[y1:y2, x1:x2]
    if crop.size == 0:
        return "", 0.0
 
    mask = np.zeros(crop.shape, np.uint8)
    cv2.circle(mask, (cx - x1, cy - y1), inner, 255, -1)
    crop = np.where(mask == 255, crop, 255).astype(np.uint8)
 
    _, th = cv2.threshold(crop, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)   # black text on white
    # Keep only the biggest central ink blob group (removes ring fragments)
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
 
        raw: list[DetectedAnswer] = []
        unread = 0
        for (cx, cy, r) in circles:
            letter, conf = read_circle_letter(gray, cx, cy, r)
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