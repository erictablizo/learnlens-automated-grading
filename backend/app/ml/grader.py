"""
app/ml/grader.py
================
Grading logic for LearnLens.
 
Takes OCR results from app/ml/ocr.py and compares them
against the stored answer key to produce per-question scores.
 
Usage
-----
    from app.ml.ocr import ocr_page
    from app.ml.grader import grade_pages
 
    page_results = [ocr_page(path) for path in image_paths]
    result       = grade_pages(page_results, answer_key_map)
"""
 
from __future__ import annotations
 
from dataclasses import dataclass, field
from typing import Optional
 
from app.ml.ocr import OCRPageResult
 
 
# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------
 
@dataclass
class QuestionResult:
    """Grading result for a single question."""
    question_number: int
    student_answer:  str        # '' or '—' if not detected
    correct_answer:  str
    is_correct:      bool
    ocr_confidence:  float = 0.0
    page_number:     int   = 1
 
 
@dataclass
class GradingResult:
    """Aggregate result for a full paper."""
    questions:     list[QuestionResult] = field(default_factory=list)
    total_items:   int   = 0
    answered:      int   = 0
    correct:       int   = 0
    score_percent: float = 0.0
    success:       bool  = True
    reason:        str   = ""
 
    # Convenience
    @property
    def total_score(self) -> int:
        return self.correct
 
 
# ---------------------------------------------------------------------------
# Core grading function
# ---------------------------------------------------------------------------
 
def grade_pages(
    page_results: list[OCRPageResult],
    answer_key_map: dict[int, str],          # {question_number: correct_letter}
    confidence_map: Optional[dict[int, float]] = None,  # {question_number: conf}
) -> GradingResult:
    """
    Compare OCR-detected answers against the answer key.
 
    Parameters
    ----------
    page_results    : list of OCRPageResult (one per uploaded page)
    answer_key_map  : {question_number: 'A'|'B'|'C'|'D'}
    confidence_map  : optional override for per-question confidence
 
    Returns
    -------
    GradingResult with per-question breakdown and summary stats.
    """
    if not answer_key_map:
        return GradingResult(success=False, reason="No answer key found for this exam.")
 
    # Flatten all detected answers across pages into {question_number: (letter, conf, page)}
    detected: dict[int, tuple[str, float, int]] = {}
    question_offset = 0
 
    for page_result in page_results:
        if page_result.error:
            # Skip pages that failed preprocessing but continue with others
            continue
 
        for idx, answer in enumerate(page_result.answers, start=1):
            q_num = question_offset + idx
            detected[q_num] = (answer.letter, answer.confidence, page_result.image_path)
 
        question_offset += len(page_result.answers)
 
    if not detected:
        return GradingResult(
            success = False,
            reason  = (
                "Could not detect any encircled answers from the uploaded images. "
                "Please ensure the images are clear, well-lit, and that answers "
                "are clearly circled."
            ),
        )
 
    # Build per-question results
    questions: list[QuestionResult] = []
    correct_count = 0
    answered_count = 0
 
    for q_num in sorted(answer_key_map.keys()):
        correct_ans = answer_key_map[q_num].upper()
 
        if q_num in detected:
            student_ans, conf, _ = detected[q_num]
            answered_count += 1
        else:
            student_ans = "—"
            conf = 0.0
 
        # Override confidence if provided
        if confidence_map and q_num in confidence_map:
            conf = confidence_map[q_num]
 
        is_correct = student_ans == correct_ans and student_ans not in ("", "—")
        if is_correct:
            correct_count += 1
 
        questions.append(QuestionResult(
            question_number = q_num,
            student_answer  = student_ans,
            correct_answer  = correct_ans,
            is_correct      = is_correct,
            ocr_confidence  = conf,
        ))
 
    total_items   = len(answer_key_map)
    score_percent = round(correct_count / total_items * 100, 1) if total_items else 0.0
 
    return GradingResult(
        questions     = questions,
        total_items   = total_items,
        answered      = answered_count,
        correct       = correct_count,
        score_percent = score_percent,
        success       = True,
    )