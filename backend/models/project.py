from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, JSON
from sqlalchemy.sql import func
from database import Base


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    start_date = Column(String, nullable=True)
    end_date = Column(String, nullable=True)
    role = Column(String, nullable=True)          # 主导/参与/独立完成
    team_size = Column(Integer, nullable=True)
    background = Column(Text, nullable=True)      # 业务背景
    tech_arch = Column(Text, nullable=True)       # 技术架构
    my_work = Column(Text, nullable=True)         # 你的工作
    highlights = Column(Text, nullable=True)      # 项目亮点
    difficulties = Column(Text, nullable=True)    # 遇到的难点
    tech_stack = Column(JSON, nullable=True)      # ["Java", "Redis", ...]
    project_type = Column(String, nullable=True)  # 高并发/大数据/算法
    analysis = Column(JSON, nullable=True)        # AI 分析结果缓存
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class InterviewSession(Base):
    __tablename__ = "interview_sessions"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    mock_company = Column(String, nullable=True)
    score = Column(Integer, nullable=True)
    report = Column(JSON, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    ended_at = Column(DateTime, nullable=True)


class ProjectConversation(Base):
    __tablename__ = "project_conversations"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("interview_sessions.id"), nullable=False)
    role = Column(String, nullable=False)   # "interviewer" | "user"
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
