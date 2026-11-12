"""
app/schemas/key_image.py
========================
NEW 2026-11-12 — rebuilding an answer key from a picture of the answers
(Alex Passion, post-UAT page 3).

TWO SHAPES, because the feature is two steps. `KeyImagePreview` is what the
image SAYS; `KeyImageApplyResult` is what was WRITTEN. They are deliberately
not the same model: a preview that looked like a result would invite a client
to treat reading as writing, and reading an answer key is free while writing
one re-checks every paper in the exam.
"""
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator


class KeyImageItem(BaseModel):
    """One answer read off the image, beside the one on file."""

    question_number: int
    answer: str
    # None when this item has no row in the key yet.
    current_answer: Optional[str] = None
    # "same" | "changed" | "not_in_key"
    status: str
    # False when the OCR was repaired rather than read cleanly - a fuzzy
    # TRUE/FALSE match, a letter taken from its first character, or an item
    # number recovered from its position. The screen marks these.
    confident: bool
    note: str = ""
    # The OCR line this came from, so a teacher can see what was actually read.
    raw: str = ""


class KeyImagePreview(BaseModel):
    exam_id: int
    page_id: int
    page_number: int
    # Which preprocessing and page-segmentation mode won, e.g. "otsu/psm4".
    # Returned because when a read goes wrong this is the first thing worth
    # knowing, and it costs nothing to carry.
    read_with: str
    items: List[KeyImageItem]
    changed: int
    unchanged: int
    not_in_key: int
    needs_check: int
    # Lines the parser refused to treat as answers - wrapped question text,
    # headers. Shown so a teacher can tell "it ignored the title" from "it
    # lost item 7".
    skipped_lines: List[str] = []
    problems: List[str] = []


class KeyImageAnswer(BaseModel):
    """One confirmed answer the teacher is writing."""

    question_number: int = Field(ge=1)
    answer: str

    @field_validator("answer")
    @classmethod
    def not_blank(cls, v: str) -> str:
        cleaned = (v or "").strip()
        if not cleaned:
            # grade_detected refuses to grade an exam with a blank key item,
            # so accepting one here would silently break checking for the
            # whole exam. answer_key_service raises BlankAnswerKey for the
            # same reason; this just says so a round trip earlier.
            raise ValueError("An answer key item cannot be blank.")
        return cleaned[:100]          # AnswerKey.correct_answer is String(100)


class KeyImageApply(BaseModel):
    """What the teacher confirmed after correcting the flagged items.

    Only the items being CHANGED are sent. Each one costs a full re-check of
    every paper graded against it, so sending the unchanged ones back would
    turn a three-item correction into a twenty-item cascade.
    """

    items: List[KeyImageAnswer] = Field(min_length=1, max_length=500)

    @field_validator("items")
    @classmethod
    def no_duplicate_numbers(cls, v: List[KeyImageAnswer]) -> List[KeyImageAnswer]:
        seen = set()
        dupes = sorted({i.question_number for i in v
                        if i.question_number in seen or seen.add(i.question_number)})
        if dupes:
            raise ValueError(
                "The same item was sent twice: "
                + ", ".join(str(d) for d in dupes)
            )
        return v


class KeyImageRescored(BaseModel):
    paper_id: int
    student_name: str
    old_score: Optional[int] = None
    new_score: Optional[int] = None
    was_checked: bool
    now_checked: bool


class KeyImageUpdated(BaseModel):
    question_number: int
    old_answer: str
    correct_answer: str
    papers_affected: int
    papers_rescored: List[KeyImageRescored] = []


class KeyImageSkipped(BaseModel):
    question_number: int
    reason: str


class KeyImageApplyResult(BaseModel):
    exam_id: int
    items_updated: int
    items_flipped: int
    # DISTINCT papers, not the sum across items: correcting three items on a
    # 36-paper exam touches 36 papers, not 108.
    papers_rescored: int
    updated: List[KeyImageUpdated] = []
    skipped: List[KeyImageSkipped] = []