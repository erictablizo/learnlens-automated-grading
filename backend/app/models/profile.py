from sqlalchemy import Column, Integer, String, ForeignKey, func
from sqlalchemy.dialects.postgresql import TIMESTAMPTZ
from sqlalchemy.orm import relationship
from app.core.database import Base
 
 
class Profile(Base):
    __tablename__ = "profiles"
    __table_args__ = {"schema": "public"}
 
    profile_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id    = Column(Integer, ForeignKey("public.users.user_id", ondelete="CASCADE"),
                        nullable=False, unique=True)
    full_name  = Column(String(255), nullable=False)
    college    = Column(String(100), nullable=False)
    department = Column(String(150), nullable=False)
    position   = Column(String(100), nullable=False)
    created_at = Column(TIMESTAMPTZ, server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMPTZ, server_default=func.now(),
                        onupdate=func.now(), nullable=False)
 
    user = relationship("User", back_populates="profile")