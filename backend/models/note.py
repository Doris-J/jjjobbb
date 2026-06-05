from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime
from sqlalchemy.sql import func
from database import Base


class UserNote(Base):
    """用户学习笔记（树状结构，parent_id=NULL 为根页面）"""
    __tablename__ = "user_notes"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id"), nullable=False)
    parent_id  = Column(Integer, ForeignKey("user_notes.id"), nullable=True)
    title      = Column(String, nullable=False, default="未命名页面")
    content    = Column(Text, default="")
    order      = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
