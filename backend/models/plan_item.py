from sqlalchemy import Column, Integer, String, Text, Boolean, ForeignKey, DateTime
from sqlalchemy.sql import func
from database import Base


class UserPlanItem(Base):
    """用户学习计划条目（可编辑、可排序）"""
    __tablename__ = "user_plan_items"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    item_type = Column(String, nullable=False, default="custom")  # question_set / algorithm / custom
    ref_id = Column(Integer, nullable=True)   # question_set_id or problem_list_id
    is_done = Column(Boolean, default=False, nullable=False)
    order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, server_default=func.now())
