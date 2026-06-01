from datetime import date, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models.user import User
from models.project import Project, InterviewSession
from models.question import AnswerRecord
from models.algorithm import AlgorithmRecord, UserProblemList, ProblemList
from services.auth_service import get_current_user

router = APIRouter(prefix="/api/dashboard", tags=["数据中心"])


@router.get("")
def get_dashboard(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # 距离面试天数
    days_left = None
    if current_user.interview_date:
        days_left = (current_user.interview_date - date.today()).days

    # 算法进度
    user_list = db.query(UserProblemList).filter(UserProblemList.user_id == current_user.id).first()
    algo_total, algo_done = 0, 0
    list_name = None
    if user_list:
        problem_list = db.query(ProblemList).filter(ProblemList.id == user_list.list_id).first()
        if problem_list:
            algo_total = problem_list.total_count
            list_name = problem_list.name
            done_ids = {r.leetcode_id for r in db.query(AlgorithmRecord).filter(
                AlgorithmRecord.user_id == current_user.id,
                AlgorithmRecord.mastery == "mastered",
            ).all()}
            algo_done = sum(1 for p in (problem_list.problems or []) if p["leetcode_id"] in done_ids)

    # 八股文进度（答题记录中得分>=70的题数）
    q_done = db.query(AnswerRecord).filter(
        AnswerRecord.user_id == current_user.id,
        AnswerRecord.ai_score >= 70,
    ).count()

    # 项目演练进度
    sessions_count = db.query(InterviewSession).filter(
        InterviewSession.user_id == current_user.id
    ).count()

    # 连续打卡天数（简化：统计最近连续有答题记录的天数）
    streak = _calc_streak(current_user.id, db)

    # 薄弱知识点（八股文错题分类）
    weak_categories = _get_weak_categories(current_user.id, db)

    return {
        "days_left": days_left,
        "interview_date": current_user.interview_date,
        "algorithm": {
            "list_name": list_name,
            "done": algo_done,
            "total": algo_total,
            "pct": round(algo_done / algo_total * 100, 1) if algo_total else 0,
        },
        "questions": {
            "done": q_done,
        },
        "project": {
            "sessions": sessions_count,
        },
        "streak": streak,
        "weak_categories": weak_categories,
    }


def _calc_streak(user_id: int, db: Session) -> int:
    today = date.today()
    streak = 0
    for i in range(30):
        day = today - timedelta(days=i)
        has_activity = db.query(AnswerRecord).filter(
            AnswerRecord.user_id == user_id,
        ).first() is not None
        if has_activity and i == 0:
            streak = 1
        elif has_activity:
            streak += 1
        else:
            break
    return streak


def _get_weak_categories(user_id: int, db: Session) -> list:
    from models.question import Question, MistakeBook
    from sqlalchemy import func
    mistakes = db.query(MistakeBook).filter(
        MistakeBook.user_id == user_id,
        MistakeBook.source_type == "question",
    ).all()
    cat_counts: dict = {}
    for m in mistakes:
        q = db.query(Question).filter(Question.id == m.source_id).first()
        if q:
            cat_counts[q.subcategory] = cat_counts.get(q.subcategory, 0) + 1
    return [{"category": k, "count": v} for k, v in sorted(cat_counts.items(), key=lambda x: x[1], reverse=True)[:5]]
