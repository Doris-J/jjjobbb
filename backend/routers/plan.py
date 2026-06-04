import io
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models.user import User
from models.plan_item import UserPlanItem
from models.question_set import UserActiveSet, QuestionSet, QuestionSetItem
from models.question import Question, QuestionMastery
from models.algorithm import UserProblemList, ProblemList, AlgorithmRecord
from services.auth_service import get_current_user
from services.ai_service import ai_service

router = APIRouter(prefix="/api/plan", tags=["学习计划"])


# ── Today's plan ──────────────────────────────────────────────────────────────

@router.get("/today")
def get_today(
    algo_count: int = Query(3, ge=1, le=10),
    questions_count: int = Query(5, ge=1, le=20),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """今日学习计划：算法推荐 + 八股文推荐 + 自定义条目"""

    # ── 算法推荐 ──
    algo_result = {"list_name": None, "list_id": None, "items": []}
    user_list = db.query(UserProblemList).filter(UserProblemList.user_id == current_user.id).first()
    if user_list:
        problem_list = db.query(ProblemList).filter(ProblemList.id == user_list.list_id).first()
        if problem_list:
            algo_result["list_name"] = problem_list.name
            algo_result["list_id"] = problem_list.id
            done_ids = {r.leetcode_id for r in db.query(AlgorithmRecord).filter(
                AlgorithmRecord.user_id == current_user.id,
                AlgorithmRecord.mastery == "mastered",
            ).all()}
            # 优先复习到期（模糊/不会）
            review_due = db.query(AlgorithmRecord).filter(
                AlgorithmRecord.user_id == current_user.id,
                AlgorithmRecord.mastery.in_(["fuzzy", "unknown"]),
                AlgorithmRecord.next_review_date <= datetime.utcnow(),
            ).limit(algo_count).all()
            items = []
            for r in review_due:
                items.append({
                    "leetcode_id": r.leetcode_id, "title": r.title,
                    "difficulty": r.difficulty, "tags": r.tags or [],
                    "url": f"https://leetcode.cn/problems/{r.leetcode_id}/",
                    "reason": "复习巩固",
                })
            # 补足题单新题
            if len(items) < algo_count:
                done_and_review = done_ids | {r.leetcode_id for r in review_due}
                for p in (problem_list.problems or []):
                    if p["leetcode_id"] not in done_and_review:
                        items.append({
                            "leetcode_id": p["leetcode_id"], "title": p["title"],
                            "difficulty": p["difficulty"], "tags": p.get("tags", []),
                            "url": f"https://leetcode.cn/problems/{p.get('slug', p['leetcode_id'])}/",
                            "reason": "题单推进",
                        })
                        if len(items) >= algo_count:
                            break
            algo_result["items"] = items[:algo_count]

    # ── 八股推荐 ──
    q_result = {"set_name": None, "set_id": None, "items": []}
    actives = db.query(UserActiveSet).filter(UserActiveSet.user_id == current_user.id).all()
    if actives:
        active_set_ids = [a.set_id for a in actives]
        active_sets = db.query(QuestionSet).filter(QuestionSet.id.in_(active_set_ids)).all()
        set_name_map = {s.id: s.name for s in active_sets}
        q_result["set_name"] = "、".join(set_name_map.get(sid, "") for sid in active_set_ids)
        q_result["set_id"] = active_set_ids[0] if len(active_set_ids) == 1 else None

        # 合并所有题单题目（保持各题单内部顺序，去重）
        seen: set[int] = set()
        item_qids: list[int] = []
        for sid in active_set_ids:
            for (qid,) in db.query(QuestionSetItem.question_id)\
                    .filter(QuestionSetItem.set_id == sid)\
                    .order_by(QuestionSetItem.order).all():
                if qid not in seen:
                    seen.add(qid)
                    item_qids.append(qid)

        mastery_map = {
            r.question_id: r.mastery
            for r in db.query(QuestionMastery).filter(
                QuestionMastery.user_id == current_user.id,
                QuestionMastery.question_id.in_(item_qids),
            ).all()
        }
        # 优先顺序：unknown > fuzzy > 未标记 > mastered
        PRIORITY = {"unknown": 0, "fuzzy": 1, None: 2, "mastered": 3}
        sorted_qids = sorted(item_qids, key=lambda qid: PRIORITY.get(mastery_map.get(qid), 2))
        top_qids = sorted_qids[:questions_count]
        q_rows = {q.id: q for q in db.query(Question).filter(Question.id.in_(top_qids)).all()}
        q_result["items"] = [
            {
                "id": qid, "question": q_rows[qid].question,
                "type": q_rows[qid].type, "difficulty": q_rows[qid].difficulty,
                "mastery": mastery_map.get(qid),
            }
            for qid in top_qids if qid in q_rows
        ]

    # ── 自定义条目 ──
    custom = db.query(UserPlanItem).filter(
        UserPlanItem.user_id == current_user.id,
        UserPlanItem.is_done == False,  # noqa: E712
    ).order_by(UserPlanItem.order, UserPlanItem.id).all()

    return {
        "algo": algo_result,
        "questions": q_result,
        "custom_items": [
            {"id": c.id, "title": c.title, "description": c.description, "item_type": c.item_type}
            for c in custom
        ],
    }


# ── Schemas ───────────────────────────────────────────────────────────────────

class PlanItemCreate(BaseModel):
    title: str
    description: Optional[str] = None
    item_type: str = "custom"
    ref_id: Optional[int] = None


class PlanItemUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    is_done: Optional[bool] = None
    order: Optional[int] = None


class ReorderItem(BaseModel):
    id: int
    order: int


# ── Helpers ───────────────────────────────────────────────────────────────────

def _extract_text(filename: str, data: bytes) -> str:
    ext = filename.rsplit(".", 1)[-1].lower()
    if ext == "md":
        return data.decode("utf-8", errors="ignore")
    if ext == "pdf":
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(data))
        return "\n".join(p.extract_text() or "" for p in reader.pages)
    if ext in ("doc", "docx"):
        import docx as docx_lib
        doc = docx_lib.Document(io.BytesIO(data))
        return "\n".join(p.text for p in doc.paragraphs)
    raise HTTPException(status_code=400, detail="仅支持 .md / .pdf / .docx 格式")


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/items")
def list_items(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items = (
        db.query(UserPlanItem)
        .filter(UserPlanItem.user_id == current_user.id)
        .order_by(UserPlanItem.order, UserPlanItem.id)
        .all()
    )
    return [
        {
            "id": item.id,
            "title": item.title,
            "description": item.description,
            "item_type": item.item_type,
            "ref_id": item.ref_id,
            "is_done": item.is_done,
            "order": item.order,
        }
        for item in items
    ]


@router.post("/items")
def create_item(
    data: PlanItemCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    max_order = db.query(UserPlanItem).filter(UserPlanItem.user_id == current_user.id).count()
    item = UserPlanItem(
        user_id=current_user.id,
        title=data.title,
        description=data.description,
        item_type=data.item_type,
        ref_id=data.ref_id,
        order=max_order,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"id": item.id, "title": item.title, "description": item.description,
            "item_type": item.item_type, "ref_id": item.ref_id,
            "is_done": item.is_done, "order": item.order}


@router.put("/items/{item_id}")
def update_item(
    item_id: int,
    data: PlanItemUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = db.query(UserPlanItem).filter(
        UserPlanItem.id == item_id,
        UserPlanItem.user_id == current_user.id,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="条目不存在")
    if data.title is not None:
        item.title = data.title
    if data.description is not None:
        item.description = data.description
    if data.is_done is not None:
        item.is_done = data.is_done
    if data.order is not None:
        item.order = data.order
    db.commit()
    return {"ok": True}


@router.delete("/items/{item_id}")
def delete_item(
    item_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = db.query(UserPlanItem).filter(
        UserPlanItem.id == item_id,
        UserPlanItem.user_id == current_user.id,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="条目不存在")
    db.delete(item)
    db.commit()
    return {"ok": True}


@router.post("/items/reorder")
def reorder_items(
    items: List[ReorderItem],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    for entry in items:
        db.query(UserPlanItem).filter(
            UserPlanItem.id == entry.id,
            UserPlanItem.user_id == current_user.id,
        ).update({"order": entry.order})
    db.commit()
    return {"ok": True}


@router.post("/resume")
async def upload_resume(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """上传简历（.md/.pdf/.docx），AI 解析后生成初始学习计划条目"""
    raw = await file.read()
    text = _extract_text(file.filename or "", raw)
    generated = ai_service.generate_plan_items_from_resume(text)

    # 清空已有条目，重新生成
    db.query(UserPlanItem).filter(UserPlanItem.user_id == current_user.id).delete()
    for idx, g in enumerate(generated):
        db.add(UserPlanItem(
            user_id=current_user.id,
            title=g["title"],
            description=g.get("description"),
            item_type=g.get("item_type", "custom"),
            order=idx,
        ))
    db.commit()
    return {"generated": len(generated)}
