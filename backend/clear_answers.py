from app.core.database import SessionLocal
from app.models.models import AnswerKey

def clear_exam_answers(exam_id: int):
    db = SessionLocal()
    count = db.query(AnswerKey).filter(AnswerKey.exam_id == exam_id).delete()
    db.commit()
    db.close()
    print(f"Cleared {count} answer keys for exam {exam_id}")

if __name__ == "__main__":
    clear_exam_answers(42)