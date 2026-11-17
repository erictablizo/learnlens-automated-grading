"""
app/schemas/class_list.py
=========================
NEW 2026-11-17 — Recommendations page 7.

    "Additional Option Label = "List of Students". This reflect students for
     each subject and specific schedule a Teacher handles."
    "Create New List of Students (Subject Name and Schedule)
       Subject Name:  <Example English101>
       Schedule (Day and Time):  <Example MWF 7:30AM to 9:30AM>"

THE RULES ARE BORROWED, NOT RE-WRITTEN. check_subject() and check_schedule()
in schemas/_text.py have validated exactly these two fields on the EXAM form
since 2026-11-04, and their browser copies in lib/textField.ts are measured
against them. A class list's subject and an exam's subject are the same kind
of thing and a teacher types them into both; two rules would drift, and
"English101" being legal on one screen and refused on the other is the sort of
thing that is found at a defence.

Schedule keeps its colon - _SCHEDULE_STRICT_MARKS adds ":" precisely so
"MWF 7:30AM to 9:30AM" is expressible.
"""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, field_validator

from app.schemas._text import check_schedule, check_subject
from app.schemas.student import StudentResponse


class ClassListCreate(BaseModel):
    subject: str
    schedule: str

    @field_validator("subject")
    @classmethod
    def _subject(cls, v: str) -> str:
        return check_subject(v)

    @field_validator("schedule")
    @classmethod
    def _schedule(cls, v: str) -> str:
        return check_schedule(v)


class ClassListResponse(BaseModel):
    class_list_id: int
    subject:       str
    schedule:      str
    created_at:    datetime
    # How many students are in it, so the picker's dropdown can say
    # "English101 / MWF 7:30AM to 9:30AM (24)" rather than making the teacher
    # open each one to find the right class.
    student_count: int = 0

    model_config = {"from_attributes": True}


class ClassListDetailResponse(ClassListResponse):
    students: List[StudentResponse] = []


class ClassListMemberRequest(BaseModel):
    """Add an EXISTING student to the list, by their global number.

    Deliberately NOT a student_id. Page 7's flow is "input the Student
    number", and a number is what a teacher reads off a paper; an id is an
    internal detail the screen would have to look up first anyway.
    """
    student_number: str


class ClassListMemberResponse(BaseModel):
    success:       bool
    class_list_id: int
    student:       Optional[StudentResponse] = None
    message:       str
