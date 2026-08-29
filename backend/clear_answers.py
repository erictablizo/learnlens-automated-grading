import asyncio
from app.core.database import AsyncSessionLocal
from app.models.models import AnswerKey

async def clear_exam_answers(exam_id: int):
    async with AsyncSessionLocal() as session:
        # Query for answers to delete
        from sqlalchemy import delete
        stmt = delete(AnswerKey).where(AnswerKey.exam_id == exam_id)
        result = await session.execute(stmt)
        await session.commit()
        print(f"Cleared {result.rowcount} answer keys for exam {exam_id}")

if __name__ == "__main__":
    asyncio.run(clear_exam_answers(42))