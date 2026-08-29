from sqlalchemy.orm import sessionmaker
from app.core.database import engine
from app.models.models import AnswerKey

# Create session
Session = sessionmaker(bind=engine)
db = Session()

# Clear answers
count = db.query(AnswerKey).filter(AnswerKey.exam_id == 42).delete()
db.commit()
db.close()

print(f"Cleared {count} answer keys for exam 42")