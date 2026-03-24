from datetime import datetime, timezone
from typing import Optional, List
 
from sqlalchemy import (
    Integer, String, Text, Boolean, SmallInteger,
    Numeric, ForeignKey, UniqueConstraint, CheckConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import TIMESTAMP
 
from app.core.database import Base
 
 
class User(Base):
    """
    Maps to public.users
    Central entity — owns exams and password resets.
    HCI principle: simple, clear model reflects the user-centered design.
    """
    __tablename__ = "users"
    __table_args__ = {"schema": "public"}
 
    user_id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )
    email: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False, index=True
    )
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
 
    # ── Relationships ──────────────────────────────────────────────────────
    password_resets: Mapped[List["PasswordReset"]] = relationship(
        "PasswordReset",
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="select",
    )
    exams: Mapped[List["Exam"]] = relationship(
        "Exam",
        back_populates="creator",
        cascade="all, delete-orphan",
        lazy="select",
    )
 
    def __repr__(self) -> str:
        return f"<User id={self.user_id} email={self.email!r}>"
 
 
class PasswordReset(Base):
    """
    Maps to public.password_resets
    Stores single-use, expiring tokens for the Forgot Password flow.
    """
    __tablename__ = "password_resets"
    __table_args__ = (
        UniqueConstraint("token", name="password_resets_token_key"),
        {"schema": "public"},
    )
 
    reset_id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("public.users.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False
    )
    used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
 
    # ── Relationships ──────────────────────────────────────────────────────
    user: Mapped["User"] = relationship("User", back_populates="password_resets")
 
    def __repr__(self) -> str:
        return (
            f"<PasswordReset id={self.reset_id} "
            f"user_id={self.user_id} used={self.used}>"
        )
 
 
class Exam(Base):
    """
    Maps to public.exams
    Each exam is owned by a user (created_by FK → users).
    """
    __tablename__ = "exams"
    __table_args__ = (
        CheckConstraint(
            "char_length(exam_name) >= 7",
            name="exams_exam_name_check",
        ),
        {"schema": "public"},
    )
 
    exam_id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )
    created_by: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("public.users.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    exam_name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=True,
    )
 
    # ── Relationships ──────────────────────────────────────────────────────
    creator: Mapped["User"] = relationship("User", back_populates="exams")
    pages: Mapped[List["ExamPage"]] = relationship(
        "ExamPage",
        back_populates="exam",
        cascade="all, delete-orphan",
        lazy="select",
    )
    answer_keys: Mapped[List["AnswerKey"]] = relationship(
        "AnswerKey",
        back_populates="exam",
        cascade="all, delete-orphan",
        lazy="select",
    )
    test_papers: Mapped[List["TestPaper"]] = relationship(
        "TestPaper",
        back_populates="exam",
        cascade="all, delete-orphan",
        lazy="select",
    )
 
    def __repr__(self) -> str:
        return f"<Exam id={self.exam_id} name={self.exam_name!r}>"
 
 
class ExamPage(Base):
    """Maps to public.exam_pages — stores answer-key scan images per exam."""
    __tablename__ = "exam_pages"
    __table_args__ = (
        UniqueConstraint("exam_id", "page_number", name="exam_pages_exam_id_page_number_key"),
        CheckConstraint("page_number > 0", name="exam_pages_page_number_check"),
        {"schema": "public"},
    )
 
    page_id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )
    exam_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("public.exams.exam_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    page_number: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    image_path: Mapped[str] = mapped_column(String(500), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
 
    # ── Relationships ──────────────────────────────────────────────────────
    exam: Mapped["Exam"] = relationship("Exam", back_populates="pages")
    answer_keys: Mapped[List["AnswerKey"]] = relationship(
        "AnswerKey",
        back_populates="page",
        cascade="all, delete-orphan",
        lazy="select",
    )
 
    def __repr__(self) -> str:
        return f"<ExamPage id={self.page_id} exam_id={self.exam_id} page={self.page_number}>"
 
 
class AnswerKey(Base):
    """Maps to public.answer_keys — correct answers per question per page."""
    __tablename__ = "answer_keys"
    __table_args__ = (
        CheckConstraint("question_number > 0", name="answer_keys_question_number_check"),
        {"schema": "public"},
    )
 
    answer_key_id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )
    exam_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("public.exams.exam_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    page_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("public.exam_pages.page_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question_number: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    correct_answer: Mapped[str] = mapped_column(String(10), nullable=False)
    ocr_confidence: Mapped[Optional[float]] = mapped_column(
        Numeric(5, 2), nullable=True
    )
    generated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
 
    # ── Relationships ──────────────────────────────────────────────────────
    exam: Mapped["Exam"] = relationship("Exam", back_populates="answer_keys")
    page: Mapped["ExamPage"] = relationship("ExamPage", back_populates="answer_keys")
    paper_scores: Mapped[List["PaperScore"]] = relationship(
        "PaperScore",
        back_populates="answer_key",
        cascade="all, delete-orphan",
        lazy="select",
    )
 
    def __repr__(self) -> str:
        return (
            f"<AnswerKey id={self.answer_key_id} "
            f"q={self.question_number} answer={self.correct_answer!r}>"
        )
 
 
class TestPaper(Base):
    """Maps to public.test_papers — a student's submitted exam paper."""
    __tablename__ = "test_papers"
    __table_args__ = {"schema": "public"}
 
    paper_id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )
    exam_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("public.exams.exam_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    checked: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, index=True
    )
    uploaded_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
 
    # ── Relationships ──────────────────────────────────────────────────────
    exam: Mapped["Exam"] = relationship("Exam", back_populates="test_papers")
    pages: Mapped[List["PaperPage"]] = relationship(
        "PaperPage",
        back_populates="paper",
        cascade="all, delete-orphan",
        lazy="select",
    )
    scores: Mapped[List["PaperScore"]] = relationship(
        "PaperScore",
        back_populates="paper",
        cascade="all, delete-orphan",
        lazy="select",
    )
 
    def __repr__(self) -> str:
        return f"<TestPaper id={self.paper_id} exam_id={self.exam_id} checked={self.checked}>"
 
 
class PaperPage(Base):
    """Maps to public.paper_pages — individual scanned pages of a student paper."""
    __tablename__ = "paper_pages"
    __table_args__ = (
        UniqueConstraint("paper_id", "page_number", name="paper_pages_paper_id_page_number_key"),
        CheckConstraint("page_number > 0", name="paper_pages_page_number_check"),
        {"schema": "public"},
    )
 
    paper_page_id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )
    paper_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("public.test_papers.paper_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    page_number: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    image_path: Mapped[str] = mapped_column(String(500), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
 
    # ── Relationships ──────────────────────────────────────────────────────
    paper: Mapped["TestPaper"] = relationship("TestPaper", back_populates="pages")
    scores: Mapped[List["PaperScore"]] = relationship(
        "PaperScore",
        back_populates="paper_page",
        cascade="all, delete-orphan",
        lazy="select",
    )
 
    def __repr__(self) -> str:
        return (
            f"<PaperPage id={self.paper_page_id} "
            f"paper_id={self.paper_id} page={self.page_number}>"
        )
 
 
class PaperScore(Base):
    """
    Maps to public.paper_scores
    One row per question per paper — stores student answer vs correct answer.
    """
    __tablename__ = "paper_scores"
    __table_args__ = (
        UniqueConstraint(
            "paper_id", "answer_key_id",
            name="paper_scores_paper_id_answer_key_id_key",
        ),
        CheckConstraint("question_number > 0", name="paper_scores_question_number_check"),
        {"schema": "public"},
    )
 
    score_id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )
    paper_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("public.test_papers.paper_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    paper_page_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("public.paper_pages.paper_page_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    answer_key_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("public.answer_keys.answer_key_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question_number: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    student_answer: Mapped[str] = mapped_column(String(10), nullable=False)
    correct_answer: Mapped[str] = mapped_column(String(10), nullable=False)
    is_correct: Mapped[bool] = mapped_column(Boolean, nullable=False)
    ocr_confidence: Mapped[Optional[float]] = mapped_column(
        Numeric(5, 2), nullable=True
    )
    graded_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
 
    # ── Relationships ──────────────────────────────────────────────────────
    paper: Mapped["TestPaper"] = relationship("TestPaper", back_populates="scores")
    paper_page: Mapped["PaperPage"] = relationship("PaperPage", back_populates="scores")
    answer_key: Mapped["AnswerKey"] = relationship("AnswerKey", back_populates="paper_scores")
 
    def __repr__(self) -> str:
        return (
            f"<PaperScore id={self.score_id} "
            f"q={self.question_number} correct={self.is_correct}>"
        )
