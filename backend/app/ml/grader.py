"""
Grader Module
Compares extracted student answers against the answer key.
"""

def grade_paper(student_answers: list[str], answer_key: list[str]) -> dict:
    correct = sum(
        1 for s, k in zip(student_answers, answer_key)
        if s.strip().lower() == k.strip().lower()
    )
    total = len(answer_key)
    score = round((correct / total) * 100, 2) if total > 0 else 0
    return {"correct": correct, "total": total, "score": score}
