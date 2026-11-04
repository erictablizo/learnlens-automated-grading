import re
import unicodedata
from typing import Optional

MIN_EXAM_NAME_LENGTH = 7          # mirrors exams_exam_name_check
MAX_EXAM_NAME_LENGTH = 255
MAX_DESCRIPTION_LENGTH = 2000
MAX_STUDENT_NAME_LENGTH = 255
MAX_SUBJECT_LENGTH = 255          # NEW 2026-11-04
MAX_SCHEDULE_LENGTH = 255         # NEW 2026-11-04
MAX_NAME_PART_LENGTH = 255        # NEW 2026-11-04 — first_name / last_name

STRICT_EXAM_NAME = True
STRICT_DESCRIPTION = True
STRICT_STUDENT_NAME = True
STRICT_SUBJECT = True             # NEW 2026-11-04
STRICT_SCHEDULE = True            # NEW 2026-11-04

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
# One set covers Exam Name, Description, Student Name and Subject, because the
# same string can legitimately be typed in any of them - "Prelim - Math" is as
# good an exam name as it is a description. Earlier versions gave Student Name
# its own set; that split is gone, and with it the `student` flag that threaded
# through _marks / _bad_chars / _allowed.
#
# STILL REFUSED, so Doc Rubrica's 2026-10-22 rule holds where it was aimed:
#     @ # $ % ^ & * / \ ' " _ + = : ; ! ? [ ] { } < > ~ | and the en-dash.
# "Ben@", "Eric@#$" and "@@@" all fail exactly as they did.
#
# A person's NAME is stricter still and lives in schemas/profile.py:
# letters, space and a period, with no digits and no parentheses.
#
# SCHEDULE is the one exception and has its own set below.  A STUDENT'S NAME
# PART - first_name / last_name - has its own set too, at the bottom of this
# file; it is NOT the profile set, for the reason recorded there.
#
# The HYPHEN is written last so it is a literal hyphen, not a range.
# Matches NOT_IN_LABEL_STRICT in frontend/src/lib/textField.ts.
_STRICT_MARKS = " .,()-"

# RELAXED: used only when the matching switch above is False. Taken from the
# rows already in the database plus the near neighbours a teacher would reach
# for. Angle brackets are never allowed either way.
_RELAXED_MARKS = " '’‘\"“”.,:;!?()[]/&+#@_-–—"

# NEW 2026-11-04. SCHEDULE is a time range the teacher types by hand, so it
# needs a COLON, which _STRICT_MARKS deliberately refuses everywhere else.
# MEASURED against Doc Rubrica's own examples:
#
#     2pm to 3pm        accepted by both sets
#     1:00pm to 12pm    REFUSED by _STRICT_MARKS  ->  needs ":"
#     11:00AM - 7pm     REFUSED by _STRICT_MARKS  ->  needs ":"
#     12:00 PM          REFUSED by _STRICT_MARKS  ->  needs ":"
#     1:00 - 3:00       REFUSED by _STRICT_MARKS  ->  needs ":"
#
# Its own set, not a looser shared one: widening _STRICT_MARKS would let a
# colon into Exam Name and Description, which is exactly what the 2026-10-22
# rule was aimed at. Matches NOT_IN_SCHEDULE_STRICT in textField.ts.
_SCHEDULE_STRICT_MARKS = _STRICT_MARKS + ":"
_SCHEDULE_RELAXED_MARKS = _RELAXED_MARKS            # already contains ":"


def _marks(strict: bool) -> str:
    return _STRICT_MARKS if strict else _RELAXED_MARKS


def _schedule_marks(strict: bool) -> str:           # NEW 2026-11-04
    return _SCHEDULE_STRICT_MARKS if strict else _SCHEDULE_RELAXED_MARKS


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


def _schedule_bad_chars(v: str, strict: bool):      # NEW 2026-11-04
    marks = _schedule_marks(strict)
    return sorted({c for c in v if not c.isalnum() and c not in marks})


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


def _allowed_schedule(strict: bool) -> str:         # NEW 2026-11-04
    """Must match allowedScheduleSentence() in textField.ts word for word."""
    return ("Use letters, numbers, spaces, and . , - ( ) : only."
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


# ── NEW 2026-11-04 (Doc Rubrica, consultation) ───────────────────────────────
# "2 additional Fields in Exam Info Table": Subject and Schedule.


def check_subject(v: Optional[str]) -> str:
    """SUBJECT uses the SHARED marks. A subject is "English101" or
    "Math 101 (Set A)" and needs nothing an exam name does not."""
    v = tidy_text(v)
    if not v:
        raise ValueError("Subject is required.")
    if len(v) > MAX_SUBJECT_LENGTH:
        raise ValueError(f"Subject must be at most {MAX_SUBJECT_LENGTH} characters.")
    if not any(c.isalpha() for c in v):
        raise ValueError("Subject must contain at least one letter.")
    bad = _bad_chars(v, STRICT_SUBJECT)
    if bad:
        raise ValueError(
            f"Subject cannot contain {_shown(bad)}. {_allowed(STRICT_SUBJECT)}"
        )
    return v


def check_schedule(v: Optional[str]) -> str:
    """SCHEDULE uses its own marks, which add the COLON - see
    _SCHEDULE_STRICT_MARKS above.

    Note what is NOT here: the "must contain at least one letter" test every
    other field carries. "1:00 - 3:00" is a legitimate schedule with no
    letters in it, and refusing it would be refusing the teacher's own
    shorthand."""
    v = tidy_text(v)
    if not v:
        raise ValueError("Schedule is required.")
    if len(v) > MAX_SCHEDULE_LENGTH:
        raise ValueError(f"Schedule must be at most {MAX_SCHEDULE_LENGTH} characters.")
    bad = _schedule_bad_chars(v, STRICT_SCHEDULE)
    if bad:
        raise ValueError(
            f"Schedule cannot contain {_shown(bad)}. {_allowed_schedule(STRICT_SCHEDULE)}"
        )
    return v


# ── NEW 2026-11-04 (Doc Rubrica, consultation, page 4) ───────────────────────
# "Split Name to Last Name & First Name" / "1 additional field: First Name"
#
# A STUDENT'S NAME PART gets its OWN set - a third one. Neither of the two
# that already exist in this codebase fits.
#
# NOT the profile set (" ." in schemas/profile.py). MEASURED 2026-11-04 over
# 28 realistic Filipino names: it refuses 7, including EVERY hyphenated
# surname -
#
#     Dela Cruz-Santos    refused by the profile set
#     Reyes-Ramos         refused by the profile set
#     Villanueva-Lim      refused by the profile set
#     Anne-Marie          refused by the profile set
#     O'Brien, D'Souza    refused by the profile set AND by _STRICT_MARKS
#
# - and test_papers.student_name accepts all of those TODAY under
# _STRICT_MARKS. Reusing the profile set would be a REGRESSION: "Dela
# Cruz-Santos, Maria" is a legal paper name right now and would stop being one.
#
# NOT _STRICT_MARKS either. That allows digits, parentheses, and above all the
# COMMA - and the comma is the character the split is being made ON. A comma
# inside last_name means the teacher typed both names into one box, which is
# worth catching rather than storing.
#
# So: letters, space, period, apostrophe, hyphen. No digits, no comma, no
# parentheses. Of the 28 names it refuses exactly one, "Eric 2", which is the
# digit-in-a-name case Doc Rubrica objected to.
#
# KNOWN LIMITATION, recorded honestly: "Midterm - Alcantara" PASSES this set.
# It is name-shaped - letters, space, hyphen - so no character rule can catch
# the exam-name-baked-into-the-field mistake. What prevents it recurring is
# Add Paper having two separate boxes labelled Last name and First name.
#
# The HYPHEN is written last, same reason as _STRICT_MARKS.
# Matches NOT_IN_NAME_PART in frontend/src/lib/textField.ts.
_NAME_PART_MARKS = " .'’-"

NAME_PART_SENTENCE = "Use letters, spaces, and . ' - only."

# The one mistake a validator can actually help with.
NAME_PART_COMMA_HINT = (
    "Enter the surname and the first name in their own boxes, "
    "not \"Surname, First name\" in one."
)


def _name_part_bad(v: str):
    """isalpha(), not isalnum(): a digit in a name is refused, unlike every
    other field in this file."""
    return sorted({c for c in v if not c.isalpha() and c not in _NAME_PART_MARKS})


def check_name_part(v: Optional[str], label: str) -> str:
    """label is what the teacher sees: "Last name" / "First name"."""
    v = tidy_text(v)
    if not v:
        raise ValueError(f"{label} is required.")
    if len(v) > MAX_NAME_PART_LENGTH:
        raise ValueError(f"{label} must be at most {MAX_NAME_PART_LENGTH} characters.")
    if not any(c.isalpha() for c in v):
        raise ValueError(f"{label} must contain at least one letter.")
    bad = _name_part_bad(v)
    if bad:
        tail = NAME_PART_COMMA_HINT if "," in bad else NAME_PART_SENTENCE
        raise ValueError(f"{label} cannot contain {_shown(bad)}. {tail}")
    return v


def compose_student_name(last_name: Optional[str], first_name: Optional[str]) -> str:
    """student_name is KEPT, not dropped, and written from the two parts.

    It is read in at least six places - the paper label under the image, the
    "no pages" fallback, the page-nav caption and the delete-confirmation
    message on exams/[id]/page.tsx, plus PapersTable and the toasts - so
    letting it go stale would mean a fallback branch at every one of them.
    It is also the rollback the 2026-11-04 migration comment promises.

    Matches composeStudentName() in frontend/src/lib/textField.ts."""
    return f"{tidy_text(last_name)}, {tidy_text(first_name)}"