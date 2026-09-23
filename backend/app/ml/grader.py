"""
app/ml/grader.py
================
Compares detected student answers with the answer key.

FIX 2026-09-22:
  * NEW `grade_detected(detected, key_map)`: detected answers are already
    matched to question numbers by ocr_service (paper page N = exam page N),
    so a page that fails no longer shifts every later question.
  * A blank answer ("") is shown as "—", counts as unanswered and wrong.
  * `page_number` is now filled in (it used to be the image path).
  * `grade_pages()` kept for old callers.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from app.ml.ocr_shared import OCRPageResult

BLANK = "—"


@dataclass
class QuestionResult:
    question_number: int
    student_answer:  str
    correct_answer:  str
    is_correct:      bool
    ocr_confidence:  float = 0.0
    page_number:     int   = 1


@dataclass
class GradingResult:
    questions:     list[QuestionResult] = field(default_factory=list)
    total_items:   int   = 0
    answered:      int   = 0
    correct:       int   = 0
    score_percent: float = 0.0
    success:       bool  = True
    reason:        str   = ""

    @property
    def total_score(self) -> int:
        return self.correct


def _norm(ans: str) -> str:
    a = (ans or "").strip().upper()
    if a in ("TRUE",):
        return "T"
    if a in ("FALSE",):
        return "F"
    return a


def grade_detected(
    detected: dict[int, tuple[str, float, int]],   # {q: (letter, conf, page_number)}
    answer_key_map: dict[int, str],                # {q: correct}
) -> GradingResult:
    if not answer_key_map:
        return GradingResult(success=False, reason="No answer key found for this exam.")
    if not any(_norm(v[0]) for v in detected.values()):
        return GradingResult(
            success=False,
            reason=("Could not read any answers from the uploaded paper. Make sure the photo is clear, "
                    "well-lit, and shows the whole page."),
        )

    questions: list[QuestionResult] = []
    correct = answered = 0
    for q in sorted(answer_key_map):
        key = _norm(answer_key_map[q])
        letter, conf, page_no = detected.get(q, ("", 0.0, 1))
        student = _norm(letter)
        if student:
            answered += 1
        ok = bool(student) and student == key
        correct += ok
        questions.append(QuestionResult(
            question_number=q, student_answer=student or BLANK, correct_answer=key,
            is_correct=ok, ocr_confidence=conf if student else 0.0, page_number=page_no,
        ))

    total = len(answer_key_map)
    return GradingResult(
        questions=questions, total_items=total, answered=answered, correct=correct,
        score_percent=round(correct / total * 100, 1) if total else 0.0, success=True,
    )


def grade_pages(
    page_results: list[OCRPageResult],
    answer_key_map: dict[int, str],
    confidence_map: Optional[dict[int, float]] = None,
) -> GradingResult:
    """Old API: answers of all pages numbered in order 1..N."""
    detected: dict[int, tuple[str, float, int]] = {}
    q = 0
    for page_no, pr in enumerate(page_results, start=1):
        if pr.error:
            continue
        for a in pr.answers:
            q += 1
            conf = confidence_map.get(q, a.confidence) if confidence_map else a.confidence
            detected[q] = (a.letter, conf, page_no)
    return grade_detected(detected, answer_key_map)