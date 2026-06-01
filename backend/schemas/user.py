from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import date


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    username: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserUpdate(BaseModel):
    username: Optional[str] = None
    target_job: Optional[str] = None
    tech_stack: Optional[List[str]] = None
    target_companies: Optional[List[str]] = None
    interview_date: Optional[date] = None
    level: Optional[str] = None


class UserOut(BaseModel):
    id: int
    email: str
    username: Optional[str]
    target_job: Optional[str]
    tech_stack: Optional[List[str]]
    target_companies: Optional[List[str]]
    interview_date: Optional[date]
    level: Optional[str]

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserOut
