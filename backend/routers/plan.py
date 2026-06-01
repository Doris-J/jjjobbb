from datetime import date, datetime
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models.user import User
from models.study_plan import StudyPlan
from models.algorithm import AlgorithmRecord
from models.question import AnswerRecord, MistakeBook
from schemas.study_plan import StudyPlanOut
from services.auth_service import get_current_user
from services.ai_service import ai_service

router = APIRouter(prefix="/api/plan", tags=["学习计划"])


@router.get("/today", response_model=StudyPlanOut)
def get_today_plan(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    today = date.today()
    plan = db.query(StudyPlan).filter(StudyPlan.user_id == current_user.id, StudyPlan.date == today).first()
    if plan:
        return plan

    # 获取薄弱标签
    weak_records = db.query(AlgorithmRecord).filter(
        AlgorithmRecord.user_id == current_user.id,
        AlgorithmRecord.mastery.in_(["fuzzy", "unknown"]),
    ).all()
    tag_counts: dict = {}
    for r in weak_records:
        for tag in (r.tags or []):
            tag_counts[tag] = tag_counts.get(tag, 0) + 1
    weak_tags = [t for t, _ in sorted(tag_counts.items(), key=lambda x: x[1], reverse=True)[:3]]

    tasks = ai_service.generate_study_plan(
        user_profile={"target_job": current_user.target_job, "level": current_user.level},
        weak_tags=weak_tags,
    )
    plan = StudyPlan(user_id=current_user.id, date=today, tasks=tasks)
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan
