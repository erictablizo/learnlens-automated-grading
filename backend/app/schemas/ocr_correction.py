"""
app/schemas/ocr_correction.py
=============================
NEW 2026-11-19 — the specimen-correction table's wire shapes.

The validators here repeat the migration's CHECK constraints on purpose. The
database refusal is the one that cannot be bypassed; this one exists so the
administrator gets a sentence naming the problem instead of a 500 from a
constraint violation.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

BLANK_GLYPH = "—"      # grader.BLANK
CONTESTED = "|"             # ocr_item_numbers.CONTESTED_SEP


def _clean(v: str, field: str) -> str:
    s = (v or "").strip()
    if not s:
        raise ValueError(f"{field} cannot be blank.")
    if s == BLANK_GLYPH:
        raise ValueError(
            f"{field} cannot be the blank mark. An item the student left empty "
            f"must stay empty - correcting it would put an answer on every "
            f"unanswered item in the installation."
        )
    if CONTESTED in s:
        raise ValueError(
            f"{field} cannot contain '{CONTESTED}'. That mark means the reader "
            f"found more than one answer on the item, which is not a reading of "
            f"one letter."
        )
    if len(s) > 100:
        raise ValueError(
            f"{field} can be at most 100 characters - that is the width a "
            f"recorded answer is stored at."
        )
    return s


class OCRCorrectionBase(BaseModel):
    seen:  str = Field(..., description="What the reader produced, e.g. '-'")
    means: str = Field(..., description="What it should have been read as, e.g. 'E'")
    note:  Optional[str] = Field(None, max_length=200)

    @field_validator("seen")
    @classmethod
    def _v_seen(cls, v: str) -> str:
        return _clean(v, "The reading")

    @field_validator("means")
    @classmethod
    def _v_means(cls, v: str) -> str:
        return _clean(v, "The meaning")

    @field_validator("note")
    @classmethod
    def _v_note(cls, v: Optional[str]) -> Optional[str]:
        s = (v or "").strip()
        return s or None


class OCRCorrectionCreate(OCRCorrectionBase):
    pass


class OCRCorrectionUpdate(OCRCorrectionBase):
    pass


class OCRCorrectionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    correction_id: int
    seen:          str
    means:         str
    note:          Optional[str] = None
    created_at:    datetime
    updated_at:    datetime


class RescoreSummary(BaseModel):
    """What the cascade did, reported back to the screen that caused it."""
    rows_examined:       int = 0
    rows_changed:        int = 0
    rows_skipped_review: int = 0
    papers_touched:      int = 0
    marks_gained:        int = 0
    marks_lost:          int = 0
    marks_to_review:     int = 0
    message:             str = ""


class AffectedCount(BaseModel):
    """The blast radius AND the outcome, measured BEFORE the administrator saves.

    `rows` and `papers` alone were not enough: see AffectedPreview's docstring
    in correction_service for the T -> TRUE case that would have passed a
    count-only check and marked hundreds of correct answers wrong.
    """
    rows:              int = 0
    papers:            int = 0
    skipped_review:    int = 0
    would_be_correct:  int = 0
    would_be_wrong:    int = 0
    would_need_review: int = 0
    detailed:          bool = True


class OCRCorrectionSaved(BaseModel):
    correction: OCRCorrectionResponse
    rescore:    RescoreSummary