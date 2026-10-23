"""Character rules for the exam and paper text fields.     Updated 2026-10-23

Doc Rubrica, after the demo (2026-10-22):
    "case sensitive (UPPERCASE, LOWERCASE, and Special Characters like not
     letters and not numbers) ... If it's a Textfield and it's on the Set Up
     Profile and Edit Profile, it should not accept special characters AND
     COMBINATION OF SPECIAL CHARACTERS AND LETTER, same for Create Exam, Add
     Paper, Edit Exam, and Edit Paper."

The first pass read that as letters, numbers and spaces and NOTHING else. It
refused 22 of the 102 values already in the database, including all 18 test
papers, and a refused value is not merely un-saveable but UN-EDITABLE -
validation runs on the whole model, so opening Edit Paper on
"Midterm - Tablizo, Erica" and changing only the IMAGE was refused on Save.

STRICT now means letters, numbers, spaces and a CLOSED LIST OF FIVE MARKS:

    .  ,  -  (  )

chosen from the values the teacher actually types:

    Midterm - Alcantara, Ben R.    hyphen, comma, period (middle initial)
    Eric Tablizo                   nothing
    Midterm (Set A)                parentheses
    Prelim - Math                  hyphen

This is a closed list, not "punctuation". Everything her comment was aimed at
is still refused - @ # $ % ^ & * / \\ ' " _ + = : ; ! ? [ ] { } < > ~ | and
the en-dash - so "Ben@", "Eric@#$" and "@@@" fail exactly as they did, which
is the "combination of special characters and letter" half of her sentence.

MEASURED, against learnlens_schema.sql exactly as it stands:

    exams.exam_name             0 of 33 refused   (was 1)
    exams.description           0 of 33 refused
    test_papers.student_name    0 of 18 refused   (was 18)
    user_profiles.first_name    0 of  6 refused   (was 3, in schemas/profile.py)
    user_profiles.last_name     0 of  6 refused
    user_profiles.position      0 of  6 refused
                                0 of 102          (was 22)

Re-check any time with measure/2026-10-22_strict_fields_audit.py.

A person's NAME is stricter and lives in schemas/profile.py: letters, space
and a period for a middle initial - no digits, no parentheses, because no
teacher is called "Eric 2" or "Eric (Set A)".

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

# STRICT, 2026-10-23. Letters, numbers, the space between words, and a CLOSED
# LIST OF FIVE MARKS. Not "punctuation" - these five and nothing else.
#
# Taken from the values the teacher actually types, not from taste:
#
#     Midterm - Alcantara, Ben R.    hyphen, comma, period (middle initial)
#     Eric Tablizo                   nothing
#     Midterm (Set A)                parentheses
#     Prelim - Math                  hyphen
#
# One set covers Exam Name, Description and Student Name, because the same
# string can legitimately be typed in any of them - "Prelim - Math" is as good
# an exam name as it is a description. Earlier versions gave Student Name its
# own set; that split is gone, and with it the `student` flag that threaded
# through _marks / _bad_chars / _allowed.
#
# STILL REFUSED, so Doc Rubrica's 2026-10-22 rule holds where it was aimed:
#     @ # $ % ^ & * / \ ' " _ + = : ; ! ? [ ] { } < > ~ | and the en-dash.
# "Ben@", "Eric@#$" and "@@@" all fail exactly as they did.
#
# A person's NAME is stricter still and lives in schemas/profile.py:
# letters, space and a period, with no digits and no parentheses.
#
# The HYPHEN is written last so it is a literal hyphen, not a range.
# Matches NOT_IN_LABEL_STRICT in frontend/src/lib/textField.ts.
_STRICT_MARKS = " .,()-"

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
    """Must match allowedSentence() in textField.ts word for word - the
    browser and the server say the same thing."""
    return ("Use letters, numbers, spaces, and . , - ( ) only."
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