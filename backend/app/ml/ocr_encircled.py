"""
app/ml/ocr_encircled.py — Multiple Choice (Encircled) OCR
==========================================================
 
Detects circled multiple choice answers (A, B, C, D).
Uses HoughCircles to find circles, then OCR to read letters inside.
"""
 
from __future__ import annotations
 
import numpy as np
 
from app.ml.ocr_shared import (
    DetectedAnswer,
    OCRPageResult,
    binarize,
    remove_noise,
    thick_font,
    _sort_answers,
)

def detect_circles(gray: "np.ndarray") -> list[tuple[int, int, int]]:
    """Detect encircled answers using HoughCircles."""
    import cv2
    blur    = cv2.GaussianBlur(gray, (9, 9), 2)
    # circles = cv2.HoughCircles(
    #     blur,
    #     cv2.HOUGH_GRADIENT,
    #     dp        = 1,
    #     minDist   = 8,
    #     param1    = 20,
    #     param2    = 8,
    #     minRadius = 8,
    #     maxRadius = 40,
    # )
    # circles = cv2.HoughCircles(
    #     blur,
    #     cv2.HOUGH_GRADIENT,
    #     dp        = 1,
    #     minDist   = 8,
    #     param1    = 15,        # ← REDUCED from 20
    #     param2    = 3,         # ← REDUCED from 8 (MUCH MORE LENIENT)
    #     minRadius = 8,
    #     maxRadius = 40,
    # )
    # circles = cv2.HoughCircles(
    #     blur,
    #     cv2.HOUGH_GRADIENT,
    #     dp        = 1.2,       # ← Changed
    #     minDist   = 5,         # ← VERY LENIENT
    #     param1    = 10,        # ← VERY LENIENT
    #     param2    = 5,         # ← MODERATE
    #     minRadius = 5,         # ← SMALLER
    #     maxRadius = 50,        # ← LARGER
    # )
    # circles = cv2.HoughCircles(
    #     blur,
    #     cv2.HOUGH_GRADIENT,
    #     dp        = 1,
    #     minDist   = 6,         # ← SLIGHTLY REDUCED
    #     param1    = 18,        # ← BALANCED (was 20, then 15)
    #     param2    = 5,         # ← BALANCED (was 8, then 3)
    #     minRadius = 8,
    #     maxRadius = 40,
    # )
    # circles = cv2.HoughCircles(
    #     blur,
    #     cv2.HOUGH_GRADIENT,
    #     dp        = 1,
    #     minDist   = 7,         # ← REDUCED (allow closer circles)
    #     param1    = 18,        # ← SLIGHTLY REDUCED
    #     param2    = 6,         # ← REDUCED (more sensitive)
    #     minRadius = 8,
    #     maxRadius = 40,
    # )
    circles = cv2.HoughCircles(
        blur,
        cv2.HOUGH_GRADIENT,
        dp        = 1,
        minDist   = 5,         # ← VERY SMALL (allow very close circles)
        param1    = 12,        # ← VERY SENSITIVE
        param2    = 4,         # ← VERY LENIENT
        minRadius = 8,
        maxRadius = 40,
    )

    if circles is None:
        return []

    raw_circles = np.round(circles[0, :]).astype("int").tolist()
    print(f"DEBUG: Raw circles: {len(raw_circles)}")
    
    # ✓ FILTER 1: Only keep circles with CONSISTENT RADIUS (18-28px)
    # consistent_radius = [c for c in raw_circles if 18 <= c[2] <= 28]
    # consistent_radius = [c for c in raw_circles if 15 <= c[2] <= 32]
    consistent_radius = [c for c in raw_circles if 15 <= c[2] <= 35]
    print(f"DEBUG: After radius filter (18-28px): {len(consistent_radius)}")
    
    # ✓ FILTER 2: Remove duplicates (very close circles)
    consistent_radius.sort(key=lambda c: (c[1], c[0]))
    filtered_circles = []
    # MIN_DISTANCE = 15
    # MIN_DISTANCE = 50
    # MIN_DISTANCE = 100
    # MIN_DISTANCE = 150
    # MIN_DISTANCE = 200
    # MIN_DISTANCE = 120
    MIN_DISTANCE = 110
    
    for x, y, r in consistent_radius:
        is_duplicate = False
        for fx, fy, fr in filtered_circles:
            dist = np.sqrt((x - fx)**2 + (y - fy)**2)
            if dist < MIN_DISTANCE:
                is_duplicate = True
                break
        if not is_duplicate:
            filtered_circles.append((x, y, r))
    
    print(f"DEBUG: After duplicate filter: {len(filtered_circles)}")
    print(f"DEBUG: Final circles: {filtered_circles}")
    
    # return filtered_circles[:12]
    return filtered_circles

def read_circle_letter(
    gray:   "np.ndarray",
    cx:     int,
    cy:     int,
    radius: int,
) -> tuple[str, float]:
    """
    Extract the letter from inside a detected circle.
    Matches Eric's script step 5:
      - circular mask
      - ROI crop (bounding box of circle)
      - Otsu threshold (BINARY_INV)
      - Tesseract --psm 10 whitelist ABCDabcd
    Plus upscale 4× before Tesseract for better accuracy on small ROIs.
    """
    import cv2
    import pytesseract
    from pytesseract import Output

    img_h, img_w = gray.shape

    # Circular mask (Eric's approach)
    mask = np.zeros(gray.shape, dtype=np.uint8)
    cv2.circle(mask, (cx, cy), radius, 255, -1)
    roi = cv2.bitwise_and(gray, gray, mask=mask)

    # Bounding box crop
    x1 = max(cx - radius, 0);  x2 = min(cx + radius, img_w)
    y1 = max(cy - radius, 0);  y2 = min(cy + radius, img_h)
    roi_crop = roi[y1:y2, x1:x2]

    if roi_crop.size == 0:
        return "", 0.0

    # Otsu threshold (Eric's approach)
    _, roi_thresh = cv2.threshold(
        roi_crop, 0, 255,
        cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU,
    )

    # Upscale 4× — improves Tesseract accuracy on small (~30px) ROIs
    h, w   = roi_thresh.shape
    roi_big = cv2.resize(
        roi_thresh,
        (w * 4, h * 4),
        interpolation=cv2.INTER_CUBIC,
    )
    # Small border so Tesseract doesn't clip the character
    roi_big = cv2.copyMakeBorder(roi_big, 8, 8, 8, 8, cv2.BORDER_CONSTANT, value=0)

    # Tesseract PSM 10 — single character, whitelist ABCDabcd (Eric's approach)
    config = "--psm 10 -c tessedit_char_whitelist=ABCDabcd"
    text   = pytesseract.image_to_string(roi_big, config=config).strip().upper()

    # Accept only a single valid letter
    letter = ""
    for ch in text:
        if ch in "ABCD":
            letter = ch
            break
    if not letter:
        return "", 0.0

    # Get confidence
    try:
        data  = pytesseract.image_to_data(roi_big, config=config, output_type=Output.DICT)
        confs = [int(c) for c in data["conf"] if str(c).isdigit() and int(c) >= 0]
        conf  = round(sum(confs) / len(confs), 2) if confs else 0.0
    except Exception:
        conf = 0.0

    return letter, conf

def ocr_page_encircled(image_path: str) -> OCRPageResult:
    """
    Run the full pipeline on one exam/answer-sheet image.
    Returns OCRPageResult with answers in reading order.
    """
    try:
        import cv2

        img = cv2.imread(image_path)
        if img is None:
            raise FileNotFoundError(f"Cannot read image: {image_path}")

        # ── Preprocessing pipeline (Eric's steps 1-3) ─────────────────────
        bw      = binarize(img)
        cleaned = remove_noise(bw)
        dilated = thick_font(cleaned)   # returns BGR

        # ── HoughCircles on preprocessed gray (Eric's step 4) ─────────────
        # gray    = cv2.cvtColor(dilated, cv2.COLOR_BGR2GRAY)
        # circles = detect_circles(gray)
        # HoughCircles on RAW image (skip preprocessing)
        # gray    = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        # circles = detect_circles(gray)
        gray    = cv2.cvtColor(dilated, cv2.COLOR_BGR2GRAY)
        circles = detect_circles(gray)

        if not circles:
            return OCRPageResult(
                image_path = image_path,
                answers    = [],
                mean_conf  = 0.0,
                error      = (
                    "No circles detected. Ensure the image is clear and "
                    "answers are circled (not underlined or ticked)."
                ),
            )

        # ── Per-circle OCR (Eric's step 5) ────────────────────────────────
        raw: list[DetectedAnswer] = []
        for (cx, cy, r) in circles:
            letter, conf = read_circle_letter(gray, cx, cy, r)
            if letter:
                raw.append(DetectedAnswer(y=cy, x=cx, letter=letter, confidence=conf))

        if not raw:
            return OCRPageResult(
                image_path = image_path,
                answers    = [],
                mean_conf  = 0.0,
                error      = (
                    "Circles detected but no letters could be read. "
                    "Ensure letters A/B/C/D are clearly visible inside each circle."
                ),
            )

        # ── Sort (Eric's step 6) ───────────────────────────────────────────
        answers   = _sort_answers(raw)
        mean_conf = round(sum(a.confidence for a in answers) / len(answers), 2)

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