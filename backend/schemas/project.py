from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime


class ProjectCreate(BaseModel):
    name: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    role: Optional[str] = None
    team_size: Optional[int] = None
    background: Optional[str] = None
    tech_arch: Optional[str] = None
    my_work: Optional[str] = None
    highlights: Optional[str] = None
    difficulties: Optional[str] = None
    tech_stack: Optional[List[str]] = None
    project_type: Optional[str] = None


class ProjectUpdate(ProjectCreate):
    name: Optional[str] = None


class ProjectOut(BaseModel):
    id: int
    name: str
    start_date: Optional[str]
    end_date: Optional[str]
    role: Optional[str]
    team_size: Optional[int]
    background: Optional[str]
    tech_arch: Optional[str]
    my_work: Optional[str]
    highlights: Optional[str]
    difficulties: Optional[str]
    tech_stack: Optional[List[str]]
    project_type: Optional[str]
    analysis: Optional[Any]
    created_at: datetime

    model_config = {"from_attributes": True}


class InterviewSessionOut(BaseModel):
    id: int
    project_id: int
    mock_company: Optional[str]
    score: Optional[int]
    report: Optional[Any]
    created_at: datetime

    model_config = {"from_attributes": True}


class ConversationOut(BaseModel):
    id: int
    session_id: int
    role: str
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}
