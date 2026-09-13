"""
app/ml/ocr_true_false.py — True/False OCR
==========================================
 
Detects written True/False answers (T or F).
Uses contour detection and OCR to read written T/F responses.
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

def detect_true_false(gray: "np.ndarray") -> list[tuple[int, int, str]]:
    """Detect WRITTEN True/False answers."""
    import cv2
    import pytesseract
    
    # Threshold for text detection
    _, thresh = cv2.threshold(gray, 150, 255, cv2.THRESH_BINARY_INV)
    
    # Find contours (text regions)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    true_false_answers = []
    
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        
        # Filter by size - True/False should be short
        if w < 15 or h < 15 or w > 200 or h > 80:
            continue
        
        # Extract region
        roi = gray[y:y+h, x:x+w]
        
        # OCR the text
        text = pytesseract.image_to_string(
            roi,
            config="--psm 6"
        ).strip().upper()
        
        if not text or len(text) == 0:
            continue
        
        # Check if it's T or F
        if text.startswith('TRU') or text == 'TRUE' or text == 'T':
            true_false_answers.append((y, x, 'T'))
        elif text.startswith('FAL') or text == 'FALSE' or text == 'F':
            true_false_answers.append((y, x, 'F'))
    
    # Sort by position (top to bottom, left to right)
    ROW_TOLERANCE = 40
    true_false_answers.sort(key=lambda item: (item[0] // ROW_TOLERANCE, item[1]))
    
    return true_false_answers

def ocr_page_true_false(image_path: str) -> OCRPageResult:
    """
    Process an exam sheet with written True/False answers.
    
    Args:
        image_path: Path to the exam image
        
    Returns:
        OCRPageResult with detected T/F answers in reading order
    """
    try:
        import cv2
 
        img = cv2.imread(image_path)
        if img is None:
            raise FileNotFoundError(f"Cannot read image: {image_path}")
 
        print(f"DEBUG: Processing True/False questions from {image_path}")
 
        # ── Preprocessing pipeline ─────────────────────────────────────────
        bw      = binarize(img)
        cleaned = remove_noise(bw)
        dilated = thick_font(cleaned)
 
        # ── Detect True/False answers ───────────────────────────────────────
        gray    = cv2.cvtColor(dilated, cv2.COLOR_BGR2GRAY)
        written_data = detect_true_false(gray)
 
        if not written_data:
            return OCRPageResult(
                image_path = image_path,
                answers    = [],
                mean_conf  = 0.0,
                error      = (
                    "No True/False answers detected. Ensure T or F is clearly written."
                ),
            )
 
        # ── Convert to DetectedAnswer objects ───────────────────────────────
        raw: list[DetectedAnswer] = []
        for y, x, text in written_data:
            raw.append(DetectedAnswer(y=y, x=x, letter=text, confidence=0.90))
 
        if not raw:
            return OCRPageResult(
                image_path = image_path,
                answers    = [],
                mean_conf  = 0.0,
                error      = (
                    "No answers could be read. "
                    "Ensure T or F is clearly written."
                ),
            )
 
        # ── Sort ───────────────────────────────────────────────────────────
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