"""Character rules for the exam and paper text fields.          NEW 2026-10-22

Doc Rubrica, after the demo:
    "case sensitive (UPPERCASE, LOWERCASE, and Special Characters like not
     letters and not numbers) ... If it's a Textfield and it's on the Set Up
     Profile and Edit Profile, it should not accept special characters AND
     COMBINATION OF SPECIAL CHARACTERS AND LETTER, same for Create Exam, Add
     Paper, Edit Exam, and Edit Paper."

STRICT therefore means: letters, numbers and spaces. Nothing else. Not a
period, not a comma, not a hyphen - and "Eric@" is refused for the same
reason "@@@" is, which is the "combination" half of her sentence.

MEASURED COST, against learnlens_schema.sql exactly as it stands today:

    test_papers.student_name   18 of 18 rows REFUSED   <- EVERY paper
    user_profiles.first_name    3 of  6 rows REFUSED   <- "Eric Bernard R."
    exams.exam_name             1 of 33 rows REFUSED   <- "Midterm (True or False Only)"
    exams.description           0 of 33
    user_profiles.last_name     0 of  6                   "Dela Cruz" is fine
    user_profiles.position      0 of  6                   "Instructor II" is fine

A refused value is not merely un-saveable, it is UN-EDITABLE: validation runs
on the whole model, so opening Edit Paper on "Midterm - Tablizo, Erica" and
changing only the IMAGE is still refused on Save. Rename those rows before you
demo - measure/2026-10-22_strict_fields_audit.py lists them.

Each switch below is its own line so any ONE can be relaxed without touching
the others, and so the decision is visible rather than buried inside a regular
expression. Flip the matching constant in frontend/src/lib/textField.ts at the
same time.

Column limits, from the schema:
    exams.exam_name           varchar(255), CHECK char_length >= 7
    exams.description         text  (no DB limit - capped here for sanity)
    test_papers.student_name  varchar(255)
"""

import re
import unicodedata
from typing import Optional

MIN_EXAM_NAME_LENGTH = 7          # mirrors exams_exam_name_check
MAX_EXAM_NAME_LENGTH = 255
MAX_DESCRIPTION_LENGTH = 2000
MAX_STUDENT_NAME_LENGTH = 255

STRICT_EXAM_NAME = True
STRICT_DESCRIPTION = True
STRICT_STUDENT_NAME = True

# STRICT: nothing but the space that separates words.
_STRICT_MARKS = " "

# RELAXED: used only when the matching switch above is False. Taken from the
# rows already in the database plus the near neighbours a teacher would reach
# for. Angle brackets are never allowed either way.
_RELAXED_MARKS = " '’‘\"“”.,:;!?()[]/&+#@_-–—"


def _marks(strict: bool) -> str:
    return _STRICT_MARKS if strict else _RELAXED_MARKS


def tidy_text(v: Optional[str]) -> str:
    """Collapse runs of whitespace and trim, NFC-normalised.  Matches
    tidyText() in textField.ts."""
    return unicodedata.normalize("NFC", re.sub(r"\s+", " ", v or "")).strip()


def tidy_multiline(v: Optional[str]) -> str:
    """Keep paragraph breaks; squeeze runs of spaces and tabs.  Matches
    tidyMultiline() in textField.ts."""
    s = unicodedata.normalize("NFC", v or "")
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def _bad_chars(v: str, strict: bool):
    marks = _marks(strict)
    return sorted({c for c in v if not c.isalnum() and c not in marks and c != "\n"})


def _shown(bad) -> str:
    return ", ".join(
        "a control character" if c.strip() == "" else f'"{c}"' for c in bad
    )


def _allowed(strict: bool) -> str:
    return ("Use letters, numbers and spaces only."
            if strict else
            "Use letters, numbers, spaces and ordinary punctuation.")


def check_exam_name(v: Optional[str]) -> str:
    v = tidy_text(v)
    if not v:
        raise ValueError("Exam name is required.")
    if len(v) < MIN_EXAM_NAME_LENGTH:
        raise ValueError(
            f"Exam name must be at least {MIN_EXAM_NAME_LENGTH} characters long."
        )
    if len(v) > MAX_EXAM_NAME_LENGTH:
        raise ValueError(f"Exam name must be at most {MAX_EXAM_NAME_LENGTH} characters.")
    if not any(c.isalpha() for c in v):
        raise ValueError("Exam name must contain at least one letter.")
    bad = _bad_chars(v, STRICT_EXAM_NAME)
    if bad:
        raise ValueError(
            f"Exam name cannot contain {_shown(bad)}. {_allowed(STRICT_EXAM_NAME)}"
        )
    return v


def check_description(v: Optional[str]) -> str:
    v = tidy_multiline(v)
    if not v:
        raise ValueError("Description is required.")
    if len(v) > MAX_DESCRIPTION_LENGTH:
        raise ValueError(
            f"Description must be at most {MAX_DESCRIPTION_LENGTH} characters."
        )
    if not any(c.isalpha() for c in v):
        raise ValueError("Description must contain at least one letter.")
    bad = _bad_chars(v, STRICT_DESCRIPTION)
    if bad:
        raise ValueError(
            f"Description cannot contain {_shown(bad)}. {_allowed(STRICT_DESCRIPTION)}"
        )
    return v


def check_student_name(v: Optional[str]) -> str:
    v = tidy_text(v)
    if not v:
        raise ValueError("Student name is required.")
    if len(v) > MAX_STUDENT_NAME_LENGTH:
        raise ValueError(
            f"Student name must be at most {MAX_STUDENT_NAME_LENGTH} characters."
        )
    if not any(c.isalpha() for c in v):
        raise ValueError("Student name must contain at least one letter.")
    bad = _bad_chars(v, STRICT_STUDENT_NAME)
    if bad:
        raise ValueError(
            f"Student name cannot contain {_shown(bad)}. {_allowed(STRICT_STUDENT_NAME)}"
        )
    return v