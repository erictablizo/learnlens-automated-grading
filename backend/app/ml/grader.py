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

CHANGED 2026-10-23 — Doc Rubrica, sixth comment, Part IV (Identification).
--------------------------------------------------------------------------
An identification answer is a WORD, and `student == key` is the wrong test for
one. `_norm` would compare 'UBSECT' with 'SUBJECT' and mark the student wrong
for the OCR's mistake.

But fuzzy matching cannot be trusted to decide it either, and this is measured,
not assumed (ocr_identification.py has the full table):

    similarity('UBSECT', 'SUBJECT') = 0.714   <- CORRECT, read badly
    similarity('OBJECT', 'SUBJECT') = 0.714   <- WRONG, read perfectly

Identical. No threshold separates them, because what separates them is in the
handwriting, not in the string.

So a question now has THREE outcomes. `verdict` is "correct", "review" or
"wrong", and `needs_review` counts the middle one. A paper with any review
items is NOT finished - `is_final` is False - and the teacher decides those
from the cropped images before the score means anything.

`is_correct` is kept, and a review item has `is_correct=False`, because the
system must never hand out a mark it cannot justify. That makes the score a
FLOOR: the student has at least `correct`, and at most `correct + needs_review`.
Both numbers are reported, so the UI can say "22-26 of 30, 4 to review" rather
than quietly picking one.

Letter questions (encircled, written_letter, true_false) are unchanged: exact
comparison, two outcomes. Only the question numbers passed in
`identification_items` get the three-state treatment.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, Optional

from app.ml.ocr_shared import OCRPageResult

BLANK = "—"

CORRECT = "correct"
REVIEW  = "review"
WRONG   = "wrong"


@dataclass
class QuestionResult:
    question_number: int
    student_answer:  str
    correct_answer:  str
    is_correct:      bool
    ocr_confidence:  float = 0.0
    page_number:     int   = 1
    verdict:         str   = WRONG          # correct | review | wrong
    similarity:      float = 0.0            # identification only; 1.0 = exact

    @property
    def needs_review(self) -> bool:
        return self.verdict == REVIEW


@dataclass
class GradingResult:
    questions:     list[QuestionResult] = field(default_factory=list)
    total_items:   int   = 0
    answered:      int   = 0
    correct:       int   = 0
    score_percent: float = 0.0
    success:       bool  = True
    reason:        str   = ""
    needs_review:  int   = 0

    @property
    def total_score(self) -> int:
        return self.correct

    @property
    def max_possible(self) -> int:
        """The score if every item under review turns out to be right."""
        return self.correct + self.needs_review

    @property
    def is_final(self) -> bool:
        """False while any item still needs a human decision. A paper that is
        not final must not be shown as a finished score."""
        return self.needs_review == 0

    @property
    def review_items(self) -> list[int]:
        return [q.question_number for q in self.questions if q.verdict == REVIEW]


def _norm(ans: str) -> str:
    a = (ans or "").strip().upper()
    if a in ("TRUE",):
        return "T"
    if a in ("FALSE",):
        return "F"
    return a


def grade_detected(
    detected: dict[int, tuple[str, float, int]],   # {q: (answer, conf, page_number)}
    answer_key_map: dict[int, str],                # {q: correct}
    identification_items: Optional[Iterable[int]] = None,
) -> GradingResult:
    """
    `identification_items` — the question numbers that are Part IV style word
    answers, from the page's declared parts (exam_page_parts). Anything not in
    it is compared exactly, exactly as before. Passing nothing therefore
    reproduces the old behaviour for every existing caller.
    """
    from app.ml.ocr_identification import grade_identification, similarity

    ident = set(identification_items or ())

    if not answer_key_map:
        return GradingResult(success=False, reason="No answer key found for this exam.")
    if not any(_norm(v[0]) for v in detected.values()):
        return GradingResult(
            success=False,
            reason=("Could not read any answers from the uploaded paper. Make sure the photo is clear, "
                    "well-lit, and shows the whole page."),
        )

    blank_key = [q for q, a in answer_key_map.items() if not (a or "").strip()]
    if blank_key:
        shown = ", ".join(str(q) for q in sorted(blank_key)[:10])
        return GradingResult(
            success=False,
            reason=(f"The answer key still has {len(blank_key)} blank item(s) ({shown}). "
                    "Fill them in before checking papers - a blank key cannot grade anything."),
        )

    questions: list[QuestionResult] = []
    correct = answered = review = 0
    for q in sorted(answer_key_map):
        raw_key = answer_key_map[q]
        letter, conf, page_no = detected.get(q, ("", 0.0, 1))

        if q in ident:
            # A word. Three outcomes, and the raw text is kept as written so
            # the teacher sees what the OCR actually read, not a cleaned-up
            # version of it.
            student_shown = (letter or "").strip()
            key_shown = (raw_key or "").strip()
            if student_shown:
                answered += 1
            verdict = grade_identification(student_shown, key_shown) if student_shown else WRONG
            sim = round(similarity(student_shown, key_shown), 3) if student_shown else 0.0
            ok = verdict == CORRECT
            correct += ok
            review += verdict == REVIEW
            questions.append(QuestionResult(
                question_number=q, student_answer=student_shown or BLANK,
                correct_answer=key_shown, is_correct=ok,
                ocr_confidence=conf if student_shown else 0.0, page_number=page_no,
                verdict=verdict, similarity=sim,
            ))
            continue

        key = _norm(raw_key)
        student = _norm(letter)
        if student:
            answered += 1
        ok = bool(student) and student == key
        correct += ok
        questions.append(QuestionResult(
            question_number=q, student_answer=student or BLANK, correct_answer=key,
            is_correct=ok, ocr_confidence=conf if student else 0.0, page_number=page_no,
            verdict=CORRECT if ok else WRONG, similarity=1.0 if ok else 0.0,
        ))

    total = len(answer_key_map)
    return GradingResult(
        questions=questions, total_items=total, answered=answered, correct=correct,
        score_percent=round(correct / total * 100, 1) if total else 0.0, success=True,
        needs_review=review,
    )


def grade_pages(
    page_results: list[OCRPageResult],
    answer_key_map: dict[int, str],
    confidence_map: Optional[dict[int, float]] = None,
    identification_items: Optional[Iterable[int]] = None,
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
    return grade_detected(detected, answer_key_map, identification_items)