from sqlalchemy import (
    Column, Integer, SmallInteger, String, Text, Boolean,
    Numeric, ForeignKey, UniqueConstraint, CheckConstraint,
    func
)
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import relationship
from app.core.database import Base
 
 
class User(Base):
    __tablename__ = "users"
    __table_args__ = {"schema": "public"}
 
    user_id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())
 
    exams = relationship("Exam", back_populates="creator", cascade="all, delete")
    password_resets = relationship("PasswordReset", back_populates="user", cascade="all, delete")
 
 
class PasswordReset(Base):
    __tablename__ = "password_resets"
    __table_args__ = {"schema": "public"}
 
    reset_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("public.users.user_id", ondelete="CASCADE"), nullable=False)
    token = Column(String(255), unique=True, nullable=False)
    expires_at = Column(TIMESTAMP(timezone=True), nullable=False)
    used = Column(Boolean, default=False, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
 
    user = relationship("User", back_populates="password_resets")
 
 
class Exam(Base):
    __tablename__ = "exams"
    __table_args__ = (
        CheckConstraint("char_length(exam_name) >= 7", name="exams_exam_name_check"),
        {"schema": "public"},
    )
 
    exam_id = Column(Integer, primary_key=True, autoincrement=True)
    created_by = Column(Integer, ForeignKey("public.users.user_id", ondelete="CASCADE"), nullable=False)
    exam_name = Column(String(255), nullable=False)
    description = Column(Text, nullable=False, default="")
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())
 
    creator = relationship("User", back_populates="exams")
    pages = relationship("ExamPage", back_populates="exam", cascade="all, delete")
    answer_keys = relationship("AnswerKey", back_populates="exam", cascade="all, delete")
    test_papers = relationship("TestPaper", back_populates="exam", cascade="all, delete")
 
 
class ExamPage(Base):
    __tablename__ = "exam_pages"
    __table_args__ = (
        UniqueConstraint("exam_id", "page_number"),
        CheckConstraint("page_number > 0"),
        {"schema": "public"},
    )
 
    page_id = Column(Integer, primary_key=True, autoincrement=True)
    exam_id = Column(Integer, ForeignKey("public.exams.exam_id", ondelete="CASCADE"), nullable=False)
    page_number = Column(SmallInteger, nullable=False)
    image_path = Column(String(500), nullable=False)
    uploaded_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
 
    exam = relationship("Exam", back_populates="pages")
    answer_keys = relationship("AnswerKey", back_populates="page", cascade="all, delete")
 
 
class AnswerKey(Base):
    __tablename__ = "answer_keys"
    __table_args__ = (
        UniqueConstraint("exam_id", "question_number"),
        CheckConstraint("question_number > 0"),
        {"schema": "public"},
    )
 
    answer_key_id = Column(Integer, primary_key=True, autoincrement=True)
    exam_id = Column(Integer, ForeignKey("public.exams.exam_id", ondelete="CASCADE"), nullable=False)
    page_id = Column(Integer, ForeignKey("public.exam_pages.page_id", ondelete="CASCADE"), nullable=False)
    question_number = Column(SmallInteger, nullable=False)
    correct_answer = Column(String(10), nullable=False)
    ocr_confidence = Column(Numeric(5, 2))
    generated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
 
    exam = relationship("Exam", back_populates="answer_keys")
    page = relationship("ExamPage", back_populates="answer_keys")
    paper_scores = relationship("PaperScore", back_populates="answer_key", cascade="all, delete")
 
 
class TestPaper(Base):
    __tablename__ = "test_papers"
    __table_args__ = {"schema": "public"}
 
    paper_id = Column(Integer, primary_key=True, autoincrement=True)
    exam_id = Column(Integer, ForeignKey("public.exams.exam_id", ondelete="CASCADE"), nullable=False)
    student_name = Column(String(255), nullable=False)
    total_score = Column(SmallInteger)
    checked = Column(Boolean, default=False, nullable=False)
    added_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())
 
    exam = relationship("Exam", back_populates="test_papers")
    paper_pages = relationship("PaperPage", back_populates="paper", cascade="all, delete")
    paper_scores = relationship("PaperScore", back_populates="paper", cascade="all, delete")
 
 
class PaperPage(Base):
    __tablename__ = "paper_pages"
    __table_args__ = (
        UniqueConstraint("paper_id", "page_number"),
        CheckConstraint("page_number > 0"),
        {"schema": "public"},
    )
 
    paper_page_id = Column(Integer, primary_key=True, autoincrement=True)
    paper_id = Column(Integer, ForeignKey("public.test_papers.paper_id", ondelete="CASCADE"), nullable=False)
    page_number = Column(SmallInteger, nullable=False)
    image_path = Column(String(500), nullable=False)
    uploaded_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
 
    paper = relationship("TestPaper", back_populates="paper_pages")
    paper_scores = relationship("PaperScore", back_populates="paper_page", cascade="all, delete")
 
 
class PaperScore(Base):
    __tablename__ = "paper_scores"
    __table_args__ = (
        UniqueConstraint("paper_id", "answer_key_id"),
        CheckConstraint("question_number > 0"),
        {"schema": "public"},
    )
 
    score_id = Column(Integer, primary_key=True, autoincrement=True)
    paper_id = Column(Integer, ForeignKey("public.test_papers.paper_id", ondelete="CASCADE"), nullable=False)
    paper_page_id = Column(Integer, ForeignKey("public.paper_pages.paper_page_id", ondelete="CASCADE"), nullable=False)
    answer_key_id = Column(Integer, ForeignKey("public.answer_keys.answer_key_id", ondelete="CASCADE"), nullable=False)
    question_number = Column(SmallInteger, nullable=False)
    student_answer = Column(String(10), nullable=False)
    correct_answer = Column(String(10), nullable=False)
    is_correct = Column(Boolean, nullable=False)
    ocr_confidence = Column(Numeric(5, 2))
    graded_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
 
    paper = relationship("TestPaper", back_populates="paper_scores")
    paper_page = relationship("PaperPage", back_populates="paper_scores")
    answer_key = relationship("AnswerKey", back_populates="paper_scores")