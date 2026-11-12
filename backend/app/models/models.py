from sqlalchemy import (
    Column, Integer, SmallInteger, String, Text, Boolean,
    Numeric, ForeignKey, UniqueConstraint, CheckConstraint, Index, func, text
)
from app.models.types import UTCDateTime
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.profile import UserProfile  # noqa: F401


class User(Base):
    __tablename__ = "users"

    user_id       = Column(Integer, primary_key=True, autoincrement=True)
    email         = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    created_at    = Column(UTCDateTime(), server_default=func.now(), nullable=False)
    updated_at    = Column(UTCDateTime(), server_default=func.now(), onupdate=func.now())

    profile         = relationship("UserProfile", back_populates="user", uselist=False, cascade="all, delete")
    exams           = relationship("Exam", back_populates="creator", cascade="all, delete")
    students        = relationship("Student", back_populates="creator", cascade="all, delete")   # NEW 2026-11-12
    password_resets = relationship("PasswordReset", back_populates="user", cascade="all, delete")


class PasswordReset(Base):
    __tablename__ = "password_resets"

    reset_id   = Column(Integer, primary_key=True, autoincrement=True)
    user_id    = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    token      = Column(String(255), unique=True, nullable=False)
    expires_at = Column(UTCDateTime(), nullable=False)
    used       = Column(Boolean, default=False, server_default=text("false"), nullable=False)
    created_at = Column(UTCDateTime(), server_default=func.now(), nullable=False)

    user = relationship("User", back_populates="password_resets")


class Exam(Base):
    __tablename__ = "exams"
    __table_args__ = (
        CheckConstraint("char_length(exam_name) >= 7", name="exams_exam_name_check"),
    )

    exam_id     = Column(Integer, primary_key=True, autoincrement=True)
    created_by  = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    exam_name   = Column(String(255), nullable=False)
    description = Column(Text, nullable=False, default="", server_default=text("''"))
    subject     = Column(String(255))
    schedule    = Column(String(255))
    created_at  = Column(UTCDateTime(), server_default=func.now(), nullable=False)
    updated_at  = Column(UTCDateTime(), server_default=func.now(), onupdate=func.now())

    creator     = relationship("User", back_populates="exams")
    pages       = relationship("ExamPage", back_populates="exam", cascade="all, delete")
    answer_keys = relationship("AnswerKey", back_populates="exam", cascade="all, delete")
    test_papers = relationship("TestPaper", back_populates="exam", cascade="all, delete")
    page_parts  = relationship("ExamPagePart", back_populates="exam",
                               cascade="all, delete-orphan")          # NEW 2026-10-24


class ExamPage(Base):
    __tablename__ = "exam_pages"
    __table_args__ = (
        UniqueConstraint("exam_id", "page_number", name="exam_pages_exam_id_page_number_key"),
        CheckConstraint("page_number > 0", name="exam_pages_page_number_check"),
    )

    page_id     = Column(Integer, primary_key=True, autoincrement=True)
    exam_id     = Column(Integer, ForeignKey("exams.exam_id", ondelete="CASCADE"), nullable=False)
    page_number = Column(SmallInteger, nullable=False)
    image_path  = Column(String(500), nullable=False)
    uploaded_at = Column(UTCDateTime(), server_default=func.now(), nullable=False)
    question_type = Column(String(32), nullable=True)

    exam        = relationship("Exam", back_populates="pages")
    answer_keys = relationship("AnswerKey", back_populates="page", cascade="all, delete")
    parts       = relationship("ExamPagePart", back_populates="page",   # NEW 2026-10-24
                               cascade="all, delete-orphan",
                               order_by="ExamPagePart.first_item")


# NEW 2026-10-24
class ExamPagePart(Base):
    __tablename__ = "exam_page_parts"
    __table_args__ = (
        UniqueConstraint("page_id", "first_item", name="exam_page_parts_page_id_first_item_key"),
        CheckConstraint("last_item >= first_item", name="exam_page_parts_range_check"),
        CheckConstraint("first_item >= 1 AND last_item <= 500", name="exam_page_parts_bounds_check"),
        Index("ix_exam_page_parts_exam_id", "exam_id"),
        Index("ix_exam_page_parts_page_id", "page_id"),
    )

    part_id       = Column(Integer, primary_key=True, autoincrement=True)
    exam_id       = Column(Integer, ForeignKey("exams.exam_id", ondelete="CASCADE"), nullable=False)
    page_id       = Column(Integer, ForeignKey("exam_pages.page_id", ondelete="CASCADE"), nullable=False)
    first_item    = Column(SmallInteger, nullable=False)
    last_item     = Column(SmallInteger, nullable=False)
    question_type = Column(String(32), nullable=False)
    letters       = Column(String(16), nullable=False, server_default="ABCD")
    created_at    = Column(UTCDateTime(), server_default=func.now(), nullable=False)

    exam = relationship("Exam", back_populates="page_parts")
    page = relationship("ExamPage", back_populates="parts")


class AnswerKey(Base):
    __tablename__ = "answer_keys"
    __table_args__ = (
        UniqueConstraint("exam_id", "question_number", name="answer_keys_exam_id_question_number_key"),
        CheckConstraint("question_number > 0", name="answer_keys_question_number_check"),
    )

    answer_key_id   = Column(Integer, primary_key=True, autoincrement=True)
    exam_id         = Column(Integer, ForeignKey("exams.exam_id", ondelete="CASCADE"), nullable=False)
    page_id         = Column(Integer, ForeignKey("exam_pages.page_id", ondelete="CASCADE"), nullable=False)
    question_number = Column(SmallInteger, nullable=False)
    correct_answer  = Column(String(100), nullable=False, server_default="")   # WAS String(10)
    ocr_confidence  = Column(Numeric(5, 2))
    generated_at    = Column(UTCDateTime(), server_default=func.now(), nullable=False)

    exam         = relationship("Exam", back_populates="answer_keys")
    page         = relationship("ExamPage", back_populates="answer_keys")
    paper_scores = relationship("PaperScore", back_populates="answer_key", cascade="all, delete")


# NEW 2026-11-12 — the student roster. Alex Passion / Julius Bancud, post-UAT
# page 2, item 4: "Test Paper -> ID # Student / ID Student # -> file of Test
# Exam / Primary Key -> Additional Table", and Doc Rubrica's "Create List of
# Students per Section". See migrations/2026-11-12_students.sql.
#
# It is the prerequisite for "Batch upload of Exam": the blocker
# MULTI-PAGE-UPLOAD-2026-10-23.md recorded was "the system cannot know whose
# paper is whose", and a student number written on the paper and used as the
# image's file name is what answers it.
class Student(Base):
    __tablename__ = "students"
    __table_args__ = (
        # UNIQUE PER TEACHER, not globally: two teachers at one school may hold
        # the same student, and a global unique makes the second roster
        # impossible to fill.
        #
        # lower(trim(...)) for the reason ux_users_lower_email exists
        # (2026-11-11): "2021-A123" and "2021-a123" are one student, and
        # finding that out from a duplicate paper at grading time is finding
        # out too late. Written with text() and named explicitly, the same way
        # ix_test_papers_exam_lastname is below - an index name SQLAlchemy
        # invents for itself makes every future schema comparison report a
        # phantom drift.
        #
        # trim and not btrim: identical in PostgreSQL, SQL-standard, and it
        # lets the test harness run the real expression on SQLite too.
        Index("ux_students_owner_number", "created_by",
              text("lower(trim(student_number))"), unique=True),
        Index("ix_students_owner_section", "created_by", "section"),
        CheckConstraint("trim(student_number) <> ''",
                        name="students_student_number_not_blank"),
    )

    student_id     = Column(Integer, primary_key=True, autoincrement=True)
    created_by     = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    # varchar, NOT integer: real student numbers carry hyphens and leading
    # zeros - "2021-00123", "04512" - and an integer column eats both.
    student_number = Column(String(50), nullable=False)
    last_name      = Column(String(255), nullable=False)
    first_name     = Column(String(255), nullable=False)
    # Free text, for the reason Exam.schedule is free text: her sections are
    # written however her school writes them.
    section        = Column(String(255))
    created_at     = Column(UTCDateTime(), server_default=func.now(), nullable=False)
    updated_at     = Column(UTCDateTime(), server_default=func.now(), onupdate=func.now())

    creator     = relationship("User", back_populates="students")
    test_papers = relationship("TestPaper", back_populates="student")


class TestPaper(Base):
    __tablename__ = "test_papers"
    __table_args__ = (
        Index("ix_test_papers_exam_lastname", "exam_id",
              text("lower(last_name)"), text("lower(first_name)")),
        # NEW 2026-11-12. One paper per student per exam - the rule the
        # 2026-11-09 duplicate guard enforces on NAMES, now enforceable exactly
        # rather than by string comparison, which is the whole point of having
        # an ID.
        #
        # PARTIAL: every paper that exists today has student_id NULL, and
        # without the WHERE clause the second such paper would collide with the
        # first. postgresql_where, so SQLAlchemy emits the same WHERE the
        # migration does.
        Index("ux_test_papers_exam_student", "exam_id", "student_id",
              unique=True, postgresql_where=text("student_id IS NOT NULL")),
    )

    paper_id     = Column(Integer, primary_key=True, autoincrement=True)
    exam_id      = Column(Integer, ForeignKey("exams.exam_id", ondelete="CASCADE"), nullable=False)
    student_name = Column(String(255), nullable=False)
    total_score  = Column(SmallInteger)
    checked      = Column(Boolean, default=False, server_default=text("false"), nullable=False)
    added_at     = Column(UTCDateTime(), server_default=func.now(), nullable=False)
    updated_at   = Column(UTCDateTime(), server_default=func.now(), onupdate=func.now())
    first_name   = Column(String(255))
    last_name    = Column(String(255))
    # NEW 2026-11-12. DECLARED LAST, for exactly the reason first_name and
    # last_name are declared last above: the migration adds it with ALTER TABLE
    # ADD COLUMN, which APPENDS, so a database built by create_all() only
    # agrees with a migrated one if this is the final column.
    #
    # NULLABLE because every paper that exists today has no student row - the
    # same decision, unbackfilled, as the 2026-11-04 name parts.
    #
    # ON DELETE SET NULL, NEVER CASCADE. paper_scores CASCADEs off this table,
    # so a CASCADE here would mean: remove a student from a class list ->
    # delete their test paper -> delete every marked answer on it. A teacher
    # tidying a roster would silently erase a graded exam. MEASURED with
    # PRAGMA foreign_keys=ON - STUDENT-ROSTER-2026-11-12.md, property 1: the
    # paper survives with its score, its checked flag, its own name and its
    # PaperScore rows, and student_id is NULLed rather than left dangling.
    student_id   = Column(Integer, ForeignKey("students.student_id", ondelete="SET NULL"))

    exam         = relationship("Exam", back_populates="test_papers")
    student      = relationship("Student", back_populates="test_papers")   # NEW 2026-11-12
    paper_pages  = relationship("PaperPage", back_populates="paper", cascade="all, delete")
    paper_scores = relationship("PaperScore", back_populates="paper", cascade="all, delete")


class PaperPage(Base):
    __tablename__ = "paper_pages"
    __table_args__ = (
        UniqueConstraint("paper_id", "page_number", name="paper_pages_paper_id_page_number_key"),
        CheckConstraint("page_number > 0", name="paper_pages_page_number_check"),
    )

    paper_page_id = Column(Integer, primary_key=True, autoincrement=True)
    paper_id      = Column(Integer, ForeignKey("test_papers.paper_id", ondelete="CASCADE"), nullable=False)
    page_number   = Column(SmallInteger, nullable=False)
    image_path    = Column(String(500), nullable=False)
    uploaded_at   = Column(UTCDateTime(), server_default=func.now(), nullable=False)

    paper        = relationship("TestPaper", back_populates="paper_pages")
    paper_scores = relationship("PaperScore", back_populates="paper_page", cascade="all, delete")


class PaperScore(Base):
    __tablename__ = "paper_scores"
    __table_args__ = (
        UniqueConstraint("paper_id", "answer_key_id", name="paper_scores_paper_id_answer_key_id_key"),
        CheckConstraint("question_number > 0", name="paper_scores_question_number_check"),
        CheckConstraint("verdict IN ('correct', 'review', 'wrong')", name="paper_scores_verdict_check"),
    )

    score_id        = Column(Integer, primary_key=True, autoincrement=True)
    paper_id        = Column(Integer, ForeignKey("test_papers.paper_id", ondelete="CASCADE"), nullable=False)
    paper_page_id   = Column(Integer, ForeignKey("paper_pages.paper_page_id", ondelete="CASCADE"), nullable=False)
    answer_key_id   = Column(Integer, ForeignKey("answer_keys.answer_key_id", ondelete="CASCADE"), nullable=False)
    question_number = Column(SmallInteger, nullable=False)
    student_answer  = Column(String(100), nullable=False)   # WAS String(10)
    correct_answer  = Column(String(100), nullable=False)   # WAS String(10)
    is_correct      = Column(Boolean, nullable=False)
    verdict         = Column(String(10), nullable=False, server_default="wrong")   # NEW 2026-10-24
    ocr_confidence  = Column(Numeric(5, 2))
    graded_at       = Column(UTCDateTime(), server_default=func.now(), nullable=False)

    paper      = relationship("TestPaper", back_populates="paper_scores")
    paper_page = relationship("PaperPage", back_populates="paper_scores")
    answer_key = relationship("AnswerKey", back_populates="paper_scores")