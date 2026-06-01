from sqlalchemy import Column, Integer, ForeignKey, DateTime, JSON, Date
from sqlalchemy.sql import func
from database import Base


class StudyPlan(Base):
    __tablename__ = "study_plans"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    date = Column(Date, nullable=False)
    tasks = Column(JSON, nullable=False)   # {algorithm: [...], questions: [...], project: [...]}
    created_at = Column(DateTime, server_default=func.now())
