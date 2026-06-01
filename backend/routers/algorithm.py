from datetime import datetime, timedelta
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models.user import User
from models.algorithm import ProblemList, UserProblemList, AlgorithmRecord
from schemas.algorithm import ProblemListOut, AlgorithmRecordCreate, AlgorithmRecordOut, DailyRecommendation
from services.auth_service import get_current_user

router = APIRouter(prefix="/api/algorithm", tags=["算法追踪"])


@router.get("/lists", response_model=List[ProblemListOut])
def get_problem_lists(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(ProblemList).all()


@router.post("/lists/select")
def select_problem_list(list_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not db.query(ProblemList).filter(ProblemList.id == list_id).first():
        raise HTTPException(status_code=404, detail="题单不存在")
    existing = db.query(UserProblemList).filter(UserProblemList.user_id == current_user.id).first()
    if existing:
        existing.list_id = list_id
    else:
        db.add(UserProblemList(user_id=current_user.id, list_id=list_id))
    db.commit()
    return {"ok": True}


@router.get("/lists/progress")
def get_progress(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user_list = db.query(UserProblemList).filter(UserProblemList.user_id == current_user.id).first()
    if not user_list:
        return {"selected": False}
    problem_list = db.query(ProblemList).filter(ProblemList.id == user_list.list_id).first()
    completed_ids = {
        r.leetcode_id for r in db.query(AlgorithmRecord).filter(
            AlgorithmRecord.user_id == current_user.id,
            AlgorithmRecord.mastery == "mastered",
        ).all()
    }
    problems = problem_list.problems or []
    completed = sum(1 for p in problems if p["leetcode_id"] in completed_ids)
    return {
        "selected": True,
        "list_id": problem_list.id,
        "list_name": problem_list.name,
        "total": problem_list.total_count,
        "completed": completed,
        "progress_pct": round(completed / problem_list.total_count * 100, 1) if problem_list.total_count else 0,
    }


@router.get("/daily", response_model=List[DailyRecommendation])
def get_daily_recommendations(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    recommendations = []
    user_list = db.query(UserProblemList).filter(UserProblemList.user_id == current_user.id).first()

    done_ids = {
        r.leetcode_id for r in db.query(AlgorithmRecord).filter(
            AlgorithmRecord.user_id == current_user.id
        ).all()
    }

    # 题单主线推进
    if user_list:
        problem_list = db.query(ProblemList).filter(ProblemList.id == user_list.list_id).first()
        if problem_list:
            for p in (problem_list.problems or []):
                if p["leetcode_id"] not in done_ids:
                    recommendations.append(DailyRecommendation(
                        leetcode_id=p["leetcode_id"],
                        title=p["title"],
                        difficulty=p["difficulty"],
                        tags=p.get("tags", []),
                        url=f"https://leetcode.cn/problems/{p.get('slug', p['title'])}/",
                        reason="题单主线推进",
                    ))
                    if len(recommendations) >= 2:
                        break

    # 复习到期（模糊/不会）
    now = datetime.utcnow()
    review_due = db.query(AlgorithmRecord).filter(
        AlgorithmRecord.user_id == current_user.id,
        AlgorithmRecord.mastery.in_(["fuzzy", "unknown"]),
        AlgorithmRecord.next_review_date <= now,
    ).limit(1).all()

    for r in review_due:
        recommendations.append(DailyRecommendation(
            leetcode_id=r.leetcode_id,
            title=r.title,
            difficulty=r.difficulty,
            tags=r.tags or [],
            url=f"https://leetcode.cn/problems/{r.leetcode_id}/",
            reason="复习巩固",
        ))

    # 补足到 3 道（从题单未做题中随机补）
    if user_list and len(recommendations) < 3:
        problem_list = db.query(ProblemList).filter(ProblemList.id == user_list.list_id).first()
        if problem_list:
            rec_ids = {r.leetcode_id for r in recommendations}
            for p in (problem_list.problems or []):
                if p["leetcode_id"] not in done_ids and p["leetcode_id"] not in rec_ids:
                    recommendations.append(DailyRecommendation(
                        leetcode_id=p["leetcode_id"],
                        title=p["title"],
                        difficulty=p["difficulty"],
                        tags=p.get("tags", []),
                        url=f"https://leetcode.cn/problems/{p.get('slug', p['title'])}/",
                        reason="题单推进",
                    ))
                    if len(recommendations) >= 3:
                        break

    return recommendations[:3]


@router.post("/record", response_model=AlgorithmRecordOut)
def record_problem(
    data: AlgorithmRecordCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # 复习间隔：mastered=7天, fuzzy=2天, unknown=1天
    review_days = {"mastered": 7, "fuzzy": 2, "unknown": 1}
    next_review = datetime.utcnow() + timedelta(days=review_days.get(data.mastery, 1))

    existing = db.query(AlgorithmRecord).filter(
        AlgorithmRecord.user_id == current_user.id,
        AlgorithmRecord.leetcode_id == data.leetcode_id,
    ).first()

    if existing:
        existing.mastery = data.mastery
        existing.next_review_date = next_review
        db.commit()
        db.refresh(existing)
        return existing

    record = AlgorithmRecord(
        **data.model_dump(),
        user_id=current_user.id,
        next_review_date=next_review,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.get("/weakness")
def get_weakness(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    records = db.query(AlgorithmRecord).filter(
        AlgorithmRecord.user_id == current_user.id,
        AlgorithmRecord.mastery.in_(["fuzzy", "unknown"]),
    ).all()
    tag_counts: dict = {}
    for r in records:
        for tag in (r.tags or []):
            tag_counts[tag] = tag_counts.get(tag, 0) + 1
    sorted_tags = sorted(tag_counts.items(), key=lambda x: x[1], reverse=True)
    return {"weak_tags": [{"tag": t, "count": c} for t, c in sorted_tags[:10]]}
