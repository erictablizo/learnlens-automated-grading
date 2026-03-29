from pydantic import BaseModel, field_validator
from datetime import datetime
from typing import Optional, List
 
 
class ExamPageResponse(BaseModel):
    page_id: int
    page_number: int
    image_path: str
    uploaded_at: datetime
    model_config = {"from_attributes": True}
 
 
class AnswerKeyResponse(BaseModel):
    answer_key_id: int
    question_number: int
    correct_answer: str
    ocr_confidence: Optional[float] = None
    generated_at: datetime
    model_config = {"from_attributes": True}
 
 
class ExamCreate(BaseModel):
    exam_name: str
    description: str = ""
 
    @field_validator("exam_name")
    @classmethod
    def name_min_length(cls, v: str) -> str:
        if len(v) < 7:
            raise ValueError("Exam name must be at least 7 characters")
        return v
 
 
class ExamUpdate(BaseModel):
    exam_name: Optional[str] = None
    description: Optional[str] = None
 
 
class ExamResponse(BaseModel):
    exam_id: int
    exam_name: str
    description: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    pages: List[ExamPageResponse] = []
    answer_keys: List[AnswerKeyResponse] = []
    model_config = {"from_attributes": True}
 
 
class ExamListResponse(BaseModel):
    exam_id: int
    exam_name: str
    description: str
    created_at: datetime
    model_config = {"from_attributes": True}