"""
app/ml/ocr_shared.py — Shared OCR utilities & preprocessing
============================================================
 
Shared components used by both encircled (multiple choice) and 
true/false question detection:
  - Data classes
  - Tesseract setup
  - Image preprocessing pipeline
  - Answer sorting logic
"""
 
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional

import numpy as np
 
 
# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------
 
@dataclass
class DetectedAnswer:
    y:          int
    x:          int
    letter:     str
    confidence: float = 0.0


@dataclass
class OCRPageResult:
    image_path: str
    answers:    list[DetectedAnswer]
    mean_conf:  float
    error:      Optional[str] = None


# ---------------------------------------------------------------------------
# Tesseract setup
# ---------------------------------------------------------------------------

def setup_tesseract(cmd_path: str = "") -> None:
    if not cmd_path:
        return
    try:
        import pytesseract
        if os.path.exists(cmd_path):
            pytesseract.pytesseract.tesseract_cmd = cmd_path
    except ImportError:
        pass


# ---------------------------------------------------------------------------
# Step 1 — Binarization
# ---------------------------------------------------------------------------

def binarize(img: "np.ndarray") -> "np.ndarray":
    """Grayscale → binary threshold at 150 (Eric's script step 1)."""
    import cv2
    gray   = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    _, bw  = cv2.threshold(gray, 150, 255, cv2.THRESH_BINARY)
    return bw


# ---------------------------------------------------------------------------
# Step 2 — Noise removal
# ---------------------------------------------------------------------------

def remove_noise(bw: "np.ndarray") -> "np.ndarray":
    """Dilate → erode → morphClose → medianBlur (Eric's script step 2)."""
    import cv2
    kernel = np.ones((1, 1), np.uint8)
    out    = cv2.dilate(bw, kernel, iterations=1)
    kernel = np.ones((1, 1), np.uint8)
    out    = cv2.erode(out, kernel, iterations=1)
    out    = cv2.morphologyEx(out, cv2.MORPH_CLOSE, kernel)
    out    = cv2.medianBlur(out, 3)
    return out


# ---------------------------------------------------------------------------
# Step 3 — Font thickening
# ---------------------------------------------------------------------------

def thick_font(bw: "np.ndarray") -> "np.ndarray":
    """
    Thicken strokes: invert → dilate 2×2 2× → invert back.
    Input is grayscale (single-channel). Eric's script reloads from
    disk so it gets BGR; we convert manually to keep it in-memory.
    (Eric's script step 3)
    """
    import cv2
    bgr    = cv2.cvtColor(bw, cv2.COLOR_GRAY2BGR)
    bgr    = cv2.bitwise_not(bgr)
    kernel = np.ones((2, 2), np.uint8)
    bgr    = cv2.dilate(bgr, kernel, iterations=2)
    bgr    = cv2.bitwise_not(bgr)
    return bgr
 
#  Added on 2026-09-23:
 
# ---------------------------------------------------------------------------
# New scale-aware helpers
# ---------------------------------------------------------------------------
 
MAX_SIDE = 2400   # very large phone photos are downscaled to this (keeps speed sane)
MIN_SIDE = 2000   # small / low-res images are upscaled so letters are big enough for Tesseract
 
 
def load_gray(image_path: str) -> tuple["np.ndarray", float]:
    """Read image → grayscale, resized so MIN_SIDE ≤ long side ≤ MAX_SIDE.
    Returns (gray, scale) where original_px = new_px / scale."""
    import cv2
    img = cv2.imread(image_path)
    if img is None:
        raise FileNotFoundError(f"Cannot read image: {image_path}")
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    scale = 1.0
    if max(h, w) > MAX_SIDE:
        scale = MAX_SIDE / float(max(h, w))
        gray = cv2.resize(gray, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    elif max(h, w) < MIN_SIDE:
        scale = MIN_SIDE / float(max(h, w))
        gray = cv2.resize(gray, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_CUBIC)
    return gray, scale
 
 
def ink_mask(gray: "np.ndarray") -> "np.ndarray":
    """White-on-black ink mask. Adaptive threshold copes with uneven
    lighting / shadows in phone photos far better than a fixed 150."""
    import cv2
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    block = max(15, (min(gray.shape) // 40) | 1)          # odd, scales with image
    th = cv2.adaptiveThreshold(
        blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, block, 12
    )
    # remove salt noise
    th = cv2.morphologyEx(th, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    return th
 
 
def estimate_text_height(ink: "np.ndarray") -> float:
    """Median height of character-sized connected components (px)."""
    import cv2
    n, _, stats, _ = cv2.connectedComponentsWithStats(ink, connectivity=8)
    H, W = ink.shape
    heights = []
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        if area < 12 or h < 6:
            continue
        if h > H * 0.08 or w > W * 0.15:       # lines, borders, big shapes
            continue
        if w / float(h) > 6:                   # underscores / rules
            continue
        heights.append(h)
    if not heights:
        return max(12.0, H / 80.0)
    return float(np.median(heights))
 
 
def group_rows(items: list, key_y, tol: float) -> list[list]:
    """Cluster items into rows by y (running mean). Returns rows top→bottom."""
    items = sorted(items, key=key_y)
    rows: list[list] = []
    row_y: list[float] = []
    for it in items:
        y = key_y(it)
        if rows and abs(y - row_y[-1]) <= tol:
            rows[-1].append(it)
            row_y[-1] = float(np.mean([key_y(r) for r in rows[-1]]))
        else:
            rows.append([it])
            row_y.append(float(y))
    return rows
# ---------------------------------------------------------------------------
# Answer sorting
# ---------------------------------------------------------------------------

# Commented on 2026-09-23: 
# def _sort_answers(answers: list[DetectedAnswer]) -> list[DetectedAnswer]:
#     """Sort top→bottom, left→right with 40 px row tolerance (Eric's sort)."""
#     answers.sort(key=lambda a: (a.y // ROW_TOLERANCE, a.x))
#     return answers
def _sort_answers(answers: list[DetectedAnswer], row_tol: Optional[float] = None) -> list[DetectedAnswer]:
    """Sort top→bottom, left→right using real row clustering."""
    if not answers:
        return answers
    if row_tol is None:
        sizes = [a.size for a in answers if a.size]
        row_tol = (0.6 * float(np.median(sizes))) if sizes else 40.0
    rows = group_rows(answers, key_y=lambda a: a.y, tol=row_tol)
    out: list[DetectedAnswer] = []
    for r in rows:
        out.extend(sorted(r, key=lambda a: a.x))
    answers[:] = out
    return answers

# Added on 2026-09-23: 
def sort_column_aware(answers: list[DetectedAnswer], page_w: int) -> list[DetectedAnswer]:
    """For layouts with 2+ answer columns (e.g. items 1-10 left, 11-20 right),
    read column by column. Falls back to row order for a single column."""
    if len(answers) < 4:
        return _sort_answers(answers)
    xs = sorted(a.x for a in answers)
    gaps = [(xs[i + 1] - xs[i], i) for i in range(len(xs) - 1)]
    big = [g for g in gaps if g[0] > page_w * 0.25]
    if not big:
        return _sort_answers(answers)
    cuts = sorted(xs[i] + g / 2.0 for g, i in big)
    cols: list[list[DetectedAnswer]] = [[] for _ in range(len(cuts) + 1)]
    for a in answers:
        idx = sum(1 for c in cuts if a.x > c)
        cols[idx].append(a)
    # Only treat as columns if every column has a reasonable share of items
    if min(len(c) for c in cols) < 2:
        return _sort_answers(answers)
    out: list[DetectedAnswer] = []
    for c in cols:
        out.extend(sorted(c, key=lambda a: a.y))
    answers[:] = out
    return answers
 
 
def limit_to_expected(
    answers: list[DetectedAnswer],
    expected: Optional[int],
) -> tuple[list[DetectedAnswer], Optional[str]]:
    """If the page is known to have N items, keep the N most confident
    detections (preserving reading order). Returns (answers, warning)."""
    if not expected or expected <= 0:
        return answers, None
    if len(answers) > expected:
        keep = sorted(range(len(answers)), key=lambda i: answers[i].confidence, reverse=True)[:expected]
        keep_set = set(keep)
        dropped = len(answers) - expected
        trimmed = [a for i, a in enumerate(answers) if i in keep_set]
        return trimmed, f"{dropped} low-confidence mark(s) ignored to match {expected} items."
    if len(answers) < expected:
        return answers, f"Only {len(answers)} of {expected} expected answers were detected."
    return answers, None