from pydantic import BaseModel, field_validator, model_validator
from datetime import datetime
from typing import Optional, List

# NEW 2026-10-22 (Doc Rubrica): the character rules live in one module so
# exam.py, paper.py and frontend/src/lib/textField.ts cannot drift apart.
from app.schemas._text import check_student_name


class PaperPageResponse(BaseModel):
    paper_page_id: int
    page_number:   int
    image_path:    str
    uploaded_at:   datetime
    model_config = {"from_attributes": True}


class PaperScoreResponse(BaseModel):
    score_id:        int
    question_number: int
    student_answer:  str
    correct_answer:  str
    is_correct:      bool
    # NEW 2026-10-24 — "correct" | "review" | "wrong". An identification answer
    # is a word, and `is_correct` alone cannot say "the system read this but is
    # not sure enough to mark it". Without this field the review state exists
    # in the database and is invisible to the UI.
    #
    # Defaults to "" so a response built from a row written before the
    # migration still validates instead of 500-ing.
    verdict:         str = ""
    ocr_confidence:  Optional[float] = None
    model_config = {"from_attributes": True}


def _check_student_name(v: str) -> str:
    # FIX 2026-09-22: a blank / spaces-only name was accepted
    # CHANGED 2026-10-22: plus the character classes, and runs of whitespace
    # are collapsed rather than only trimmed - see schemas/_text.py.
    # The 255 cap is unchanged; it mirrors test_papers.student_name.
    return check_student_name(v)


class PaperCreate(BaseModel):
    student_name: str

    @field_validator("student_name")
    @classmethod
    def _name(cls, v: str) -> str:
        return _check_student_name(v)


class PaperUpdate(BaseModel):
    student_name: Optional[str] = None

    @field_validator("student_name")
    @classmethod
    def _name(cls, v: Optional[str]) -> Optional[str]:
        return None if v is None else _check_student_name(v)


class PaperResponse(BaseModel):
    paper_id:     int
    exam_id:      int
    student_name: str
    total_score:  Optional[int] = None
    checked:      bool
    added_at:     datetime
    paper_pages:  List[PaperPageResponse] = []
    paper_scores: List[PaperScoreResponse] = []
    model_config = {"from_attributes": True}


class PaperListResponse(BaseModel):
    paper_id:     int
    student_name: str
    total_score:  Optional[int] = None
    checked:      bool
    added_at:     datetime
    model_config = {"from_attributes": True}


class GradeResponse(BaseModel):
    success:       bool
    total_items:   int
    answered:      int
    correct:       int
    score_percent: float
    question_type: Optional[str] = None   # NEW: "encircled" or "true_false"
    warning:       Optional[str] = None   # NEW: e.g. "Page 2 of the paper was not uploaded."

    # NEW 2026-10-24 — Doc Rubrica's sixth comment, Part IV.
    #
    # MEASURED: without these four, FastAPI SILENTLY DROPS them. grade_paper()
    # returns max_possible=15, needs_review=4, review_items=[20,21,22,24],
    # is_final=False, and a GradeResponse without the fields validates happily
    # and serialises only the seven above. The browser then sees "11 of 19" for
    # a paper whose true score is 15, with nothing to say four items are
    # pending. Pydantic discards unknown keys rather than complaining, so the
    # bug is invisible until someone compares a score by hand.
    #
    # `correct` is a FLOOR and `max_possible` is the ceiling: the student has at
    # least `correct` and at most `correct + needs_review`. Show both.
    #
    # Every default makes an exam that has no identification part behave exactly
    # as it does today: is_final=True, nothing under review.
    max_possible:  int = 0
    needs_review:  int = 0
    review_items:  List[int] = []
    is_final:      bool = True

    @model_validator(mode="after")
    def _ceiling_is_never_below_the_floor(self) -> "GradeResponse":
        """Keep max_possible meaningful when the caller did not send it.

        FOUND while testing this file: `max_possible` defaulting to 0 makes an
        ordinary exam report "10-0 of 12", because nothing with no review items
        sends the field at all. The ceiling is the floor plus whatever is still
        undecided, so it is computed here rather than left to every screen to
        remember.
        """
        if self.max_possible < self.correct:
            self.max_possible = self.correct + self.needs_review
        return self


# ---------------------------------------------------------------------------
# NEW 2026-10-24 — the review queue
#
# Identification is not auto-graded, and the reason is measured rather than
# assumed (app/ml/ocr_identification.py):
#     similarity('UBSECT', 'SUBJECT') = 0.714   <- CORRECT, read badly
#     similarity('OBJECT', 'SUBJECT') = 0.714   <- WRONG, read perfectly
# Identical. No threshold separates them, because what separates them is in the
# handwriting, not the string. So those items come back `review` and a human
# decides them from the cropped image.
# ---------------------------------------------------------------------------

class ReviewItemResponse(BaseModel):
    """One item waiting for a human decision."""

    question_number: int
    student_answer:  str      # what the OCR read, exactly as it read it
    correct_answer:  str      # what the key says
    ocr_confidence:  float
    page_number:     int
    image_path:      str      # so the queue can show the handwriting


class ReviewResolveRequest(BaseModel):
    is_correct: bool


class ReviewResolveResponse(BaseModel):
    success:         bool
    question_number: int
    verdict:         str          # correct | wrong
    correct:         int          # the paper's new total
    needs_review:    int
    review_items:    List[int] = []
    is_final:        bool
    message:         str