from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base

class Exam(Base):
    __tablename__ = "exams"
    id       = Column(Integer, primary_key=True, index=True)
    name     = Column(String, nullable=False)
    key_path = Column(String)
    owner_id = Column(Integer, ForeignKey("users.id"))
    papers   = relationship("Paper", back_populates="exam", cascade="all, delete")
