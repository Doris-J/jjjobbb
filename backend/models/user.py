from sqlalchemy import Column, Integer, String, Date, DateTime, JSON
from sqlalchemy.sql import func
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    username = Column(String, nullable=True)
    target_job = Column(String, nullable=True)       # Java后端/前端/算法...
    tech_stack = Column(JSON, nullable=True)          # ["Java", "Redis", ...]
    target_companies = Column(JSON, nullable=True)    # ["字节", "阿里", ...]
    interview_date = Column(Date, nullable=True)
    level = Column(String, nullable=True)             # 入门/中级/高级
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
