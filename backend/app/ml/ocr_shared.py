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
 
 
# ---------------------------------------------------------------------------
# Answer sorting
# ---------------------------------------------------------------------------
 
ROW_TOLERANCE = 40  # px — Eric uses row_tolerance = 40


def _sort_answers(answers: list[DetectedAnswer]) -> list[DetectedAnswer]:
    """Sort top→bottom, left→right with 40 px row tolerance (Eric's sort)."""
    answers.sort(key=lambda a: (a.y // ROW_TOLERANCE, a.x))
    return answers