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

def detect_true_false_line_based(gray: "np.ndarray") -> list[tuple[int, int, str]]:
    """
    Detect written True/False answers using LINE-BASED detection.
    
    Strategy:
    1. Divide image into horizontal strips (one per question line)
    2. Extract LEFT MARGIN of each strip (answer region)
    3. OCR the margin region to find T or F
    4. Take ONLY the first T/F found per line
    5. Return one answer per line
    
    Returns list of (y, x, text) tuples where text is 'T' or 'F'.
    """
    import cv2
    import pytesseract
    
    # Image dimensions
    height, width = gray.shape

    # Skip header/instructions (~400px at top)
    HEADER_HEIGHT = 800
    usable_height = height - HEADER_HEIGHT
    
    # Estimate line height (assume ~60 pixels per question line)
    # Adjust based on your actual spacing
    # Commented on 2026-09-18:
    # LINE_HEIGHT = 160
    LINE_HEIGHT = usable_height // 20  # Should be ~131px
    num_lines = 20
    
    # Margin to search (leftmost 100px where answers should be)
    MARGIN_WIDTH = 200
    
    true_false_answers = []
    
    print(f"DEBUG T/F: Image size {width}x{height}, ~{num_lines} lines detected")
    
    # Process each line
    for line_num in range(num_lines):
        y_start = line_num * LINE_HEIGHT
        y_end = min(y_start + LINE_HEIGHT, height)
        
        # Extract LEFT MARGIN ONLY (answer region)
        margin_region = gray[y_start:y_end, 0:MARGIN_WIDTH]
        
        if margin_region.size == 0:
            continue
        
        # OCR the margin region
        text = pytesseract.image_to_string(
            margin_region,
            config="--psm 6"
        ).strip().upper()
        
        if not text:
            continue
        
        print(f"DEBUG T/F Line {line_num}: Margin OCR found: '{text}'")
        
        # Extract FIRST T or F from the text
        # This handles cases like "TRUE something else" or "T/F confused"
        first_tf = None
        for char in text:
            if char == 'T':
                first_tf = 'T'
                break
            elif char == 'F':
                first_tf = 'F'
                break
        
        if first_tf:
            # Store with y-position of line center
            y_center = y_start + (LINE_HEIGHT // 2)
            true_false_answers.append((y_center, 0, first_tf))
            print(f"DEBUG T/F Line {line_num}: Detected '{first_tf}'")
    
    print(f"DEBUG T/F: Total detected: {len(true_false_answers)} answers")
    return true_false_answers

# Commented on 2026-09-17
# def detect_true_false(gray: "np.ndarray") -> list[tuple[int, int, str]]:
#     """Detect WRITTEN True/False answers."""
#     import cv2
#     import pytesseract
    
#     # Threshold for text detection
#     _, thresh = cv2.threshold(gray, 150, 255, cv2.THRESH_BINARY_INV)
    
#     # Find contours (text regions)
#     contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
#     true_false_answers = []
    
#     for contour in contours:
#         x, y, w, h = cv2.boundingRect(contour)
        
#         # Filter by size - True/False should be short
#         if w < 15 or h < 15 or w > 200 or h > 80:
#             continue
        
#         # Extract region
#         roi = gray[y:y+h, x:x+w]
        
#         # OCR the text
#         text = pytesseract.image_to_string(
#             roi,
#             config="--psm 6"
#         ).strip().upper()
        
#         if not text or len(text) == 0:
#             continue
        
#         # Check if it's T or F
#         if text.startswith('T') or text == 'TRUE' or text == 'T':
#             true_false_answers.append((y, x, 'T'))
#         elif text.startswith('F') or text == 'FALSE' or text == 'F':
#             true_false_answers.append((y, x, 'F'))
    
#     # Sort by position (top to bottom, left to right)
#     ROW_TOLERANCE = 40
#     true_false_answers.sort(key=lambda item: (item[0] // ROW_TOLERANCE, item[1]))
    
#     return true_false_answers

def detect_true_false(gray: "np.ndarray") -> list[tuple[int, int, str]]:
    """
    Detect written True/False answers using LINE-BASED detection.
    
    This is the main entry point - uses the improved line-based approach.
    
    Returns list of (y, x, text) tuples where text is 'T' or 'F'.
    """
    return detect_true_false_line_based(gray)

# Commented on 2026-09-17
# def ocr_page_true_false(image_path: str) -> OCRPageResult:
#     """
#     Process an exam sheet with written True/False answers.
    
#     Args:
#         image_path: Path to the exam image
        
#     Returns:
#         OCRPageResult with detected T/F answers in reading order
#     """
#     try:
#         import cv2
 
#         img = cv2.imread(image_path)
#         if img is None:
#             raise FileNotFoundError(f"Cannot read image: {image_path}")
 
#         print(f"DEBUG: Processing True/False questions from {image_path}")
 
#         # ── Preprocessing pipeline ─────────────────────────────────────────
#         bw      = binarize(img)
#         cleaned = remove_noise(bw)
#         dilated = thick_font(cleaned)
 
#         # ── Detect True/False answers ───────────────────────────────────────
#         gray    = cv2.cvtColor(dilated, cv2.COLOR_BGR2GRAY)
#         written_data = detect_true_false(gray)
 
#         if not written_data:
#             return OCRPageResult(
#                 image_path = image_path,
#                 answers    = [],
#                 mean_conf  = 0.0,
#                 error      = (
#                     "No True/False answers detected. Ensure T or F is clearly written."
#                 ),
#             )
 
#         # ── Convert to DetectedAnswer objects ───────────────────────────────
#         raw: list[DetectedAnswer] = []
#         for y, x, text in written_data:
#             raw.append(DetectedAnswer(y=y, x=x, letter=text, confidence=0.90))
 
#         if not raw:
#             return OCRPageResult(
#                 image_path = image_path,
#                 answers    = [],
#                 mean_conf  = 0.0,
#                 error      = (
#                     "No answers could be read. "
#                     "Ensure T or F is clearly written."
#                 ),
#             )
 
#         # ── Sort ───────────────────────────────────────────────────────────
#         answers   = _sort_answers(raw)
#         mean_conf = round(sum(a.confidence for a in answers) / len(answers), 2)

#         print(f"Answers from {answers}")
 
#         return OCRPageResult(
#             image_path = image_path,
#             answers    = answers,
#             mean_conf  = mean_conf,
#         )
 
#     except Exception as exc:
#         return OCRPageResult(
#             image_path = image_path,
#             answers    = [],
#             mean_conf  = 0.0,
#             error      = str(exc),
#         )

def ocr_page_true_false(image_path: str) -> OCRPageResult:
    """
    Process an exam sheet with written True/False answers.
    
    Uses LINE-BASED detection to extract answers from left margin.
    
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
 
        print(f"\nDEBUG: Processing True/False questions from {image_path}")
 
        # ── Preprocessing pipeline ─────────────────────────────────────────
        bw      = binarize(img)
        cleaned = remove_noise(bw)
        dilated = thick_font(cleaned)
 
        # ── Detect True/False answers (LINE-BASED) ────────────────────────
        gray    = cv2.cvtColor(dilated, cv2.COLOR_BGR2GRAY)
        written_data = detect_true_false(gray)
 
        if not written_data:
            return OCRPageResult(
                image_path = image_path,
                answers    = [],
                mean_conf  = 0.0,
                error      = (
                    "No True/False answers detected. Ensure T or F is clearly written "
                    "at the beginning of each question line."
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
                    "Ensure T or F is clearly written at line start."
                ),
            )
 
        # ── Sort ───────────────────────────────────────────────────────────
        answers   = _sort_answers(raw)
        mean_conf = round(sum(a.confidence for a in answers) / len(answers), 2)
 
        print(f"DEBUG: Final T/F Answer Count: {len(answers)}")
        for ans in answers:
            print(f"  Q: {ans.letter}")
 
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