"""
app/ml/ocr.py — Main OCR Router
================================
 
Routes exam image processing to the correct OCR module based on question type:
- "encircled": Multiple Choice (A/B/C/D in circles) → ocr_encircled
- "true_false": True/False (Written T/F) → ocr_true_false
 
This is the main entry point for OCR processing.
"""
 
from __future__ import annotations
 
from app.ml.ocr_shared import OCRPageResult, setup_tesseract
from app.ml.ocr_encircled import ocr_page_encircled
from app.ml.ocr_true_false import ocr_page_true_false
 
 
# ---------------------------------------------------------------------------
# Main router
# ---------------------------------------------------------------------------
 
def ocr_page(image_path: str, question_type: str = "encircled") -> OCRPageResult:
    """
    Process an exam answer sheet image and detect answers.
    
    Routes to the appropriate OCR module based on question_type.
    
    Args:
        image_path: Path to the exam/answer-sheet image
        question_type: Type of questions in the exam
                      - "encircled": Multiple Choice (circled A/B/C/D)
                      - "true_false": True/False (written T/F)
                      Default: "encircled"
    
    Returns:
        OCRPageResult with detected answers in reading order
        
    Example:
        >>> result = ocr_page("exam_page1.jpg", question_type="encircled")
        >>> if result.error:
        ...     print(f"Error: {result.error}")
        ... else:
        ...     for ans in result.answers:
        ...         print(f"Q{ans.y}: {ans.letter}")
    """
    
    print(f"\n{'='*70}")
    print(f"OCR_PAGE ROUTER: Processing {image_path}")
    print(f"Question Type: {question_type}")
    print(f"{'='*70}\n")
    
    # Route to appropriate module
    if question_type == "true_false":
        return ocr_page_true_false(image_path)
    elif question_type == "encircled":
        return ocr_page_encircled(image_path)
    else:
        return OCRPageResult(
            image_path = image_path,
            answers    = [],
            mean_conf  = 0.0,
            error      = f"Unknown question_type: {question_type}. "
                        f"Use 'encircled' or 'true_false'.",
        )
 
 
# ---------------------------------------------------------------------------
# Re-export shared classes for backward compatibility
# ---------------------------------------------------------------------------
 
from app.ml.ocr_shared import (
    DetectedAnswer,
    OCRPageResult,
)
 
__all__ = [
    "ocr_page",
    "DetectedAnswer",
    "OCRPageResult",
    "setup_tesseract",
]