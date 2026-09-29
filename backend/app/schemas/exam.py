from pydantic import BaseModel, field_validator
from datetime import datetime
from typing import Optional, List


class ExamPageResponse(BaseModel):
    page_id: int
    page_number: int
    image_path: str
    uploaded_at: datetime
    model_config = {"from_attributes": True}


class ExamPageNumberUpdate(BaseModel):          # NEW 2026-09-29
    """Body of PUT /exams/{exam_id}/pages/{page_id} — move a page to another number."""
    page_number: int

    @field_validator("page_number")
    @classmethod
    def _page_number(cls, v: int) -> int:
        if v < 1:
            raise ValueError("Page number must be 1 or higher.")
        if v > 50:
            raise ValueError("Page number must be at most 50.")
        return v


class ExamPageNumberResponse(BaseModel):        # NEW 2026-09-29
    success: bool
    changed: bool
    reset: int
    message: str


class AnswerKeyResponse(BaseModel):
    answer_key_id: int
    page_id: Optional[int] = None          # NEW: lets the viewer group answers by page
    question_number: int
    correct_answer: str
    ocr_confidence: Optional[float] = None
    generated_at: datetime
    model_config = {"from_attributes": True}


def _check_name(v: str) -> str:
    v = (v or "").strip()
    if not v:
        raise ValueError("Exam name is required.")
    if len(v) < 7:
        raise ValueError("Exam name must be at least 7 characters.")
    if len(v) > 255:
        raise ValueError("Exam name must be at most 255 characters.")
    return v


def _check_description(v: str) -> str:
    # FIX 2026-09-22 (thesis p.5 observation): a blank description was accepted.
    v = (v or "").strip()
    if not v:
        raise ValueError("Description is required.")
    return v


class ExamCreate(BaseModel):
    exam_name: str
    description: str

    @field_validator("exam_name")
    @classmethod
    def _name(cls, v: str) -> str:
        return _check_name(v)

    @field_validator("description")
    @classmethod
    def _desc(cls, v: str) -> str:
        return _check_description(v)


class ExamUpdate(BaseModel):
    exam_name: Optional[str] = None
    description: Optional[str] = None

    @field_validator("exam_name")
    @classmethod
    def _name(cls, v: Optional[str]) -> Optional[str]:
        return None if v is None else _check_name(v)

    @field_validator("description")
    @classmethod
    def _desc(cls, v: Optional[str]) -> Optional[str]:
        return None if v is None else _check_description(v)


class ExamResponse(BaseModel):
    exam_id: int
    exam_name: str
    description: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    pages: List[ExamPageResponse] = []
    answer_keys: List[AnswerKeyResponse] = []
    model_config = {"from_attributes": True}


class ExamListResponse(BaseModel):
    exam_id: int
    exam_name: str
    description: str
    created_at: datetime
    model_config = {"from_attributes": True}


class GenerateAnswerKeyResponse(BaseModel):   # NEW
    success: bool
    detected: int
    expected_items: Optional[int] = None
    question_type: str
    message: str
    warning: Optional[str] = None