"""
app/models/reference.py
=======================
NEW 2026-11-14 — the three maintainable dropdown lists.

    Alex Passion / Julius Bancud, Recommendations page 1:
      "Where to maintain the list of College Info in College Dropdown List"
      "Where to maintain the list of Course / Program Info ..."
      "Where to maintain the list of Year Level Info ..."

Its own module rather than more classes in `models.py`, for the same reason
`routes/admin.py` is its own router: these three tables are REFERENCE DATA -
institution-wide lists that describe the school - and everything else in
`models.py` is a teacher's own work. Keeping them apart means the question
"what can an administrator change?" has a one-file answer.

`active`, not deletion. See the migration header: turning a row off hides it
from new edits and leaves every stored profile working.
"""
from sqlalchemy import (
    Boolean, CheckConstraint, Column, ForeignKey, Integer, SmallInteger,
    String, UniqueConstraint, func,
)
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import TIMESTAMP

from app.core.database import Base


class College(Base):
    __tablename__ = "colleges"
    __table_args__ = ({"schema": "public"},)

    college_id  = Column(Integer, primary_key=True, autoincrement=True)
    # varchar(20) to match user_profiles.college EXACTLY. That column is what
    # stores this value; a code this table accepted and that one could not
    # would fail at save time, on the teacher's screen, not here.
    code        = Column(String(20), unique=True, nullable=False)
    name        = Column(String(255), nullable=False)
    badge_bg    = Column(String(16), nullable=False, server_default="#eef1f4")
    badge_color = Column(String(16), nullable=False, server_default="#334155")
    sort_order  = Column(Integer, nullable=False, server_default="0")
    active      = Column(Boolean, nullable=False, server_default="true")
    created_at  = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at  = Column(TIMESTAMP(timezone=True), server_default=func.now(),
                         onupdate=func.now(), nullable=False)

    courses      = relationship("Course", back_populates="college",
                                cascade="all, delete-orphan")
    year_levels  = relationship("YearLevel", back_populates="college",
                                cascade="all, delete-orphan")


class Course(Base):
    __tablename__ = "courses"
    __table_args__ = (
        UniqueConstraint("college_id", "name", name="courses_college_name_key"),
        {"schema": "public"},
    )

    course_id  = Column(Integer, primary_key=True, autoincrement=True)
    college_id = Column(Integer, ForeignKey("public.colleges.college_id", ondelete="CASCADE"),
                        nullable=False)
    name       = Column(String(255), nullable=False)
    sort_order = Column(Integer, nullable=False, server_default="0")
    active     = Column(Boolean, nullable=False, server_default="true")
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(),
                        onupdate=func.now(), nullable=False)

    college = relationship("College", back_populates="courses")


class YearLevel(Base):
    __tablename__ = "year_levels"
    __table_args__ = (
        UniqueConstraint("college_id", "level", name="year_levels_college_level_key"),
        # Written as two comparisons rather than BETWEEN, because PostgreSQL
        # rewrites BETWEEN into >= AND <= and this is the form
        # pg_get_constraintdef() prints back - the 2026-11-03 lesson about
        # the model and the migrated table rendering identically.
        CheckConstraint("level >= 1 AND level <= 6", name="year_levels_level_check"),
        {"schema": "public"},
    )

    year_level_id = Column(Integer, primary_key=True, autoincrement=True)
    college_id    = Column(Integer, ForeignKey("public.colleges.college_id", ondelete="CASCADE"),
                           nullable=False)
    level         = Column(SmallInteger, nullable=False)
    label         = Column(String(32), nullable=False)
    active        = Column(Boolean, nullable=False, server_default="true")
    created_at    = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at    = Column(TIMESTAMP(timezone=True), server_default=func.now(),
                           onupdate=func.now(), nullable=False)

    college = relationship("College", back_populates="year_levels")