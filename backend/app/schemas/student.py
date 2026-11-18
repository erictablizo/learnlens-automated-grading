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

CHANGED 2026-11-15 (Grace, post-UAT) — "4 Textfields should have asterisk
meaning validations". Two changes, and both reach existing data:

  1. MIDDLE NAME IS REQUIRED on input. It was optional from 2026-11-14 until
     today. StudentResponse keeps it Optional, and that is not an
     inconsistency: every row written before 2026-11-14 has NULL in the
     column, those rows still have to be readable, and the migration
     deliberately left the column nullable so it would not refuse to run
     while they exist. Required to WRITE, nullable to READ.

  2. THE STUDENT NUMBER HAS A CHARACTER RULE. check_number() used to test
     only for blank; it now delegates to check_student_number() in
     schemas/_text.py — letters, digits and the hyphen, capped at 50 to match
     varchar(50). Before this, a 51-character number reached PostgreSQL and
     returned a driver error: a 500 where every other field answers 422.

CHANGED 2026-11-15, SECOND PASS — "Section should also be validated like
blank or other special characters."

  3. SECTION IS REQUIRED, and has a character rule for the first time.
     _section() collapsed whitespace, capped the length and turned blank into
     NULL; none of that refused anything, so "@@@" went into the column.
     It now delegates to check_section() — the SHARED label set, the same one
     exam names and subjects use.

     TWO VALIDATORS, NOT ONE, and the difference matters:
     StudentCreate.section is REQUIRED, while StudentBulkRequest.section is a
     DEFAULT applied to rows that carry none. Requiring the default would
     422 a whole paste whose rows each name their own section — the opposite
     of what bulk_create exists to do.
"""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, field_validator

from app.schemas._text import check_name_part, check_middle_name, check_section
from app.services.student_service import check_number


def _last(v: str) -> str:
    return check_name_part(v, "Last name")


def _first(v: str) -> str:
    return check_name_part(v, "First name")


def _middle(v: str) -> str:
    """CHANGED 2026-11-15. REQUIRED now — blank raises instead of returning None.

    Still stored as a NAME, not a single letter: the screens label it "Middle
    Initial" but a teacher who types "Reyes" is not refused, and `R` is
    rendered as `R.` by middle_initial() at compose time rather than being
    rewritten on the way in.

    `or ""` because check_middle_name's signature still returns Optional for
    the optional callers; with required=True it can only return a non-empty
    string or raise, so the fallback is unreachable and exists to satisfy the
    type rather than to handle a case.
    """
    return check_middle_name(v, required=True) or ""


def _section(v: str) -> str:
    """CHANGED 2026-11-15. REQUIRED, and checked against the shared label set.

    This replaces a function that only collapsed whitespace and capped the
    length. The cap stays — check_section() carries MAX_SECTION_LENGTH = 255,
    matching the column — and the character rule is new.

    `or ""` for the same reason as _middle: with required=True the helper can
    only return a non-empty string or raise, so the fallback is unreachable
    and exists to satisfy the type.
    """
    return check_section(v, required=True) or ""


def _section_default(v: Optional[str]) -> Optional[str]:
    """The BULK default — the section applied to rows that carry none.

    OPTIONAL on purpose. A pasted list whose every row names its own section
    does not need this field at all, and requiring it would reject the whole
    request rather than any row. The characters are still checked, so a
    default of "@@@" is refused before it is copied onto 35 students.

    Blank still becomes NULL rather than "": a student with no section and a
    student with a section of "" are the same student, and both spellings in
    the column would split the section dropdown in two.
    """
    return check_section(v, required=False)


class StudentCreate(BaseModel):
    student_number: str
    last_name: str
    first_name: str
    # CHANGED 2026-11-15: REQUIRED. It kept its position after first_name —
    # moving it would change nothing for a JSON body but would make the diff
    # read as a reordering rather than a requirement change.
    middle_name: str
    # CHANGED 2026-11-15, second pass: REQUIRED. StudentResponse keeps it
    # Optional for the same reason middle_name is — rows written before today
    # may hold NULL and still have to be readable.
    section: str

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

    @field_validator("middle_name")
    @classmethod
    def _m(cls, v: str) -> str:
        return _middle(v)

    @field_validator("section")
    @classmethod
    def _s(cls, v: str) -> str:
        return _section(v)


class StudentUpdate(StudentCreate):
    """Every field required, like PaperUpdate.

    Deliberate for the same reason recorded there: the roster form always sends
    the whole row, and a partial update would need a read of the other fields
    first. There is no PATCH here.

    NOTE 2026-11-15: because this inherits, the middle name is now required to
    SAVE AN EXISTING STUDENT too. A row created before 2026-11-14 with NULL in
    the column cannot be re-saved until one is typed. That is the agreed
    behaviour — "require it everywhere, fix the data" — and it is the reason
    the column itself was left nullable rather than being migrated to NOT NULL,
    which would have refused to run at all while such rows exist.
    """


class StudentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    student_id: int
    student_number: str
    last_name: str
    first_name: str
    # STILL Optional, deliberately — see the module docstring. Required to
    # write, nullable to read.
    middle_name: Optional[str] = None
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

    CHANGED 2026-11-15: middle_name becomes `str = ""` rather than
    `Optional[str] = None`, matching last_name and first_name. It is required
    now, and a required field that arrives as None would be reported as a
    different failure than one that arrives blank — one message for one
    mistake.
    """

    student_number: str = ""
    last_name: str = ""
    first_name: str = ""
    middle_name: str = ""
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
    # section pasted at a time. OPTIONAL — see _section_default().
    section: Optional[str] = None

    @field_validator("section")
    @classmethod
    def _s(cls, v: Optional[str]) -> Optional[str]:
        return _section_default(v)


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

# ---------------------------------------------------------------------------
# NEW 2026-11-17 — Recommendations page 11, the per-student record.
#
#   "If I clicked the 'Student No', it will show a 'new Page' reflecting all
#    the exams uploaded related to this Student Number."
# ---------------------------------------------------------------------------

class StudentExamScore(BaseModel):
    """One of this teacher's exams, and what this student scored on it.

    THREE STATES, and the screen must be able to tell them apart:

      checked and total_score is not None   a RESULT      "13 / 15"
      total_score is not None, not checked  a FLOOR       "28-30 / 30"
      total_score is None                   not graded    "Not checked yet"

    grade_paper leaves `checked` False while any item is under review - see
    routes/papers.py, the review-queue comment - so `checked` alone cannot
    separate "nobody has graded this" from "graded, waiting on you".
    `total_score` is what separates them.

    `under_review` is the count of this paper's PaperScore rows with
    verdict == 'review', the same test the review queue uses. It is the
    distance between the floor and the ceiling: a student has at least
    total_score and at most total_score + under_review.
    """
    paper_id:     int
    exam_id:      int
    exam_name:    str
    subject:      Optional[str] = None
    schedule:     Optional[str] = None
    total_score:  Optional[int] = None
    checked:      bool
    total_items:  int
    under_review: int


class StudentExamRecord(BaseModel):
    """The whole page in one response.

    The student comes back WITH the list rather than being fetched separately,
    because GET /students/{id} is owner-scoped and every student now belongs to
    the administrator - a teacher asking for one by id gets 404. This is no
    wider than GET /students/lookup, which already turns a number into a name
    for any teacher.
    """
    student: StudentResponse
    exams:   List[StudentExamScore] = []