from pydantic import BaseModel, field_validator, model_validator
from datetime import datetime
from typing import Optional, List

# NEW 2026-10-22 (Doc Rubrica): the character rules live in one module so
# exam.py, paper.py and frontend/src/lib/textField.ts cannot drift apart.
#
# CHANGED 2026-11-04 (Doc Rubrica, consultation, page 4): check_student_name is
# gone from this file and check_name_part has taken its place on the INPUT
# models. student_name is no longer something the teacher types - it is DERIVED
# from last_name and first_name by compose_student_name() in the service - so
# validating it as user input is now wrong, not merely redundant.
#
# MEASURED 2026-11-04, and this is the reason rather than tidiness: the
# apostrophe is legal in a name part and illegal under _STRICT_MARKS, so
#
#     "O'Brien" + "Ana"  ->  "O'Brien, Ana"   REFUSED by check_student_name
#     "D'Souza" + "Lee"  ->  "D'Souza, Lee"   REFUSED by check_student_name
#
# 3 of 6 realistic composed values failed. Leaving check_student_name on the
# input path would mean O'Brien is a surname Add Paper accepts and the API then
# rejects. Widening _STRICT_MARKS instead would let an apostrophe into exam
# names and descriptions, which is what the 2026-10-22 rule was aimed at.
from app.schemas._text import check_name_part


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


# NEW 2026-11-04 — the two wrappers follow the _check_* pattern this file
# already used for student_name, so the label the teacher sees lives here and
# the character rule lives in _text.py.
def _check_last_name(v: str) -> str:
    return check_name_part(v, "Last name")


def _check_first_name(v: str) -> str:
    return check_name_part(v, "First name")


class PaperCreate(BaseModel):
    # CHANGED 2026-11-04. student_name is REMOVED, not made optional.
    #
    # Pydantic ignores unknown keys by default, so the old frontend payload
    # {"student_name": "..."} does not error on the extra key - it fails with
    # 422 on the two MISSING ones instead. MEASURED: that is a loud failure,
    # which is what we want; an optional student_name would have been a silent
    # one, accepting the old payload and storing ", " as the composed name.
    #
    # The frontend MUST ship in the same deploy as this file.
    last_name:  str
    first_name: str

    @field_validator("last_name")
    @classmethod
    def _last(cls, v: str) -> str:
        return _check_last_name(v)

    @field_validator("first_name")
    @classmethod
    def _first(cls, v: str) -> str:
        return _check_first_name(v)


class PaperUpdate(BaseModel):
    """The rename / hand-split model.

    Until 2026-11-04 this class existed and NOTHING imported it: routes/papers.py
    defined its own PaperNameUpdate(BaseModel) with no validators at all, so
    PUT /exams/{id}/papers/{paper_id} accepted "@@@", "", "   ", "123",
    "<script>alert(1)</script>" and 300 characters. The route imports this now.

    BOTH fields are REQUIRED, which is unusual for an "Update" model and is
    deliberate: student_name is recomposed from the pair, and recomposing from
    one half would need a read of the other half first. Edit Paper always sends
    both - it pre-fills them from a best-effort split of the stored
    student_name, which is how the 18 pre-migration papers get split by hand.
    """

    last_name:  str
    first_name: str

    @field_validator("last_name")
    @classmethod
    def _last(cls, v: str) -> str:
        return _check_last_name(v)

    @field_validator("first_name")
    @classmethod
    def _first(cls, v: str) -> str:
        return _check_first_name(v)


class PaperResponse(BaseModel):
    paper_id:     int
    exam_id:      int
    # NEW 2026-11-12 — declared HERE as well as on PaperListResponse, so the
    # key is always serialised and types/paper.ts can declare it required with
    # a null value, per that file's own rule. Putting it on only one of the two
    # would reproduce the exam_id type lie PAPER-SERVICE-TS-2026-11-04 found.
    student_id:   Optional[int] = None
    student_name: str
    # NEW 2026-11-04. Optional because the 18 papers that predate the migration
    # have NULL in both until someone opens Edit Paper and splits them. The
    # migration deliberately does not backfill: 4 of 7 real student_name values
    # split wrongly, e.g. "Midterm - Alcantara, Ben R." -> "Midterm - Alcantara".
    last_name:    Optional[str] = None
    first_name:   Optional[str] = None
    total_score:  Optional[int] = None
    checked:      bool
    added_at:     datetime
    paper_pages:  List[PaperPageResponse] = []
    paper_scores: List[PaperScoreResponse] = []
    model_config = {"from_attributes": True}


class PaperListResponse(BaseModel):
    paper_id:     int
    # NEW 2026-11-12 — which roster student this paper belongs to, or null for
    # the papers that predate the roster (all of them today) and for any paper
    # added by name rather than by student number.
    #
    # The batch upload reads it to know who ALREADY has a paper in this exam
    # before it starts, so a clash is a line in the preview table instead of a
    # 409 half-way through a 35-student run.
    #
    # Additive and Optional, so every existing caller is unaffected — the same
    # shape PAPER-SERVICE-TS-2026-11-04 recommended for exam_id.
    #
    # Position here is COSMETIC, unlike in models.py. That file's 2026-11-04
    # comment — "a migrated database gets these from ALTER TABLE ADD COLUMN,
    # which always APPENDS" — is about column ordinals in PostgreSQL. A Pydantic
    # response model has no such constraint; field order only sets the order of
    # keys in the JSON. So it sits beside paper_id, where the other identifier
    # is, rather than being appended to keep a diff small.
    student_id:   Optional[int] = None
    student_name: str
    # NEW 2026-11-04 — PapersTable shows "Last Name" and "First Name" as two
    # columns (her page 4), and this is the model behind that table. It is also
    # the response_model of create_paper and update_paper_name, so both write
    # paths hand the new values straight back to the browser.
    last_name:    Optional[str] = None
    first_name:   Optional[str] = None
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

# ---------------------------------------------------------------------------
# NEW 2026-11-11 — per-paper answer override (Alex & Bancud, "that paper only")
#
# Separate from ReviewResolveRequest above, and deliberately so. That one
# carries `is_correct: bool` — a decision about a comparison. This one carries
# the ANSWER, because a corrected answer survives a later change to the key and
# a stamped verdict does not. MEASURED in PAPER-ANSWER-OVERRIDE-2026-11-11.md:
# correct item 16's read to 'E', then correct the KEY for 16 away and back, and
# the answer-override lands on correct while the stamp lands on wrong.
# ---------------------------------------------------------------------------

def _check_student_answer(v: str) -> str:
    """Length and whitespace only. Deliberately NOT check_name_part.

    The 2026-10-22 character rules exist for exam names and name parts, which
    are things a teacher types about a person. This field records what a
    STUDENT wrote on paper, and the system cannot tell them they wrote it
    wrong: an identification answer may hold any characters, and OCR already
    stores reads like 'COMM UNICATION' and 'TROOFREADING' unchallenged.
    Applying _STRICT_MARKS here would refuse answers that are on the page.

    Whitespace collapses per the 2026-11-10 parity rule, so 'COMM   UNICATION'
    and 'COMM UNICATION' are not two different answers. normalize_answer()
    strips spaces entirely on the identification path anyway.

    100 is MAX_ANSWER_LEN and the String(100) width of paper_scores.
    student_answer. Checked AFTER collapsing, so trailing spaces never cause a
    spurious refusal — and raised rather than truncated, because silently
    dropping characters a teacher typed is the kind of thing nobody notices.
    """
    collapsed = " ".join((v or "").split())
    if len(collapsed) > 100:
        raise ValueError("An answer cannot be longer than 100 characters.")
    return collapsed


class PaperAnswerUpdate(BaseModel):
    """What the student actually wrote for one item.

    REQUIRED, with no default. An empty STRING is meaningful — it records that
    the student left the item blank, which grades wrong — but an absent FIELD
    must not mean the same thing. With a default, a malformed client sending
    {} would silently blank a mark. It gives 422 instead.
    """

    student_answer: str

    @field_validator("student_answer")
    @classmethod
    def _answer(cls, v: str) -> str:
        return _check_student_answer(v)


class PaperAnswerUpdateResponse(BaseModel):
    success:           bool
    question_number:   int
    old_answer:        str      # what it was, so the toast can show the change
    student_answer:    str      # what it is now ("—" when blank)
    correct_answer:    str
    verdict:           str      # correct | review | wrong
    is_correct:        bool
    is_identification: bool     # the grading mode this item took
    # Same names GradeResponse and ReviewResolveResponse already use, so the
    # X/Y work on the exam page reads one shape whether the numbers came from
    # grading, from resolving a review, or from a correction.
    correct:           int      # the FLOOR
    max_possible:      int      # the ceiling: correct + needs_review
    needs_review:      int
    review_items:      List[int] = []
    total_items:       int
    is_final:          bool
    message:           str

# ---------------------------------------------------------------------------
# NEW 2026-11-12 — a paper created FOR A ROSTER STUDENT (batch upload, item 7)
#
# Separate from PaperCreate, which takes the two name parts. This one takes the
# student NUMBER, and the names come off the roster - that is the whole point
# of item 4: "ID Student # -> file of Test Exam".
#
# PaperCreate is deliberately NOT widened to accept an optional student_number.
# Its own 2026-11-04 comment records what happens when that model changes:
# "Pydantic ignores unknown keys by default, so the old frontend payload does
# not error on the extra key - it fails with 422 on the two MISSING ones
# instead... The frontend MUST ship in the same deploy as this file." A new
# model touches nothing that is already working.
# ---------------------------------------------------------------------------

class PaperForStudentCreate(BaseModel):
    """The roster number written on the paper and used as the image's name."""

    student_number: str

    @field_validator("student_number")
    @classmethod
    def _n(cls, v: str) -> str:
        s = " ".join((v or "").split())
        if not s:
            raise ValueError("Student number is required.")
        if len(s) > 50:
            raise ValueError("Student number must be 50 characters or fewer.")
        return s


class PaperForStudentResponse(BaseModel):
    """What the batch upload needs back, and nothing else.

    The batch modal needs `paper_id` to upload pages against, and the name
    fields to show in its progress table. It does NOT need pages, scores or
    answers — those are separate calls, and a 35-student run would fetch them
    35 times for nothing.

    Dict form rather than ConfigDict(...) deliberately: this file's import line
    is `from pydantic import BaseModel, field_validator, model_validator`, and
    PaperPageResponse / PaperScoreResponse / PaperResponse / PaperListResponse
    all already use the dict form. One style per file, and no import to touch.
    """

    model_config = {"from_attributes": True}

    paper_id:       int
    exam_id:        int
    student_id:     int
    student_name:   str
    last_name:      Optional[str] = None
    first_name:     Optional[str] = None
    checked:        bool