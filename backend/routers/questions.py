from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database import get_db
from models.user import User
from models.question import Question, AnswerRecord, MistakeBook
from schemas.question import QuestionOut, AnswerSubmit, AnswerFeedback
from services.auth_service import get_current_user
from services.ai_service import ai_service

router = APIRouter(prefix="/api/questions", tags=["八股文"])


@router.get("", response_model=List[QuestionOut])
def list_questions(
    category: Optional[str] = Query(None),
    subcategory: Optional[str] = Query(None),
    type: Optional[str] = Query(None),
    difficulty: Optional[str] = Query(None),
    limit: int = Query(20, le=100),
    offset: int = Query(0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Question)
    if category:
        q = q.filter(Question.category == category)
    if subcategory:
        q = q.filter(Question.subcategory == subcategory)
    if type:
        q = q.filter(Question.type == type)
    if difficulty:
        q = q.filter(Question.difficulty == difficulty)
    questions = q.offset(offset).limit(limit).all()
    # 简答题不返回答案
    result = []
    for question in questions:
        item = QuestionOut.model_validate(question)
        if type != "choice":
            item.answer = None
            item.correct_option = None
        result.append(item)
    return result


@router.get("/categories")
def get_categories(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from sqlalchemy import distinct
    cats = db.query(distinct(Question.category)).all()
    result = {}
    for (cat,) in cats:
        subcats = db.query(distinct(Question.subcategory)).filter(Question.category == cat).all()
        result[cat] = [s[0] for s in subcats]
    return result


@router.get("/{question_id}", response_model=QuestionOut)
def get_question(
    question_id: int,
    reveal_answer: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    question = db.query(Question).filter(Question.id == question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="题目不存在")
    item = QuestionOut.model_validate(question)
    if not reveal_answer and question.type != "choice":
        item.answer = None
    return item


@router.post("/{question_id}/answer", response_model=AnswerFeedback)
def submit_answer(
    question_id: int,
    data: AnswerSubmit,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    question = db.query(Question).filter(Question.id == question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="题目不存在")

    if question.type == "choice":
        is_correct = data.user_answer.strip().upper() == question.correct_option
        feedback = AnswerFeedback(
            score=100.0 if is_correct else 0.0,
            correct_points=["回答正确"] if is_correct else [],
            missing_points=[] if is_correct else [f"正确答案是 {question.correct_option}"],
            reference_answer=question.answer,
        )
        record = AnswerRecord(
            user_id=current_user.id,
            question_id=question_id,
            user_answer=data.user_answer,
            ai_score=feedback.score,
            is_correct=1 if is_correct else 0,
        )
    else:
        result = ai_service.grade_answer(question.question, data.user_answer, question.answer)
        feedback = AnswerFeedback(
            score=result["score"],
            correct_points=result["correct_points"],
            missing_points=result["missing_points"],
            reference_answer=result["reference_answer"],
            next_follow_up_id=(question.follow_up_ids[0] if question.follow_up_ids else None),
        )
        record = AnswerRecord(
            user_id=current_user.id,
            question_id=question_id,
            user_answer=data.user_answer,
            ai_score=result["score"],
            ai_feedback=result,
        )

    db.add(record)

    # 加入错题本（得分低于 70 或答错选择题）
    if feedback.score < 70:
        existing = db.query(MistakeBook).filter(
            MistakeBook.user_id == current_user.id,
            MistakeBook.source_type == "question",
            MistakeBook.source_id == question_id,
        ).first()
        if not existing:
            mistake = MistakeBook(
                user_id=current_user.id,
                source_type="question",
                source_id=question_id,
                next_review_date=datetime.utcnow() + timedelta(days=1),
            )
            db.add(mistake)

    db.commit()
    return feedback


@router.post("/follow-up")
def get_follow_up(
    question_id: int,
    user_answer: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    question = db.query(Question).filter(Question.id == question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="题目不存在")
    follow_up = ai_service.generate_follow_up(question.question, user_answer)
    return {"follow_up": follow_up}


@router.get("/mistakes/list")
def get_mistakes(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    mistakes = db.query(MistakeBook).filter(
        MistakeBook.user_id == current_user.id,
        MistakeBook.source_type == "question",
    ).all()
    result = []
    for m in mistakes:
        q = db.query(Question).filter(Question.id == m.source_id).first()
        if q:
            result.append({
                "mistake_id": m.id,
                "question": QuestionOut.model_validate(q),
                "next_review_date": m.next_review_date,
                "review_count": m.review_count,
            })
    return result
