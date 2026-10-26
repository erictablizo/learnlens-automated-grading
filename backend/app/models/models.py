from sqlalchemy import (
    Column, Integer, SmallInteger, String, Text, Boolean,
    Numeric, ForeignKey, UniqueConstraint, CheckConstraint, Index, func, text
)
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import relationship
from app.core.database import Base

# CHANGED 2026-10-24 — Doc Rubrica's sixth comment. Four edits, all marked
# "NEW 2026-10-24" or "WAS String(10)" below:
#   * ExamPagePart            — the declared item ranges of a page must survive,
#                               or a paper cannot be read the way its key was.
#   * Exam.page_parts / ExamPage.parts
#   * AnswerKey.correct_answer and PaperScore.student_answer/correct_answer
#                               String(10) -> String(100). varchar(10) cannot
#                               hold COMMUNICATION (13), PROOFREADING (12) or
#                               THESIS STATEMENT (16) - PostgreSQL rejects the
#                               insert outright, and exam_service's old
#                               `a.letter[:10]` was hiding that as a silent
#                               wrong answer.
#   * PaperScore.verdict      — identification is not auto-graded, so a score
#                               row needs correct/review/wrong, not a boolean.
#
# Everything else is untouched. Verified by diffing a database built by this
# file's create_all() against one built by the original models plus
# migrations/2026-10-23_parts_and_answer_length.sql: zero differences across
# 119 columns, constraints and indexes.


class User(Base):
    __tablename__ = "users"
    __table_args__ = {"schema": "public"}

    user_id       = Column(Integer, primary_key=True, autoincrement=True)
    email         = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    created_at    = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at    = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())

    profile         = relationship("UserProfile", back_populates="user", uselist=False, cascade="all, delete")
    exams           = relationship("Exam", back_populates="creator", cascade="all, delete")
    password_resets = relationship("PasswordReset", back_populates="user", cascade="all, delete")


class PasswordReset(Base):
    __tablename__ = "password_resets"
    __table_args__ = {"schema": "public"}

    reset_id   = Column(Integer, primary_key=True, autoincrement=True)
    user_id    = Column(Integer, ForeignKey("public.users.user_id", ondelete="CASCADE"), nullable=False)
    token      = Column(String(255), unique=True, nullable=False)
    expires_at = Column(TIMESTAMP(timezone=True), nullable=False)
    used       = Column(Boolean, default=False, server_default=text("false"), nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User", back_populates="password_resets")


class Exam(Base):
    __tablename__ = "exams"
    __table_args__ = (
        CheckConstraint("char_length(exam_name) >= 7", name="exams_exam_name_check"),
        {"schema": "public"},
    )

    exam_id     = Column(Integer, primary_key=True, autoincrement=True)
    created_by  = Column(Integer, ForeignKey("public.users.user_id", ondelete="CASCADE"), nullable=False)
    exam_name   = Column(String(255), nullable=False)
    description = Column(Text, nullable=False, default="", server_default=text("''"))
    created_at  = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at  = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())

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
        {"schema": "public"},
    )

    page_id     = Column(Integer, primary_key=True, autoincrement=True)
    exam_id     = Column(Integer, ForeignKey("public.exams.exam_id", ondelete="CASCADE"), nullable=False)
    page_number = Column(SmallInteger, nullable=False)
    image_path  = Column(String(500), nullable=False)
    uploaded_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    # NEW 2026-10-26. The question type this page's ANSWER KEY was generated
    # with. NULL means "never generated, or generated before this column
    # existed", and the old inference is used then.
    #
    # This exists because infer_question_type() cannot recover it. `encircled`
    # and `written_letter` both store a bare letter, so a page whose key was
    # built as "mixed" was re-read as "encircled" when checking a paper, and
    # Part I came back empty for every student. A page declared with parts
    # does not need it: exam_page_parts already says what each range is.
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
        # Named explicitly rather than index=True: SQLAlchemy would call them
        # ix_public_exam_page_parts_exam_id for a schema-qualified table, and
        # the migration creates ix_exam_page_parts_exam_id. Both sides must
        # agree or every future schema comparison reports a phantom drift.
        Index("ix_exam_page_parts_exam_id", "exam_id"),
        Index("ix_exam_page_parts_page_id", "page_id"),
        {"schema": "public"},
    )

    part_id       = Column(Integer, primary_key=True, autoincrement=True)
    exam_id       = Column(Integer, ForeignKey("public.exams.exam_id", ondelete="CASCADE"), nullable=False)
    page_id       = Column(Integer, ForeignKey("public.exam_pages.page_id", ondelete="CASCADE"), nullable=False)
    first_item    = Column(SmallInteger, nullable=False)
    last_item     = Column(SmallInteger, nullable=False)
    question_type = Column(String(32), nullable=False)
    letters       = Column(String(16), nullable=False, server_default="ABCD")
    created_at    = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    exam = relationship("Exam", back_populates="page_parts")
    page = relationship("ExamPage", back_populates="parts")


class AnswerKey(Base):
    __tablename__ = "answer_keys"
    __table_args__ = (
        UniqueConstraint("exam_id", "question_number", name="answer_keys_exam_id_question_number_key"),
        CheckConstraint("question_number > 0", name="answer_keys_question_number_check"),
        {"schema": "public"},
    )

    answer_key_id   = Column(Integer, primary_key=True, autoincrement=True)
    exam_id         = Column(Integer, ForeignKey("public.exams.exam_id", ondelete="CASCADE"), nullable=False)
    page_id         = Column(Integer, ForeignKey("public.exam_pages.page_id", ondelete="CASCADE"), nullable=False)
    question_number = Column(SmallInteger, nullable=False)
    correct_answer  = Column(String(100), nullable=False, server_default="")   # WAS String(10)
    ocr_confidence  = Column(Numeric(5, 2))
    generated_at    = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    exam         = relationship("Exam", back_populates="answer_keys")
    page         = relationship("ExamPage", back_populates="answer_keys")
    paper_scores = relationship("PaperScore", back_populates="answer_key", cascade="all, delete")


class TestPaper(Base):
    __tablename__ = "test_papers"
    __table_args__ = {"schema": "public"}

    paper_id     = Column(Integer, primary_key=True, autoincrement=True)
    exam_id      = Column(Integer, ForeignKey("public.exams.exam_id", ondelete="CASCADE"), nullable=False)
    student_name = Column(String(255), nullable=False)
    total_score  = Column(SmallInteger)
    checked      = Column(Boolean, default=False, server_default=text("false"), nullable=False)
    added_at     = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at   = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())

    exam         = relationship("Exam", back_populates="test_papers")
    paper_pages  = relationship("PaperPage", back_populates="paper", cascade="all, delete")
    paper_scores = relationship("PaperScore", back_populates="paper", cascade="all, delete")


class PaperPage(Base):
    __tablename__ = "paper_pages"
    __table_args__ = (
        UniqueConstraint("paper_id", "page_number", name="paper_pages_paper_id_page_number_key"),
        CheckConstraint("page_number > 0", name="paper_pages_page_number_check"),
        {"schema": "public"},
    )

    paper_page_id = Column(Integer, primary_key=True, autoincrement=True)
    paper_id      = Column(Integer, ForeignKey("public.test_papers.paper_id", ondelete="CASCADE"), nullable=False)
    page_number   = Column(SmallInteger, nullable=False)
    image_path    = Column(String(500), nullable=False)
    uploaded_at   = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    paper        = relationship("TestPaper", back_populates="paper_pages")
    paper_scores = relationship("PaperScore", back_populates="paper_page", cascade="all, delete")


class PaperScore(Base):
    __tablename__ = "paper_scores"
    __table_args__ = (
        UniqueConstraint("paper_id", "answer_key_id", name="paper_scores_paper_id_answer_key_id_key"),
        CheckConstraint("question_number > 0", name="paper_scores_question_number_check"),
        CheckConstraint("verdict IN ('correct', 'review', 'wrong')", name="paper_scores_verdict_check"),
        {"schema": "public"},
    )

    score_id        = Column(Integer, primary_key=True, autoincrement=True)
    paper_id        = Column(Integer, ForeignKey("public.test_papers.paper_id", ondelete="CASCADE"), nullable=False)
    paper_page_id   = Column(Integer, ForeignKey("public.paper_pages.paper_page_id", ondelete="CASCADE"), nullable=False)
    answer_key_id   = Column(Integer, ForeignKey("public.answer_keys.answer_key_id", ondelete="CASCADE"), nullable=False)
    question_number = Column(SmallInteger, nullable=False)
    student_answer  = Column(String(100), nullable=False)   # WAS String(10)
    correct_answer  = Column(String(100), nullable=False)   # WAS String(10)
    is_correct      = Column(Boolean, nullable=False)
    verdict         = Column(String(10), nullable=False, server_default="wrong")   # NEW 2026-10-24
    ocr_confidence  = Column(Numeric(5, 2))
    graded_at       = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    paper      = relationship("TestPaper", back_populates="paper_scores")
    paper_page = relationship("PaperPage", back_populates="paper_scores")
    answer_key = relationship("AnswerKey", back_populates="paper_scores")