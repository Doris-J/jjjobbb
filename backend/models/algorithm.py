from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, JSON
from sqlalchemy.sql import func
from database import Base


class ProblemList(Base):
    __tablename__ = "problem_lists"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)          # LeetCode 75 / Top Interview 150
    source = Column(String, nullable=False)        # 社区整理来源说明
    total_count = Column(Integer, nullable=False)
    problems = Column(JSON, nullable=False)        # [{order, leetcode_id, title, difficulty, tags, url}]


class UserProblemList(Base):
    __tablename__ = "user_problem_lists"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    list_id = Column(Integer, ForeignKey("problem_lists.id"), nullable=False)
    selected_at = Column(DateTime, server_default=func.now())


class AlgorithmRecord(Base):
    __tablename__ = "algorithm_records"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    list_id = Column(Integer, ForeignKey("problem_lists.id"), nullable=True)
    leetcode_id = Column(Integer, nullable=False)
    title = Column(String, nullable=False)
    difficulty = Column(String, nullable=False)    # Easy/Medium/Hard
    tags = Column(JSON, nullable=True)             # ["数组", "哈希表"]
    mastery = Column(String, nullable=False)       # mastered/fuzzy/unknown
    created_at = Column(DateTime, server_default=func.now())
    next_review_date = Column(DateTime, nullable=True)
