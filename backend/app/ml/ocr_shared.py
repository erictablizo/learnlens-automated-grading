from __future__ import annotations
import os
from dataclasses import dataclass
from typing import Optional
import numpy as np

@dataclass
class DetectedAnswer:
    y: int
    x: int
    letter: str
    confidence: float = 0.0
    size: int = 0
    # NEW 2026-10-24. 0 means "nobody said", and every caller that numbers by
    # position keeps working. ocr_item_numbers fills it with the number
    # PRINTED on the page, so a page that starts at item 12 says so.
    item_number: int = 0

@dataclass
class OCRPageResult:
    image_path: str
    answers: list
    mean_conf: float
    error: Optional[str] = None
    warning: Optional[str] = None

def setup_tesseract(cmd_path: str = "") -> None:
    if not cmd_path:
        return
    try:
        import pytesseract
        if os.path.exists(cmd_path):
            pytesseract.pytesseract.tesseract_cmd = cmd_path
    except ImportError:
        pass

MAX_SIDE = 2400
MIN_SIDE = 2000

def load_gray(image_path: str):
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

def ink_mask(gray):
    import cv2
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    block = max(15, (min(gray.shape) // 40) | 1)
    th = cv2.adaptiveThreshold(blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                               cv2.THRESH_BINARY_INV, block, 12)
    th = cv2.morphologyEx(th, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    return th

def estimate_text_height(ink) -> float:
    import cv2
    n, _, stats, _ = cv2.connectedComponentsWithStats(ink, connectivity=8)
    H, W = ink.shape
    heights = []
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        if area < 12 or h < 6:
            continue
        if h > H * 0.08 or w > W * 0.15:
            continue
        if w / float(h) > 6:
            continue
        heights.append(h)
    if not heights:
        return max(12.0, H / 80.0)
    return float(np.median(heights))

def group_rows(items: list, key_y, tol: float) -> list:
    items = sorted(items, key=key_y)
    rows: list = []
    row_y: list = []
    for it in items:
        y = key_y(it)
        if rows and abs(y - row_y[-1]) <= tol:
            rows[-1].append(it)
            row_y[-1] = float(np.mean([key_y(r) for r in rows[-1]]))
        else:
            rows.append([it])
            row_y.append(float(y))
    return rows

def _sort_answers(answers: list, row_tol: Optional[float] = None) -> list:
    if not answers:
        return answers
    if row_tol is None:
        sizes = [a.size for a in answers if a.size]
        row_tol = (0.6 * float(np.median(sizes))) if sizes else 40.0
    rows = group_rows(answers, key_y=lambda a: a.y, tol=row_tol)
    out: list = []
    for r in rows:
        out.extend(sorted(r, key=lambda a: a.x))
    answers[:] = out
    return answers

def sort_column_aware(answers: list, page_w: int) -> list:
    if len(answers) < 4:
        return _sort_answers(answers)
    xs = sorted(a.x for a in answers)
    gaps = [(xs[i + 1] - xs[i], i) for i in range(len(xs) - 1)]
    big = [g for g in gaps if g[0] > page_w * 0.25]
    if not big:
        return _sort_answers(answers)
    cuts = sorted(xs[i] + g / 2.0 for g, i in big)
    cols: list = [[] for _ in range(len(cuts) + 1)]
    for a in answers:
        idx = sum(1 for c in cuts if a.x > c)
        cols[idx].append(a)
    if min(len(c) for c in cols) < 2:
        return _sort_answers(answers)
    out: list = []
    for c in cols:
        out.extend(sorted(c, key=lambda a: a.y))
    answers[:] = out
    return answers

def limit_to_expected(answers: list, expected: Optional[int]):
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