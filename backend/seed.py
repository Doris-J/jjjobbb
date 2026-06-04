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

    # 重建系统题单（按 category 分组）
    # 清空系统题单的关联（UserActiveSet 指向系统题单的也清掉）
    system_set_ids = [r[0] for r in db.query(QuestionSet.id).filter(QuestionSet.is_system == True).all()]  # noqa: E712
    if system_set_ids:
        db.query(QuestionSetItem).filter(QuestionSetItem.set_id.in_(system_set_ids)).delete(synchronize_session=False)
        db.query(UserActiveSet).filter(UserActiveSet.set_id.in_(system_set_ids)).delete(synchronize_session=False)
        db.query(QuestionSet).filter(QuestionSet.id.in_(system_set_ids)).delete(synchronize_session=False)
    db.commit()

    # 按 category + subcategory 分组创建系统题单（每个 .md 文件对应一个题单）
    from sqlalchemy import distinct, tuple_
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
        print(f"  📚 [{cat}] {sub}：{len(questions_in_sub)} 题")
        count += 1
    db.commit()
    print(f"✅ 创建 {count} 个系统题单")

    # 导入算法题单（每次全量更新）
    db.query(ProblemList).delete()
    db.commit()
    lists_path = data_dir / "problem_lists.json"
    lists = json.loads(lists_path.read_text(encoding="utf-8"))
    for lst in lists:
        db.add(ProblemList(**lst))
    db.commit()
    print(f"✅ 导入 {len(lists)} 套算法题单")

    db.close()
    print("🎉 数据库初始化完成")


if __name__ == "__main__":
    seed()
