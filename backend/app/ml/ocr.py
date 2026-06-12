"""
app/ml/ocr.py
=============
Image preprocessing and circle-detection OCR pipeline for LearnLens.
 
Based on Eric's preprocessing script:
  1. Binarization      (grayscale -> binary threshold)
  2. Noise removal     (dilate -> erode -> morphClose -> medianBlur)
  3. Font thickening   (bitwise_not -> dilate 2x2 -> bitwise_not)
  4. HoughCircles      (detect encircled answer bubbles)
  5. Per-circle OCR    (Otsu threshold -> Tesseract PSM 10, whitelist A-D)
  6. Sort              (top->bottom, left->right, row tolerance 40 px)
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
    """One encircled answer detected on a page."""
    y:          int        # pixel row of circle centre
    x:          int        # pixel column of circle centre
    letter:     str        # 'A', 'B', 'C', or 'D'
    confidence: float = 0.0
 
 
@dataclass
class OCRPageResult:
    """Result of running OCR on a single page image."""
    image_path:   str
    answers:      list[DetectedAnswer]   # sorted reading order
    mean_conf:    float                  # mean Tesseract confidence 0-100
    error:        Optional[str] = None   # set if pipeline failed
 
 
# ---------------------------------------------------------------------------
# Tesseract setup
# ---------------------------------------------------------------------------
 
def setup_tesseract(cmd_path: str = "") -> None:
    """
    Point pytesseract at the Tesseract executable.
    Call once at startup (or before the first OCR call).
 
    cmd_path example (Windows):
        C:\\Program Files\\Tesseract-OCR\\tesseract.exe
    """
    if not cmd_path:
        return
    try:
        import pytesseract
        if os.path.exists(cmd_path):
            pytesseract.pytesseract.tesseract_cmd = cmd_path
    except ImportError:
        pass
 
 
# ---------------------------------------------------------------------------
# Preprocessing steps
# ---------------------------------------------------------------------------
 
def binarize(img) -> "np.ndarray":
    """
    Convert BGR image to binary (black / white).
    Returns a single-channel uint8 array.
    """
    import cv2
    gray  = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    _, bw = cv2.threshold(gray, 150, 255, cv2.THRESH_BINARY)
    return bw
 
 
def remove_noise(bw: "np.ndarray") -> "np.ndarray":
    """
    Dilate -> erode -> morphological close -> median blur.
    Removes salt-and-pepper noise without destroying circle outlines.
    """
    import cv2
    kernel = np.ones((1, 1), np.uint8)
    out = cv2.dilate(bw, kernel, iterations=1)
    out = cv2.erode(out, kernel, iterations=1)
    out = cv2.morphologyEx(out, cv2.MORPH_CLOSE, kernel)
    out = cv2.medianBlur(out, 3)
    return out
 
 
def thick_font(bgr_img: "np.ndarray") -> "np.ndarray":
    """
    Thicken strokes: invert -> dilate 2-pixel kernel 2x -> invert back.
    Makes enclosed letters easier for Tesseract to read.
    """
    import cv2
    inv     = cv2.bitwise_not(bgr_img)
    kernel  = np.ones((2, 2), np.uint8)
    dilated = cv2.dilate(inv, kernel, iterations=2)
    return cv2.bitwise_not(dilated)
 
 
def preprocess(image_path: str) -> "np.ndarray":
    """
    Full preprocessing pipeline.
    Returns a single-channel (grayscale) preprocessed image.
    """
    import cv2
    img = cv2.imread(image_path)
    if img is None:
        raise FileNotFoundError(f"Cannot read image: {image_path}")
 
    bw          = binarize(img)
    cleaned     = remove_noise(bw)
    cleaned_bgr = cv2.cvtColor(cleaned, cv2.COLOR_GRAY2BGR)
    thickened   = thick_font(cleaned_bgr)
    gray        = cv2.cvtColor(thickened, cv2.COLOR_BGR2GRAY)
    return gray
 
 
# ---------------------------------------------------------------------------
# Circle detection
# ---------------------------------------------------------------------------
 
def detect_circles(
    gray: "np.ndarray",
    min_dist:   int = 30,
    param1:     int = 100,
    param2:     int = 20,
    min_radius: int = 15,
    max_radius: int = 20,
) -> list[tuple[int, int, int]]:
    """
    Run HoughCircles on a preprocessed grayscale image.
    Returns list of (x, y, radius) tuples.
    """
    import cv2
    blur    = cv2.GaussianBlur(gray, (9, 9), 2)
    circles = cv2.HoughCircles(
        blur,
        cv2.HOUGH_GRADIENT,
        dp        = 1,
        minDist   = min_dist,
        param1    = param1,
        param2    = param2,
        minRadius = min_radius,
        maxRadius = max_radius,
    )
    if circles is None:
        return []
    return [
        (int(x), int(y), int(r))
        for x, y, r in np.round(circles[0]).astype("int")
    ]
 
 
# ---------------------------------------------------------------------------
# Per-circle OCR
# ---------------------------------------------------------------------------
 
def read_circle_letter(
    gray:     "np.ndarray",
    cx:       int,
    cy:       int,
    radius:   int,
) -> tuple[str, float]:
    """
    Crop the circle ROI, apply Otsu threshold, run PSM-10 Tesseract.
    Returns (letter, confidence) where letter is '' if nothing found.
    """
    import cv2
    import pytesseract
    from pytesseract import Output
 
    # Circular mask
    mask = np.zeros(gray.shape, dtype=np.uint8)
    cv2.circle(mask, (cx, cy), radius, 255, -1)
    roi = cv2.bitwise_and(gray, gray, mask=mask)
 
    # Bounding box crop
    x1 = max(cx - radius, 0);  x2 = min(cx + radius, gray.shape[1])
    y1 = max(cy - radius, 0);  y2 = min(cy + radius, gray.shape[0])
    roi_crop = roi[y1:y2, x1:x2]
 
    if roi_crop.size == 0:
        return "", 0.0
 
    # Otsu threshold for cleaner character
    _, roi_thresh = cv2.threshold(
        roi_crop, 0, 255,
        cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU,
    )
 
    # PSM 10 = single character, whitelist A-D only
    config = "--psm 10 -c tessedit_char_whitelist=ABCDabcd"
 
    # Get letter
    text = pytesseract.image_to_string(roi_thresh, config=config).strip().upper()
    if not text or text not in "ABCD":
        return "", 0.0
 
    # Get confidence for this crop
    try:
        data  = pytesseract.image_to_data(roi_thresh, config=config, output_type=Output.DICT)
        confs = [int(c) for c in data["conf"] if str(c).isdigit() and int(c) >= 0]
        conf  = round(sum(confs) / len(confs), 2) if confs else 0.0
    except Exception:
        conf = 0.0
 
    return text, conf
 
 
# ---------------------------------------------------------------------------
# Page-level OCR
# ---------------------------------------------------------------------------
 
ROW_TOLERANCE = 40   # pixels — circles within this vertical band = same row
 
 
def ocr_page(image_path: str) -> OCRPageResult:
    """
    Run the full pipeline on one image file.
    Returns an OCRPageResult with answers sorted in reading order.
    """
    try:
        gray    = preprocess(image_path)
        circles = detect_circles(gray)
 
        answers: list[DetectedAnswer] = []
        for (cx, cy, r) in circles:
            letter, conf = read_circle_letter(gray, cx, cy, r)
            if letter:
                answers.append(DetectedAnswer(y=cy, x=cx, letter=letter, confidence=conf))
 
        # Sort top->bottom, left->right
        answers.sort(key=lambda a: (a.y // ROW_TOLERANCE, a.x))
 
        mean_conf = (
            round(sum(a.confidence for a in answers) / len(answers), 2)
            if answers else 0.0
        )
 
        return OCRPageResult(
            image_path = image_path,
            answers    = answers,
            mean_conf  = mean_conf,
        )
 
    except Exception as exc:
        return OCRPageResult(
            image_path = image_path,
            answers    = [],
            mean_conf  = 0.0,
            error      = str(exc),
        )