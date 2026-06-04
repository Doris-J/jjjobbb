from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, JSON, Float, UniqueConstraint
from sqlalchemy.sql import func
from database import Base


class Question(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, index=True)
    category = Column(String, nullable=False)      # Java后端/前端/计算机基础
    subcategory = Column(String, nullable=False)   # JVM/并发编程/MySQL...
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=False)
    type = Column(String, nullable=False)          # choice/essay/follow_up
    difficulty = Column(String, nullable=False)    # easy/medium/hard
    options = Column(JSON, nullable=True)          # 选择题选项
    correct_option = Column(String, nullable=True) # 正确选项 A/B/C/D
    follow_up_ids = Column(JSON, nullable=True)    # 追问题 id 列表
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # NULL=系统题；非空=用户自建题
    created_at = Column(DateTime, server_default=func.now())


class AnswerRecord(Base):
    __tablename__ = "answer_records"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    question_id = Column(Integer, ForeignKey("questions.id"), nullable=False)
    user_answer = Column(Text, nullable=False)
    ai_score = Column(Float, nullable=True)
    ai_feedback = Column(JSON, nullable=True)
    is_correct = Column(Integer, nullable=True)    # 1/0 for choice
    created_at = Column(DateTime, server_default=func.now())


class MistakeBook(Base):
    __tablename__ = "mistake_book"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    source_type = Column(String, nullable=False)   # question/algorithm
    source_id = Column(Integer, nullable=False)
    next_review_date = Column(DateTime, nullable=True)
    review_count = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())


class QuestionMastery(Base):
    __tablename__ = "question_mastery"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    question_id = Column(Integer, ForeignKey("questions.id"), nullable=False)
    mastery = Column(String, nullable=False)   # mastered / fuzzy / unknown
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (UniqueConstraint("user_id", "question_id", name="uq_user_question_mastery"),)
