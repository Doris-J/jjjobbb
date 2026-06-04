from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models.user import User
from models.question import Question, AnswerRecord, QuestionMastery
from models.question_set import QuestionSet, QuestionSetItem, UserActiveSet
from services.auth_service import get_admin_user
from md_parser import load_all_md_questions

router = APIRouter(prefix="/api/admin", tags=["管理员"])

DATA_DIR = (Path(__file__).parent.parent / "data").resolve()


def safe_path(category: str, filename: str) -> Path:
    p = (DATA_DIR / category / filename).resolve()
    if not str(p).startswith(str(DATA_DIR)):
        raise HTTPException(status_code=400, detail="非法路径")
    if p.suffix != ".md":
        raise HTTPException(status_code=400, detail="只支持 .md 文件")
    return p


@router.get("/files")
def list_files(current_user: User = Depends(get_admin_user)):
    """列出所有分类和文件"""
    result = {}
    for cat_dir in sorted(DATA_DIR.iterdir()):
        if cat_dir.is_dir():
            files = sorted([f.name for f in cat_dir.iterdir() if f.suffix == ".md"])
            if files:
                result[cat_dir.name] = files
    return result


@router.get("/files/{category}/{filename}")
def get_file(category: str, filename: str, current_user: User = Depends(get_admin_user)):
    """获取文件原始内容"""
    path = safe_path(category, filename)
    if not path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    return {"content": path.read_text(encoding="utf-8")}


class FileContent(BaseModel):
    content: str


@router.put("/files/{category}/{filename}")
def save_file(
    category: str,
    filename: str,
    data: FileContent,
    current_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """保存文件内容并全量重导入题库"""
    path = safe_path(category, filename)
    if not path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")

    # 写入磁盘
    path.write_text(data.content, encoding="utf-8")

    # 全量重导入（只清除系统题目，保留用户自建题目）
    sys_q_ids = db.query(Question.id).filter(Question.user_id == None).subquery()  # noqa: E711
    db.query(QuestionMastery).filter(QuestionMastery.question_id.in_(sys_q_ids)).delete(synchronize_session=False)
    db.query(AnswerRecord).filter(AnswerRecord.question_id.in_(sys_q_ids)).delete(synchronize_session=False)
    db.query(Question).filter(Question.user_id == None).delete(synchronize_session=False)  # noqa: E711
    # 清空系统题单内容（题目ID将失效）
    system_ids = [r[0] for r in db.query(QuestionSet.id).filter(QuestionSet.is_system == True).all()]  # noqa: E712
    if system_ids:
        db.query(QuestionSetItem).filter(QuestionSetItem.set_id.in_(system_ids)).delete(synchronize_session=False)
        db.query(UserActiveSet).filter(UserActiveSet.set_id.in_(system_ids)).delete(synchronize_session=False)
        db.query(QuestionSet).filter(QuestionSet.id.in_(system_ids)).delete(synchronize_session=False)
    db.query(Question).delete()
    db.commit()

    questions = load_all_md_questions(DATA_DIR)
    for q in questions:
        db.add(Question(**q))
    db.commit()

    # 重建系统题单（按 category + subcategory，每个 .md 文件一个题单）
    from sqlalchemy import distinct
    cat_subs = db.query(distinct(Question.category), Question.subcategory).order_by(Question.category, Question.subcategory).all()
    for cat, sub in cat_subs:
        qs = QuestionSet(name=sub, description=cat, is_system=True)
        db.add(qs)
        db.flush()
        for idx, q in enumerate(db.query(Question).filter(Question.category == cat, Question.subcategory == sub).order_by(Question.id).all()):
            db.add(QuestionSetItem(set_id=qs.id, question_id=q.id, order=idx))
    db.commit()

    return {"imported": len(questions)}


class MakeAdminRequest(BaseModel):
    email: str


@router.post("/make-admin")
def make_admin(data: MakeAdminRequest, db: Session = Depends(get_db)):
    """设置管理员（仅在无管理员时有效，用于初始化）"""
    existing = db.query(User).filter(User.is_admin == True).first()  # noqa: E712
    if existing:
        raise HTTPException(status_code=403, detail="已存在管理员，不可重复设置")
    user = db.query(User).filter(User.email == data.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    user.is_admin = True
    db.commit()
    return {"ok": True, "email": user.email}
