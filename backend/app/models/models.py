from sqlalchemy import (
    Column, Integer, String, Text, Boolean, Numeric, SmallInteger,
    ForeignKey, TIMESTAMP, func, UniqueConstraint, CheckConstraint
)
from sqlalchemy.orm import relationship
from app.core.database import Base
 
 
class User(Base):
    __tablename__ = "users"
 
    user_id = Column(Integer, primary_key=True)
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())
 
    exams = relationship("Exam", back_populates="creator", cascade="all, delete")
    password_resets = relationship("PasswordReset", back_populates="user", cascade="all, delete")
 
 
class PasswordReset(Base):
    __tablename__ = "password_resets"
 
    reset_id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    token = Column(String(255), unique=True, nullable=False)
    expires_at = Column(TIMESTAMP(timezone=True), nullable=False)
    used = Column(Boolean, default=False, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
 
    user = relationship("User", back_populates="password_resets")
 
 
class Exam(Base):
    __tablename__ = "exams"
    __table_args__ = (
        CheckConstraint("char_length(exam_name) >= 7", name="exams_exam_name_check"),
    )
 
    exam_id = Column(Integer, primary_key=True)
    created_by = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    exam_name = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())
 
    creator = relationship("User", back_populates="exams")
    pages = relationship("ExamPage", back_populates="exam", cascade="all, delete")
    test_papers = relationship("TestPaper", back_populates="exam", cascade="all, delete")
    answer_keys = relationship("AnswerKey", back_populates="exam", cascade="all, delete")
 
 
class ExamPage(Base):
    __tablename__ = "exam_pages"
    __table_args__ = (
        UniqueConstraint("exam_id", "page_number", name="exam_pages_exam_id_page_number_key"),
        CheckConstraint("page_number > 0", name="exam_pages_page_number_check"),
    )
 
    page_id = Column(Integer, primary_key=True)
    exam_id = Column(Integer, ForeignKey("exams.exam_id", ondelete="CASCADE"), nullable=False)
    page_number = Column(SmallInteger, nullable=False)
    image_path = Column(String(500), nullable=False)
    uploaded_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
 
    exam = relationship("Exam", back_populates="pages")
    answer_keys = relationship("AnswerKey", back_populates="page", cascade="all, delete")
 
 
class AnswerKey(Base):
    __tablename__ = "answer_keys"
    __table_args__ = (
        CheckConstraint("question_number > 0", name="answer_keys_question_number_check"),
    )
 
    answer_key_id = Column(Integer, primary_key=True)
    exam_id = Column(Integer, ForeignKey("exams.exam_id", ondelete="CASCADE"), nullable=False)
    page_id = Column(Integer, ForeignKey("exam_pages.page_id", ondelete="CASCADE"), nullable=False)
    question_number = Column(SmallInteger, nullable=False)
    correct_answer = Column(String(10), nullable=False)
    ocr_confidence = Column(Numeric(5, 2))
    generated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
 
    exam = relationship("Exam", back_populates="answer_keys")
    page = relationship("ExamPage", back_populates="answer_keys")
 
 
class TestPaper(Base):
    __tablename__ = "test_papers"
 
    paper_id = Column(Integer, primary_key=True)
    exam_id = Column(Integer, ForeignKey("exams.exam_id", ondelete="CASCADE"), nullable=False)
    student_name = Column(String(255), nullable=False)
    total_score = Column(Numeric(5, 2))
    checked = Column(Boolean, default=False, nullable=False)
    added_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())
 
    exam = relationship("Exam", back_populates="test_papers")
    pages = relationship("PaperPage", back_populates="paper", cascade="all, delete")
    scores = relationship("PaperScore", back_populates="paper", cascade="all, delete")
 
 
class PaperPage(Base):
    __tablename__ = "paper_pages"
    __table_args__ = (
        UniqueConstraint("paper_id", "page_number", name="paper_pages_paper_id_page_number_key"),
        CheckConstraint("page_number > 0", name="paper_pages_page_number_check"),
    )
 
    paper_page_id = Column(Integer, primary_key=True)
    paper_id = Column(Integer, ForeignKey("test_papers.paper_id", ondelete="CASCADE"), nullable=False)
    page_number = Column(SmallInteger, nullable=False)
    image_path = Column(String(500), nullable=False)
    uploaded_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
 
    paper = relationship("TestPaper", back_populates="pages")
    scores = relationship("PaperScore", back_populates="paper_page", cascade="all, delete")
 
 
class PaperScore(Base):
    __tablename__ = "paper_scores"
    __table_args__ = (
        UniqueConstraint("paper_id", "answer_key_id", name="paper_scores_paper_id_answer_key_id_key"),
        CheckConstraint("question_number > 0", name="paper_scores_question_number_check"),
    )
 
    score_id = Column(Integer, primary_key=True)
    paper_id = Column(Integer, ForeignKey("test_papers.paper_id", ondelete="CASCADE"), nullable=False)
    paper_page_id = Column(Integer, ForeignKey("paper_pages.paper_page_id", ondelete="CASCADE"), nullable=False)
    answer_key_id = Column(Integer, ForeignKey("answer_keys.answer_key_id", ondelete="CASCADE"), nullable=False)
    question_number = Column(SmallInteger, nullable=False)
    student_answer = Column(String(10), nullable=False)
    correct_answer = Column(String(10), nullable=False)
    is_correct = Column(Boolean, nullable=False)
    ocr_confidence = Column(Numeric(5, 2))
    graded_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
 
    paper = relationship("TestPaper", back_populates="scores")
    paper_page = relationship("PaperPage", back_populates="scores")