from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models.user import User
from models.note import UserNote
from services.auth_service import get_current_user

router = APIRouter(prefix="/api/notes", tags=["笔记"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class NoteCreate(BaseModel):
    title: str = "未命名页面"
    parent_id: Optional[int] = None
    content: str = ""


class NoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    order: Optional[int] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _build_tree(nodes: list[UserNote]) -> list[dict]:
    """将平铺列表组装为嵌套树（id → children）"""
    id_map: dict[int, dict] = {}
    for n in nodes:
        id_map[n.id] = {
            "id": n.id,
            "parent_id": n.parent_id,
            "title": n.title,
            "order": n.order,
            "children": [],
        }
    roots = []
    for n in nodes:
        node = id_map[n.id]
        if n.parent_id and n.parent_id in id_map:
            id_map[n.parent_id]["children"].append(node)
        else:
            roots.append(node)
    # 按 order 排序每一层
    def sort_children(node):
        node["children"].sort(key=lambda x: x["order"])
        for child in node["children"]:
            sort_children(child)
    roots.sort(key=lambda x: x["order"])
    for root in roots:
        sort_children(root)
    return roots


def _delete_recursive(note_id: int, db: Session):
    """递归删除笔记及所有子孙"""
    children = db.query(UserNote).filter(UserNote.parent_id == note_id).all()
    for child in children:
        _delete_recursive(child.id, db)
    db.query(UserNote).filter(UserNote.id == note_id).delete()


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("")
def list_notes(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """返回用户所有笔记的树结构（不含 content）"""
    notes = (
        db.query(UserNote)
        .filter(UserNote.user_id == current_user.id)
        .order_by(UserNote.order)
        .all()
    )
    return _build_tree(notes)


@router.post("")
def create_note(
    data: NoteCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """创建笔记（parent_id=None 为根页面）"""
    if data.parent_id:
        parent = db.query(UserNote).filter(
            UserNote.id == data.parent_id,
            UserNote.user_id == current_user.id,
        ).first()
        if not parent:
            raise HTTPException(status_code=404, detail="父页面不存在")

    # order = 同级当前最大 + 1
    sibling_count = db.query(UserNote).filter(
        UserNote.user_id == current_user.id,
        UserNote.parent_id == data.parent_id,
    ).count()

    note = UserNote(
        user_id=current_user.id,
        parent_id=data.parent_id,
        title=data.title,
        content=data.content,
        order=sibling_count,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return {"id": note.id, "title": note.title, "parent_id": note.parent_id, "order": note.order, "children": []}


@router.get("/{note_id}")
def get_note(
    note_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取单篇笔记完整内容"""
    note = db.query(UserNote).filter(
        UserNote.id == note_id,
        UserNote.user_id == current_user.id,
    ).first()
    if not note:
        raise HTTPException(status_code=404, detail="笔记不存在")
    return {
        "id": note.id,
        "parent_id": note.parent_id,
        "title": note.title,
        "content": note.content,
        "order": note.order,
        "created_at": note.created_at,
        "updated_at": note.updated_at,
    }


@router.put("/{note_id}")
def update_note(
    note_id: int,
    data: NoteUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """更新笔记标题 / 内容 / 排序"""
    note = db.query(UserNote).filter(
        UserNote.id == note_id,
        UserNote.user_id == current_user.id,
    ).first()
    if not note:
        raise HTTPException(status_code=404, detail="笔记不存在")
    if data.title is not None:
        note.title = data.title
    if data.content is not None:
        note.content = data.content
    if data.order is not None:
        note.order = data.order
    db.commit()
    return {"ok": True}


@router.delete("/{note_id}")
def delete_note(
    note_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """删除笔记及其所有子孙页面"""
    note = db.query(UserNote).filter(
        UserNote.id == note_id,
        UserNote.user_id == current_user.id,
    ).first()
    if not note:
        raise HTTPException(status_code=404, detail="笔记不存在")
    _delete_recursive(note_id, db)
    db.commit()
    return {"ok": True}
