from sqlalchemy import Column, Integer, String, Text, Boolean, ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.sql import func
from database import Base


class QuestionSet(Base):
    """题单：系统题单（is_system=True, user_id=None）或用户自建题单"""
    __tablename__ = "question_sets"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    is_system = Column(Boolean, default=False, nullable=False)   # True = 管理员创建
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # None = 系统题单
    created_at = Column(DateTime, server_default=func.now())


class QuestionSetItem(Base):
    """题单中的题目，按 order 排序"""
    __tablename__ = "question_set_items"

    id = Column(Integer, primary_key=True, index=True)
    set_id = Column(Integer, ForeignKey("question_sets.id", ondelete="CASCADE"), nullable=False)
    question_id = Column(Integer, ForeignKey("questions.id", ondelete="CASCADE"), nullable=False)
    order = Column(Integer, nullable=False, default=0)

    __table_args__ = (
        UniqueConstraint("set_id", "question_id", name="uq_set_question"),
    )


class UserActiveSet(Base):
    """用户已激活的题单（可多选，每个 (user_id, set_id) 对唯一）"""
    __tablename__ = "user_active_sets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    set_id = Column(Integer, ForeignKey("question_sets.id"), nullable=False)
    selected_at = Column(DateTime, server_default=func.now())

    __table_args__ = (UniqueConstraint("user_id", "set_id", name="uq_user_active_set"),)
