from app.core.database import Base  # noqa: F401 — ensures Base is importable for migrations
 
# Import all models here so Alembic/SQLAlchemy can discover them when
# generating migrations or calling Base.metadata.create_all().
from app.models.models import (  # noqa: F401
    User,
    PasswordReset,
    Exam,
    ExamPage,
    AnswerKey,
    TestPaper,
    PaperPage,
    PaperScore,
)