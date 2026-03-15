from sqlalchemy import Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base

class Paper(Base):
    __tablename__ = "papers"
    id           = Column(Integer, primary_key=True, index=True)
    student_name = Column(String, nullable=False)
    sheet_path   = Column(String)
    score        = Column(Float, nullable=True)
    exam_id      = Column(Integer, ForeignKey("exams.id"))
    exam         = relationship("Exam", back_populates="papers")
