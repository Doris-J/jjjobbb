"""数据库初始化脚本：建表 + 导入种子数据"""
import json
from pathlib import Path
from database import engine, SessionLocal, Base
import models  # 触发所有模型注册
from models.question import Question, AnswerRecord, QuestionMastery
from models.algorithm import ProblemList
from models.question_set import QuestionSet, QuestionSetItem, UserActiveSet
from md_parser import load_all_md_questions


def seed():
    # 建表
    Base.metadata.create_all(bind=engine)

    # 迁移：questions 表新增 user_id 列（兼容已有数据库）
    from sqlalchemy import text, inspect as sa_inspect
    _qcols = [c["name"] for c in sa_inspect(engine).get_columns("questions")]
    if "user_id" not in _qcols:
        with engine.connect() as _conn:
            _conn.execute(text("ALTER TABLE questions ADD COLUMN user_id INTEGER REFERENCES users(id)"))
            _conn.commit()
        print("✅ 迁移：questions.user_id 列已添加")

    db = SessionLocal()

    # 导入八股题库（每次全量更新，只清除系统题目，保留用户自建题目）
    sys_q_ids = db.query(Question.id).filter(Question.user_id == None).subquery()  # noqa: E711
    db.query(QuestionMastery).filter(QuestionMastery.question_id.in_(sys_q_ids)).delete(synchronize_session=False)
    db.query(AnswerRecord).filter(AnswerRecord.question_id.in_(sys_q_ids)).delete(synchronize_session=False)
    db.query(Question).filter(Question.user_id == None).delete(synchronize_session=False)  # noqa: E711
    db.commit()

    data_dir = Path(__file__).parent / "data"

    print("📂 扫描 Markdown 题库文件：")
    all_questions = load_all_md_questions(data_dir)

    for q in all_questions:
        db.add(Question(**q))
    db.commit()
    print(f"✅ 共导入 {len(all_questions)} 道八股题")

    # 重建系统题单（按 category+subcategory 分组）
    # 先保存用户激活记录（set_name → [user_id]），之后按名恢复
    old_sys_sets = db.query(QuestionSet).filter(QuestionSet.is_system == True).all()  # noqa: E712
    system_set_ids = [s.id for s in old_sys_sets]
    active_by_name: dict[str, list[int]] = {}   # {set_name: [user_id, ...]}
    if system_set_ids:
        for ua in db.query(UserActiveSet).filter(UserActiveSet.set_id.in_(system_set_ids)).all():
            name = next((s.name for s in old_sys_sets if s.id == ua.set_id), None)
            if name:
                active_by_name.setdefault(name, []).append(ua.user_id)
        db.query(QuestionSetItem).filter(QuestionSetItem.set_id.in_(system_set_ids)).delete(synchronize_session=False)
        db.query(UserActiveSet).filter(UserActiveSet.set_id.in_(system_set_ids)).delete(synchronize_session=False)
        db.query(QuestionSet).filter(QuestionSet.id.in_(system_set_ids)).delete(synchronize_session=False)
    db.commit()

    from sqlalchemy import distinct
    cat_subs = db.query(distinct(Question.category), Question.subcategory).order_by(Question.category, Question.subcategory).all()
    count = 0
    for cat, sub in cat_subs:
        qs = QuestionSet(name=sub, description=f"{cat}", is_system=True)
        db.add(qs)
        db.flush()
        questions_in_sub = db.query(Question).filter(
            Question.category == cat, Question.subcategory == sub
        ).order_by(Question.id).all()
        for idx, q in enumerate(questions_in_sub):
            db.add(QuestionSetItem(set_id=qs.id, question_id=q.id, order=idx))
        # 恢复该题单的用户激活记录
        for uid in active_by_name.get(sub, []):
            db.add(UserActiveSet(user_id=uid, set_id=qs.id))
        print(f"  📚 [{cat}] {sub}：{len(questions_in_sub)} 题")
        count += 1
    db.commit()
    print(f"✅ 创建 {count} 个系统题单（已恢复用户激活记录）")

    # 导入算法题单（upsert by name，保留用户已选记录）
    lists_path = data_dir / "problem_lists.json"
    lists = json.loads(lists_path.read_text(encoding="utf-8"))
    new_names = {lst["name"] for lst in lists}
    existing = {pl.name: pl for pl in db.query(ProblemList).all()}
    for lst in lists:
        if lst["name"] in existing:
            pl = existing[lst["name"]]
            pl.source = lst["source"]
            pl.total_count = lst["total_count"]
            pl.problems = lst["problems"]
        else:
            db.add(ProblemList(**lst))
    # 删除 JSON 中已不存在的题单（先删关联）
    from models.algorithm import UserProblemList
    for name, pl in existing.items():
        if name not in new_names:
            db.query(UserProblemList).filter(UserProblemList.list_id == pl.id).delete()
            db.delete(pl)
    db.commit()
    print(f"✅ 同步 {len(lists)} 套算法题单")

    db.close()
    print("🎉 数据库初始化完成")


if __name__ == "__main__":
    seed()
