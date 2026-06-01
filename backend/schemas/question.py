from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime


class QuestionOut(BaseModel):
    id: int
    category: str
    subcategory: str
    question: str
    answer: Optional[str] = None   # 不在考试时返回
    type: str
    difficulty: str
    options: Optional[List[Any]]
    correct_option: Optional[str]

    model_config = {"from_attributes": True}


class AnswerSubmit(BaseModel):
    user_answer: str


class AnswerFeedback(BaseModel):
    score: float
    correct_points: List[str]
    missing_points: List[str]
    reference_answer: str
    next_follow_up_id: Optional[int] = None
