from pydantic import BaseModel, field_validator
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