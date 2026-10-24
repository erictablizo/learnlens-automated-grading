from pydantic import BaseModel, Field, field_validator
from datetime import datetime
from typing import Optional, List

# NEW 2026-10-22 (Doc Rubrica): the character rules live in one module so
# exam.py, paper.py and frontend/src/lib/textField.ts cannot drift apart.
from app.schemas._text import check_exam_name, check_description


# NEW 2026-10-24 — Doc Rubrica's sixth comment. Declared BEFORE ExamPageResponse
# because that model now nests it.
#
# One declared part of one page: "items 13 to 18 are written letters A-F".
# Her English 101 page 2 has four of these, and one question_type per page
# cannot describe it.
class ExamPagePartResponse(BaseModel):
    part_id:       int
    exam_id:       int
    page_id:       int
    first_item:    int
    last_item:     int
    question_type: str
    letters:       str
    model_config = {"from_attributes": True}


class ExamPageResponse(BaseModel):
    page_id: int
    page_number: int
    image_path: str
    uploaded_at: datetime
    # NEW 2026-10-24 — the ranges this page was declared with, so the exam
    # screen can show "items 13-18 written letter" per page and the Declare
    # Parts dialog can open pre-filled, instead of one extra request per page.
    #
    # REQUIRES a matching eager load. MEASURED: with get_exam()'s current
    # `selectinload(Exam.pages)` and nothing more, touching page.parts raises
    #     MissingGreenlet: greenlet_spawn has not been called
    # which FastAPI turns into a 500 on GET /exams/{id}. exam_service.get_exam()
    # must chain it:
    #     selectinload(Exam.pages).selectinload(ExamPage.parts)
    # Adding this field without that line breaks the exam detail page.
    parts: List[ExamPagePartResponse] = []
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


# ---------------------------------------------------------------------------
# NEW 2026-10-24 — declaring a page's parts
# ---------------------------------------------------------------------------

class ExamPagePartIn(BaseModel):
    """One part of the declaration POSTed to /answer-key/generate-parts."""

    first_item:    int = Field(..., ge=1, le=500)
    last_item:     int = Field(..., ge=1, le=500)
    question_type: str = Field(..., min_length=1, max_length=32)
    letters:       str = Field("ABCD", min_length=1, max_length=16)

    @field_validator("question_type", "letters")
    @classmethod
    def _tidy(cls, v: str) -> str:
        return v.strip()

    @field_validator("last_item")
    @classmethod
    def _range_is_forwards(cls, v: int, info) -> int:
        first = info.data.get("first_item")
        if first is not None and v < first:
            raise ValueError(f"the last item ({v}) is before the first ({first})")
        return v


class ExamPagePartsRequest(BaseModel):
    """Body of POST /exams/{exam_id}/answer-key/generate-parts?page_id=N.

    The service re-validates all of this in `exam_service.validate_parts()`.
    These limits only stop a malformed request reaching it; the real rules - no
    overlapping ranges, a question type a part can actually have, a sane letters
    alphabet - live in one place there rather than being half-stated twice.
    """

    parts: List[ExamPagePartIn] = Field(..., min_length=1, max_length=20)


class AnswerKeyResponse(BaseModel):
    answer_key_id: int
    page_id: Optional[int] = None          # NEW: lets the viewer group answers by page
    question_number: int
    correct_answer: str
    ocr_confidence: Optional[float] = None
    generated_at: datetime
    model_config = {"from_attributes": True}


def _check_name(v: str) -> str:
    # CHANGED 2026-10-22: the required / length checks moved into
    # schemas/_text.py together with the character classes, so this file, the
    # paper schema and the browser all say the same words in the same order.
    #
    # Two behaviour changes, both deliberate:
    #  - the message now reads "at least 7 characters LONG", matching what the
    #    teacher already sees on screen (EditExamForm has said "long" since
    #    September; this file said "characters." - the same rule, two wordings);
    #  - runs of whitespace are collapsed, not just trimmed, so "Midterm   Exam"
    #    is stored the way it looks.
    return check_exam_name(v)


def _check_description(v: str) -> str:
    # FIX 2026-09-22 (thesis p.5 observation): a blank description was accepted.
    # CHANGED 2026-10-22: plus the character classes - see schemas/_text.py.
    return check_description(v)


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


class GenerateAnswerKeyPartsResponse(BaseModel):   # NEW 2026-10-24
    """What POST /answer-key/generate-parts returns.

    `blank_items` is the point of difference from GenerateAnswerKeyResponse: a
    declared item the OCR could not read keeps its slot in the key as "" rather
    than being dropped, because dropping item 20 would make item 21's answer the
    key for item 20 and silently shift every later item. Those numbers come back
    here so the teacher is told which ones to fill in.
    """

    success:     bool
    detected:    int                      # items actually read
    total_items: int                      # items declared
    blank_items: List[int] = []           # declared but unreadable
    parts:       List[dict] = []
    message:     str
    warnings:    List[str] = []