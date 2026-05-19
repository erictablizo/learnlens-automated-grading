from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, func
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import relationship
from app.core.database import Base
 
 
class UserProfile(Base):
    __tablename__ = "user_profiles"
    __table_args__ = {"schema": "public"}
 
    profile_id       = Column(Integer, primary_key=True, autoincrement=True)
    user_id          = Column(Integer, ForeignKey("public.users.user_id", ondelete="CASCADE"), unique=True, nullable=False)
    first_name       = Column(String(100))
    last_name        = Column(String(100))
    college          = Column(String(20))      # CVMAS | CBMA | CoEd | CAST
    course           = Column(String(255))     # Program within the college
    position         = Column(String(255))
    avatar_path      = Column(String(500))
    profile_complete = Column(Boolean, default=False, nullable=False)
    created_at       = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at       = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())
 
    user = relationship("User", back_populates="profile")