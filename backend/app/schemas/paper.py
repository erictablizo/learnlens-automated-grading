from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List
 
 
class PaperPageResponse(BaseModel):
    paper_page_id: int
    page_number: int
    image_path: str
    uploaded_at: datetime
    model_config = {"from_attributes": True}
 
 
class PaperScoreResponse(BaseModel):
    score_id: int
    question_number: int
    student_answer: str
    correct_answer: str
    is_correct: bool
    ocr_confidence: Optional[float] = None
    model_config = {"from_attributes": True}
 
 
class PaperCreate(BaseModel):
    student_name: str
 
 
class PaperUpdate(BaseModel):
    student_name: Optional[str] = None
 
 
class PaperResponse(BaseModel):
    paper_id: int
    exam_id: int
    student_name: str
    total_score: Optional[int] = None
    checked: bool
    added_at: datetime
    paper_pages: List[PaperPageResponse] = []
    paper_scores: List[PaperScoreResponse] = []
    model_config = {"from_attributes": True}
 
 
class PaperListResponse(BaseModel):
    paper_id: int
    student_name: str
    total_score: Optional[int] = None
    checked: bool
    added_at: datetime
    model_config = {"from_attributes": True}