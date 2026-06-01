from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime


class ProblemListOut(BaseModel):
    id: int
    name: str
    source: str
    total_count: int

    model_config = {"from_attributes": True}


class AlgorithmRecordCreate(BaseModel):
    leetcode_id: int
    title: str
    difficulty: str
    tags: Optional[List[str]] = None
    mastery: str   # mastered/fuzzy/unknown
    list_id: Optional[int] = None


class AlgorithmRecordOut(BaseModel):
    id: int
    leetcode_id: int
    title: str
    difficulty: str
    tags: Optional[List[str]]
    mastery: str
    created_at: datetime
    next_review_date: Optional[datetime]

    model_config = {"from_attributes": True}


class DailyRecommendation(BaseModel):
    leetcode_id: int
    title: str
    difficulty: str
    tags: List[str]
    url: str
    reason: str   # "主线推进" | "复习巩固"
