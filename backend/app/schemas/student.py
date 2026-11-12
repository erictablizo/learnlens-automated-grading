"""
app/schemas/student.py
======================
NEW 2026-11-12 — the student roster.

WHERE VALIDATION LIVES, and why it is in two places on purpose
--------------------------------------------------------------
Single-row endpoints validate HERE, in the Pydantic models, so a bad field
comes back as a 422 naming that field — the convention the rest of this project
follows (schemas/paper.py: "Validation for the rename now comes from the
schema, where the rest of this project keeps it").

The BULK endpoint cannot do that. A 35-row paste with one bad line must not be
rejected whole, so `student_service.bulk_create` validates per row and reports
each one by line number. Same rules, different failure shape.

The number helpers are IMPORTED from the service rather than re-spelled here.
`norm_number()` has to agree with `ux_students_owner_number`'s
`lower(trim(student_number))` exactly; the 2026-11-11 email-case bug happened
because three callers each normalised their own way and only one lowercased.
One definition, in the module that owns the index's expression.
"""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, field_validator

from app.schemas._text import check_name_part
from app.services.student_service import check_number


def _last(v: str) -> str:
    return check_name_part(v, "Last name")


def _first(v: str) -> str:
    return check_name_part(v, "First name")


def _section(v: Optional[str]) -> Optional[str]:
    """Whitespace-collapsed, and empty becomes NULL rather than "".

    A student with no section and a student with a section of "" are the same
    student, and leaving both representations in the column would split the
    section dropdown in two.
    """
    s = " ".join((v or "").split())
    if not s:
        return None
    if len(s) > 255:
        raise ValueError("Section must be 255 characters or fewer.")
    return s


class StudentCreate(BaseModel):
    student_number: str
    last_name: str
    first_name: str
    section: Optional[str] = None

    @field_validator("student_number")
    @classmethod
    def _n(cls, v: str) -> str:
        return check_number(v)

    @field_validator("last_name")
    @classmethod
    def _l(cls, v: str) -> str:
        return _last(v)

    @field_validator("first_name")
    @classmethod
    def _f(cls, v: str) -> str:
        return _first(v)

    @field_validator("section")
    @classmethod
    def _s(cls, v: Optional[str]) -> Optional[str]:
        return _section(v)


class StudentUpdate(StudentCreate):
    """Every field required, like PaperUpdate.

    Deliberate for the same reason recorded there: the roster form always sends
    the whole row, and a partial update would need a read of the other fields
    first. There is no PATCH here.
    """


class StudentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    student_id: int
    student_number: str
    last_name: str
    first_name: str
    section: Optional[str] = None
    created_at: datetime


class StudentDetailResponse(StudentResponse):
    """One student, plus how many papers point at them.

    The count is what lets the roster screen warn BEFORE a delete rather than
    after. Removing a student does not delete their papers — the FK is
    ON DELETE SET NULL — but it does unlink them, and a teacher should know
    that three graded papers are about to lose their roster link.
    """

    papers_count: int = 0


# ---------------------------------------------------------------------------
# Bulk import
# ---------------------------------------------------------------------------

class StudentBulkRow(BaseModel):
    """One row of a pasted list.

    NO VALIDATORS. That is the point: a row that fails the rules has to reach
    `bulk_create` so it can be reported with its line number, instead of
    Pydantic rejecting the whole request and leaving the teacher to guess which
    of 35 lines was wrong. The service applies the same checks row by row.

    The fields are plain `str` so a missing one is still a 422 — the shape of
    the request is validated, only its contents are not.
    """

    student_number: str = ""
    last_name: str = ""
    first_name: str = ""
    section: Optional[str] = None


class StudentBulkRequest(BaseModel):
    """THE PARSING HAPPENS IN THE BROWSER, not here.

    The teacher pastes "2021-00123, Dela Cruz, Jose" and the roster screen
    shows her the parsed table before anything is created, because
    "Smith Jr., John" splits into four fields and no server-side rule gets that
    right every time. By the time a request reaches this endpoint the columns
    are already settled and she has seen them.
    """

    rows: List[StudentBulkRow]
    # Applied to any row that does not carry its own. The common case is one
    # section pasted at a time.
    section: Optional[str] = None

    @field_validator("section")
    @classmethod
    def _s(cls, v: Optional[str]) -> Optional[str]:
        return _section(v)


class StudentBulkIssue(BaseModel):
    """A row that was skipped or could not be read. `line` is 1-based."""

    line: int
    student_number: str
    reason: str


class StudentBulkResponse(BaseModel):
    success: bool
    created: List[StudentResponse] = []
    skipped: List[StudentBulkIssue] = []
    failed: List[StudentBulkIssue] = []
    message: str


class StudentDeleteResponse(BaseModel):
    """200 with a body, not 204.

    `delete_paper` answers 204 because there is nothing to say. Here there is:
    how many graded papers just lost their roster link. The papers and their
    scores survive — ON DELETE SET NULL — and saying so is the difference
    between a teacher trusting the roster and avoiding it.
    """

    success: bool
    student_id: int
    papers_unlinked: int
    message: str