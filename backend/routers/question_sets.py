from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models.user import User
from models.question import Question, QuestionMastery, AnswerRecord
from models.question_set import QuestionSet, QuestionSetItem, UserActiveSet
from services.auth_service import get_current_user, get_admin_user
from md_parser import parse_md_content

router = APIRouter(prefix="/api/question-sets", tags=["题单"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class QuestionSetCreate(BaseModel):
    name: str
    description: Optional[str] = None


class QuestionSetUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class QuestionSetItemAdd(BaseModel):
    question_id: int
    order: Optional[int] = None


class SystemSetCreate(BaseModel):
    name: str
    description: Optional[str] = None
    question_ids: List[int] = []


class MdContent(BaseModel):
    content: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _set_out(qs: QuestionSet, db: Session, user_id: int, include_questions: bool = False):
    items = (
        db.query(QuestionSetItem)
        .filter(QuestionSetItem.set_id == qs.id)
        .order_by(QuestionSetItem.order)
        .all()
    )
    question_ids = [i.question_id for i in items]
    total = len(question_ids)

    mastered = 0
    if total and user_id:
        mastered = db.query(QuestionMastery).filter(
            QuestionMastery.user_id == user_id,
            QuestionMastery.question_id.in_(question_ids),
            QuestionMastery.mastery == "mastered",
        ).count()

    out = {
        "id": qs.id,
        "name": qs.name,
        "description": qs.description,
        "is_system": qs.is_system,
        "user_id": qs.user_id,
        "total_count": total,
        "mastered_count": mastered,
    }
    if include_questions:
        q_rows = (
            db.query(Question)
            .filter(Question.id.in_(question_ids))
            .all()
        ) if question_ids else []
        q_map = {q.id: q for q in q_rows}
        out["questions"] = [
            {
                "id": q_map[qid].id,
                "question": q_map[qid].question,
                "type": q_map[qid].type,
                "difficulty": q_map[qid].difficulty,
                "category": q_map[qid].category,
                "subcategory": q_map[qid].subcategory,
                "order": items[idx].order,
            }
            for idx, qid in enumerate(question_ids)
            if qid in q_map
        ]
    return out


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("")
def list_sets(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """返回系统题单 + 当前用户自建题单（批量查询，避免 N+1）"""
    all_sets = (
        db.query(QuestionSet)
        .filter(
            (QuestionSet.is_system == True) |  # noqa: E712
            ((QuestionSet.is_system == False) & (QuestionSet.user_id == current_user.id))  # noqa: E712
        )
        .all()
    )
    set_ids = [qs.id for qs in all_sets]
    if not set_ids:
        return []

    # 批量获取所有题单的题目 ID 列表
    all_items = db.query(QuestionSetItem.set_id, QuestionSetItem.question_id)\
        .filter(QuestionSetItem.set_id.in_(set_ids)).all()
    items_by_set: dict[int, list[int]] = {}
    for sid, qid in all_items:
        items_by_set.setdefault(sid, []).append(qid)

    # 批量获取用户掌握度（只取 mastered）
    all_q_ids = [qid for qids in items_by_set.values() for qid in qids]
    mastered_ids: set[int] = set()
    if all_q_ids:
        mastered_ids = {
            r.question_id for r in
            db.query(QuestionMastery.question_id)
            .filter(
                QuestionMastery.user_id == current_user.id,
                QuestionMastery.question_id.in_(all_q_ids),
                QuestionMastery.mastery == "mastered",
            ).all()
        }

    # 批量获取激活状态
    active_ids = {
        r.set_id for r in
        db.query(UserActiveSet.set_id)
        .filter(UserActiveSet.user_id == current_user.id).all()
    }

    result = []
    for qs in all_sets:
        q_ids = items_by_set.get(qs.id, [])
        result.append({
            "id": qs.id,
            "name": qs.name,
            "description": qs.description,
            "is_system": qs.is_system,
            "user_id": qs.user_id,
            "total_count": len(q_ids),
            "mastered_count": sum(1 for qid in q_ids if qid in mastered_ids),
            "is_active": qs.id in active_ids,
        })
    return result


@router.get("/active")
def get_active(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """返回所有激活题单的列表（含题目）"""
    actives = db.query(UserActiveSet).filter(UserActiveSet.user_id == current_user.id).all()
    if not actives:
        return []
    results = []
    for a in actives:
        qs = db.query(QuestionSet).filter(QuestionSet.id == a.set_id).first()
        if qs:
            results.append(_set_out(qs, db, current_user.id, include_questions=True))
    return results


@router.post("/select")
def toggle_set(
    set_id: int = Query(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """切换题单激活状态（已激活则取消，未激活则添加）"""
    qs = db.query(QuestionSet).filter(QuestionSet.id == set_id).first()
    if not qs:
        raise HTTPException(status_code=404, detail="题单不存在")
    if not qs.is_system and qs.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权访问该题单")

    existing = db.query(UserActiveSet).filter(
        UserActiveSet.user_id == current_user.id,
        UserActiveSet.set_id == set_id,
    ).first()
    if existing:
        db.delete(existing)
        db.commit()
        return {"ok": True, "active": False}
    else:
        db.add(UserActiveSet(user_id=current_user.id, set_id=set_id))
        db.commit()
        return {"ok": True, "active": True}


@router.post("")
def create_set(
    data: QuestionSetCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """用户创建自定义题单"""
    qs = QuestionSet(
        name=data.name,
        description=data.description,
        is_system=False,
        user_id=current_user.id,
    )
    db.add(qs)
    db.commit()
    db.refresh(qs)
    return _set_out(qs, db, current_user.id)


@router.get("/{set_id}")
def get_set(
    set_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    qs = db.query(QuestionSet).filter(QuestionSet.id == set_id).first()
    if not qs:
        raise HTTPException(status_code=404, detail="题单不存在")
    if not qs.is_system and qs.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权访问该题单")
    return _set_out(qs, db, current_user.id, include_questions=True)


@router.put("/{set_id}")
def update_set(
    set_id: int,
    data: QuestionSetUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    qs = db.query(QuestionSet).filter(QuestionSet.id == set_id).first()
    if not qs:
        raise HTTPException(status_code=404, detail="题单不存在")
    if qs.is_system:
        raise HTTPException(status_code=403, detail="系统题单请通过管理员界面修改")
    if qs.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权修改该题单")
    if data.name is not None:
        qs.name = data.name
    if data.description is not None:
        qs.description = data.description
    db.commit()
    return _set_out(qs, db, current_user.id)


@router.delete("/{set_id}")
def delete_set(
    set_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    qs = db.query(QuestionSet).filter(QuestionSet.id == set_id).first()
    if not qs:
        raise HTTPException(status_code=404, detail="题单不存在")
    if qs.is_system:
        raise HTTPException(status_code=403, detail="系统题单请通过管理员界面删除")
    if qs.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权删除该题单")
    db.query(QuestionSetItem).filter(QuestionSetItem.set_id == set_id).delete()
    db.query(UserActiveSet).filter(
        UserActiveSet.user_id == current_user.id,
        UserActiveSet.set_id == set_id,
    ).delete()
    db.delete(qs)
    db.commit()
    return {"ok": True}


@router.post("/{set_id}/items")
def add_item(
    set_id: int,
    data: QuestionSetItemAdd,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    qs = db.query(QuestionSet).filter(QuestionSet.id == set_id).first()
    if not qs:
        raise HTTPException(status_code=404, detail="题单不存在")
    if qs.is_system:
        raise HTTPException(status_code=403, detail="系统题单通过管理员界面修改")
    if qs.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权修改该题单")
    q = db.query(Question).filter(Question.id == data.question_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="题目不存在")
    existing = db.query(QuestionSetItem).filter(
        QuestionSetItem.set_id == set_id,
        QuestionSetItem.question_id == data.question_id,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="题目已在题单中")
    # default order = current max + 1
    max_order = db.query(QuestionSetItem).filter(QuestionSetItem.set_id == set_id).count()
    item = QuestionSetItem(
        set_id=set_id,
        question_id=data.question_id,
        order=data.order if data.order is not None else max_order,
    )
    db.add(item)
    db.commit()
    return {"ok": True}


@router.delete("/{set_id}/items/{question_id}")
def remove_item(
    set_id: int,
    question_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    qs = db.query(QuestionSet).filter(QuestionSet.id == set_id).first()
    if not qs:
        raise HTTPException(status_code=404, detail="题单不存在")
    if qs.is_system:
        raise HTTPException(status_code=403, detail="系统题单通过管理员界面修改")
    if qs.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权修改该题单")
    db.query(QuestionSetItem).filter(
        QuestionSetItem.set_id == set_id,
        QuestionSetItem.question_id == question_id,
    ).delete()
    db.commit()
    return {"ok": True}


# ── 用户题单 Markdown 导入/导出 ────────────────────────────────────────────────

def _require_user_set(set_id: int, current_user: User, db: Session) -> QuestionSet:
    qs = db.query(QuestionSet).filter(QuestionSet.id == set_id).first()
    if not qs:
        raise HTTPException(status_code=404, detail="题单不存在")
    if qs.is_system:
        raise HTTPException(status_code=403, detail="系统题单不支持此操作")
    if qs.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权访问该题单")
    return qs


def _import_md_content(set_id: int, content: str, qs: QuestionSet, current_user: User, db: Session) -> int:
    """全量替换题单内容：删除旧用户题目 + 插入新题目"""
    # 找到题单内属于当前用户的题目 ID
    existing_items = db.query(QuestionSetItem).filter(QuestionSetItem.set_id == set_id).all()
    existing_q_ids = [item.question_id for item in existing_items]
    user_q_ids = [
        qid for qid in existing_q_ids
        if db.query(Question.id).filter(Question.id == qid, Question.user_id == current_user.id).first()
    ]
    # 清空题单条目
    db.query(QuestionSetItem).filter(QuestionSetItem.set_id == set_id).delete()
    # 删除用户题目（连带 answer_records、mastery）
    if user_q_ids:
        db.query(QuestionMastery).filter(QuestionMastery.question_id.in_(user_q_ids)).delete(synchronize_session=False)
        db.query(AnswerRecord).filter(AnswerRecord.question_id.in_(user_q_ids)).delete(synchronize_session=False)
        db.query(Question).filter(Question.id.in_(user_q_ids)).delete(synchronize_session=False)
    db.commit()

    # 解析 Markdown → 插入新题目
    category = qs.description or "自定义"
    subcategory = qs.name
    questions = parse_md_content(content, category, subcategory)
    for idx, q in enumerate(questions):
        obj = Question(**q, user_id=current_user.id)
        db.add(obj)
        db.flush()
        db.add(QuestionSetItem(set_id=set_id, question_id=obj.id, order=idx))
    db.commit()
    return len(questions)


@router.get("/{set_id}/export-md")
def export_md(
    set_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """将题单内容导出为 Markdown 文本"""
    qs = _require_user_set(set_id, current_user, db)
    items = (
        db.query(QuestionSetItem)
        .filter(QuestionSetItem.set_id == set_id)
        .order_by(QuestionSetItem.order)
        .all()
    )
    if not items:
        return {"content": ""}
    q_ids = [i.question_id for i in items]
    q_map = {q.id: q for q in db.query(Question).filter(Question.id.in_(q_ids)).all()}
    lines = []
    for i, item in enumerate(items):
        q = q_map.get(item.question_id)
        if not q:
            continue
        tag_parts = []
        if q.type == "choice":
            tag_parts.append("choice")
        if q.difficulty != "medium":
            tag_parts.append(q.difficulty)
        tag = f" [{('|').join(tag_parts)}]" if tag_parts else ""
        lines.append(f"### Q{i + 1}：{q.question}{tag}\n")
        if q.type == "choice" and q.options:
            for opt in q.options:
                correct_mark = " ✓" if opt["key"] == q.correct_option else ""
                lines.append(f"- {opt['key']}. {opt['text']}{correct_mark}")
            lines.append("")
        lines.append(q.answer or "")
        lines.append("")
    return {"content": "\n".join(lines)}


@router.post("/{set_id}/import-md")
def import_md(
    set_id: int,
    data: MdContent,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """从 Markdown 文本全量导入题目（替换已有内容）"""
    qs = _require_user_set(set_id, current_user, db)
    count = _import_md_content(set_id, data.content, qs, current_user, db)
    return {"imported": count}


@router.post("/{set_id}/upload-md")
async def upload_md(
    set_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """上传 .md 文件全量导入题目（替换已有内容）"""
    if not file.filename or not file.filename.endswith(".md"):
        raise HTTPException(status_code=400, detail="只支持 .md 文件")
    qs = _require_user_set(set_id, current_user, db)
    raw = await file.read()
    content = raw.decode("utf-8")
    count = _import_md_content(set_id, content, qs, current_user, db)
    return {"imported": count}


# ── Admin endpoints ───────────────────────────────────────────────────────────

@router.post("/admin/sets")
def admin_create_set(
    data: SystemSetCreate,
    current_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """管理员创建系统题单（可批量附带题目ID）"""
    qs = QuestionSet(
        name=data.name,
        description=data.description,
        is_system=True,
        user_id=None,
    )
    db.add(qs)
    db.flush()
    for idx, qid in enumerate(data.question_ids):
        db.add(QuestionSetItem(set_id=qs.id, question_id=qid, order=idx))
    db.commit()
    db.refresh(qs)
    return _set_out(qs, db, current_user.id, include_questions=True)


@router.put("/admin/sets/{set_id}")
def admin_update_set(
    set_id: int,
    data: QuestionSetUpdate,
    current_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    qs = db.query(QuestionSet).filter(QuestionSet.id == set_id, QuestionSet.is_system == True).first()  # noqa: E712
    if not qs:
        raise HTTPException(status_code=404, detail="系统题单不存在")
    if data.name is not None:
        qs.name = data.name
    if data.description is not None:
        qs.description = data.description
    db.commit()
    return _set_out(qs, db, current_user.id)


@router.delete("/admin/sets/{set_id}")
def admin_delete_set(
    set_id: int,
    current_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    qs = db.query(QuestionSet).filter(QuestionSet.id == set_id, QuestionSet.is_system == True).first()  # noqa: E712
    if not qs:
        raise HTTPException(status_code=404, detail="系统题单不存在")
    db.query(QuestionSetItem).filter(QuestionSetItem.set_id == set_id).delete()
    db.query(UserActiveSet).filter(UserActiveSet.set_id == set_id).delete()
    db.delete(qs)
    db.commit()
    return {"ok": True}


@router.post("/admin/sets/{set_id}/items")
def admin_add_item(
    set_id: int,
    data: QuestionSetItemAdd,
    current_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    qs = db.query(QuestionSet).filter(QuestionSet.id == set_id, QuestionSet.is_system == True).first()  # noqa: E712
    if not qs:
        raise HTTPException(status_code=404, detail="系统题单不存在")
    q = db.query(Question).filter(Question.id == data.question_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="题目不存在")
    existing = db.query(QuestionSetItem).filter(
        QuestionSetItem.set_id == set_id,
        QuestionSetItem.question_id == data.question_id,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="题目已在题单中")
    max_order = db.query(QuestionSetItem).filter(QuestionSetItem.set_id == set_id).count()
    db.add(QuestionSetItem(
        set_id=set_id,
        question_id=data.question_id,
        order=data.order if data.order is not None else max_order,
    ))
    db.commit()
    return {"ok": True}


@router.delete("/admin/sets/{set_id}/items/{question_id}")
def admin_remove_item(
    set_id: int,
    question_id: int,
    current_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    qs = db.query(QuestionSet).filter(QuestionSet.id == set_id, QuestionSet.is_system == True).first()  # noqa: E712
    if not qs:
        raise HTTPException(status_code=404, detail="系统题单不存在")
    db.query(QuestionSetItem).filter(
        QuestionSetItem.set_id == set_id,
        QuestionSetItem.question_id == question_id,
    ).delete()
    db.commit()
    return {"ok": True}
