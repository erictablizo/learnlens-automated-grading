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

# ── NEW 2026-11-15 (Grace, post-UAT): the STUDENT NUMBER gets a rule ─────────
#
# check_number() in services/student_service.py has only ever tested for
# blank. MEASURED against the live schema: students.student_number is
# varchar(50) and nothing checked the length, so a 51-character number reached
# PostgreSQL and came back as a driver error - a 500, where every other field
# in this file answers 422 and names itself. The same fault
# MAX_MIDDLE_NAME_LENGTH was added to prevent on 2026-11-14.
#
# A FOURTH SET, and the narrowest in this file: letters, digits, hyphen.
#
#     2021-00123      the panel's own example paper
#     202300000001    the live roster
#     2021-A123       a LETTER is legal, and this is not a guess:
#                     ux_students_owner_number indexes
#                     lower(trim(student_number)), which is only meaningful if
#                     a number can carry one, and AddEditPaperModal's comment
#                     names this exact value as the reason it matches on
#                     lower(trim(...)) too
#
# NO SPACE, and that is a deliberate narrowing agreed with Grace on
# 2026-11-15. norm_number()'s own docstring describes "2021 - 00123" pasted
# out of a spreadsheet; that value is REFUSED from now on rather than stored,
# because a space inside a student number is a spreadsheet artefact and not
# part of the number. Rows already in the database are untouched - only new
# input is checked - so a class list pasted today may flag lines that went in
# silently yesterday.
#
# NO "must contain a letter" test: a student number is normally all digits.
# It must contain at least one LETTER OR DIGIT, which is what stops "---"
# and "--" passing a rule built out of allowed marks.
#
# Matches checkStudentNumber() in frontend/src/lib/textField.ts.
MAX_STUDENT_NUMBER_LENGTH = 50
_STUDENT_NUMBER_MARKS = "-"

STUDENT_NUMBER_SENTENCE = "Use letters, numbers and - only, with no spaces."


# ── NEW 2026-11-15 (Grace, post-UAT): the SECTION gets a rule ───────────────
#
# It had none. _section() in schemas/student.py collapsed whitespace, capped
# the length and turned blank into NULL - which is storage hygiene, not
# validation. "@@@" and "<script>" both went straight into the column.
#
# THE SET IS THE SHARED LABEL SET. A section is a label - "BSCS 3A",
# "BSCS 3A, morning" - and _STRICT_MARKS already describes exactly that:
# letters, numbers, space and . , ( ) - and nothing else.
#
# THE COMMA IS LOAD-BEARING HERE, not merely tolerated.
# lib/studentPaste.ts rejoins everything after the section column back into
# the section precisely so "BSCS 3A, morning" survives a comma-separated
# paste. A rule refusing commas would leave that code in place doing nothing.
#
# ONE DELIBERATE DEVIATION from every other field in this file: the test is
# "at least one letter OR DIGIT", not "at least one letter". A section can
# legitimately be "101". The test still refuses "---" and "...", which is what
# it is there for.
MAX_SECTION_LENGTH = 255
STRICT_SECTION = True


STRICT_EXAM_NAME = True
STRICT_DESCRIPTION = True
STRICT_STUDENT_NAME = True
STRICT_SUBJECT = True             # NEW 2026-11-04
STRICT_SCHEDULE = True            # NEW 2026-11-04

_STRICT_MARKS = " .,()-"
_RELAXED_MARKS = " '’‘\"“”.,:;!?()[]/&+#@_-–—"
_SCHEDULE_STRICT_MARKS = _STRICT_MARKS + ":"
_SCHEDULE_RELAXED_MARKS = _RELAXED_MARKS


def _marks(strict: bool) -> str:
    return _STRICT_MARKS if strict else _RELAXED_MARKS


def _schedule_marks(strict: bool) -> str:           # NEW 2026-11-04
    return _SCHEDULE_STRICT_MARKS if strict else _SCHEDULE_RELAXED_MARKS


def tidy_text(v: Optional[str]) -> str:
    """Collapse runs of whitespace and trim, NFC-normalised.  Matches
    tidyText() in textField.ts."""
    return unicodedata.normalize("NFC", re.sub(r"\s+", " ", v or "")).strip()


def tidy_multiline(v: Optional[str]) -> str:
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
    return ("Use letters, numbers, spaces, and . , - ( ) only."
            if strict else
            "Use letters, numbers, spaces and ordinary punctuation.")


def _allowed_schedule(strict: bool) -> str:         # NEW 2026-11-04
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


def check_subject(v: Optional[str]) -> str:
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


_NAME_PART_MARKS = " .'’-"

NAME_PART_SENTENCE = "Use letters, spaces, and . ' - only."

NAME_PART_COMMA_HINT = (
    "Enter the surname and the first name in their own boxes, "
    "not \"Surname, First name\" in one."
)


def _name_part_bad(v: str):
    return sorted({c for c in v if not c.isalpha() and c not in _NAME_PART_MARKS})


def check_name_part(v: Optional[str], label: str,
                    comma_hint: bool = True) -> str:
    """label is what the teacher sees: "Last name" / "First name".

    comma_hint is NEW 2026-11-16 and defaults to the old behaviour, so every
    existing caller is untouched. It exists because schemas/profile.py now
    borrows this rule for the teacher's POSITION, and on that field
    NAME_PART_COMMA_HINT - "enter the surname and the first name in their own
    boxes" - is a sentence about a different screen. MEASURED: "Head, Science
    Dept." earned exactly that message before this flag existed.
    """
    v = tidy_text(v)
    if not v:
        raise ValueError(f"{label} is required.")
    if len(v) > MAX_NAME_PART_LENGTH:
        raise ValueError(f"{label} must be at most {MAX_NAME_PART_LENGTH} characters.")
    if not any(c.isalpha() for c in v):
        raise ValueError(f"{label} must contain at least one letter.")
    bad = _name_part_bad(v)
    if bad:
        tail = (NAME_PART_COMMA_HINT
                if ("," in bad and comma_hint) else NAME_PART_SENTENCE)
        raise ValueError(f"{label} cannot contain {_shown(bad)}. {tail}")
    return v


MAX_MIDDLE_NAME_LENGTH = 100


def check_middle_name(v: Optional[str], required: bool = False) -> Optional[str]:
    """The middle name. Blank is an error ONLY when required=True.

    CHANGED 2026-11-15 (Grace, post-UAT): the flag, not a second function. The
    roster, the paste and Edit Paper all demand one now; compose and the legacy
    read paths still have to tolerate the NULL that every row written before
    2026-11-14 carries, and a separate required-variant would be two copies of
    one character rule - the drift this module exists to prevent.
    """
    v = tidy_text(v)
    if not v:
        if required:
            raise ValueError("Middle name is required.")
        return None
    if len(v) > MAX_MIDDLE_NAME_LENGTH:
        raise ValueError(
            f"Middle name must be at most {MAX_MIDDLE_NAME_LENGTH} characters.")
    if not any(c.isalpha() for c in v):
        raise ValueError("Middle name must contain at least one letter.")
    bad = _name_part_bad(v)
    if bad:
        tail = NAME_PART_COMMA_HINT if "," in bad else NAME_PART_SENTENCE
        raise ValueError(f"Middle name cannot contain {_shown(bad)}. {tail}")
    return v


def check_student_number(v: Optional[str]) -> str:
    """The Student No. REQUIRED, capped at the column width, no spaces.

    Mirrors checkStudentNumber() in frontend/src/lib/textField.ts, including
    the ORDER of the tests - required, length, at-least-one-alphanumeric,
    characters - so the two never disagree about which message a bad value
    earns.
    """
    v = tidy_text(v)
    if not v:
        raise ValueError("Student number is required.")
    if len(v) > MAX_STUDENT_NUMBER_LENGTH:
        raise ValueError(
            f"Student number must be at most {MAX_STUDENT_NUMBER_LENGTH} characters.")
    if not any(c.isalnum() for c in v):
        raise ValueError("Student number must contain at least one letter or number.")
    # The SPACE gets its own sentence, before the general character test.
    # _shown() prints any whitespace as "a control character", which is true of
    # a tab and nonsense to a teacher looking at "2021 - 00123" out of a
    # spreadsheet - the single likeliest way this rule gets hit.
    if " " in v:
        raise ValueError(f"Student number cannot contain spaces. {STUDENT_NUMBER_SENTENCE}")
    bad = sorted({c for c in v if not c.isalnum() and c not in _STUDENT_NUMBER_MARKS})
    if bad:
        raise ValueError(
            f"Student number cannot contain {_shown(bad)}. {STUDENT_NUMBER_SENTENCE}")
    return v



def check_section(v: Optional[str], required: bool = False) -> Optional[str]:
    """The section, or None. Blank is an error ONLY when required=True.

    The flag, not a second function, for the same reason check_middle_name
    carries one: StudentCreate.section is required from 2026-11-15, but
    StudentBulkRequest.section is a DEFAULT applied to rows that carry none,
    and requiring that would 422 a whole paste whose rows each name their own.

    Mirrors checkSection() in frontend/src/lib/textField.ts, including the
    order of the tests - required, length, at-least-one-alphanumeric,
    characters.
    """
    v = tidy_text(v)
    if not v:
        if required:
            raise ValueError("Section is required.")
        return None
    if len(v) > MAX_SECTION_LENGTH:
        raise ValueError(f"Section must be at most {MAX_SECTION_LENGTH} characters.")
    if not any(c.isalnum() for c in v):
        raise ValueError("Section must contain at least one letter or number.")
    bad = _bad_chars(v, STRICT_SECTION)
    if bad:
        raise ValueError(
            f"Section cannot contain {_shown(bad)}. {_allowed(STRICT_SECTION)}")
    return v



def middle_initial(v: Optional[str]) -> str:
    """How a middle name is WRITTEN inside a composed name: "R." or "Reyes"."""
    s = tidy_text(v)
    if not s:
        return ""
    return f"{s}." if len(s) == 1 and s.isalpha() else s


def compose_student_name(last_name: Optional[str], first_name: Optional[str],
                         middle_name: Optional[str] = None) -> str:
    """student_name is KEPT, not dropped, and written from the two parts."""
    base = f"{tidy_text(last_name)}, {tidy_text(first_name)}"
    mid = middle_initial(middle_name)
    return f"{base} {mid}" if mid else base