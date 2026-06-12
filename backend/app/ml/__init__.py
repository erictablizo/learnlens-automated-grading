from app.ml.ocr import ocr_page, setup_tesseract, OCRPageResult, DetectedAnswer
from app.ml.grader import grade_pages, GradingResult, QuestionResult
 
__all__ = [
    "ocr_page",
    "setup_tesseract",
    "OCRPageResult",
    "DetectedAnswer",
    "grade_pages",
    "GradingResult",
    "QuestionResult",
]