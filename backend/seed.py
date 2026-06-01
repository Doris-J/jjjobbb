"""数据库初始化脚本：建表 + 导入种子数据"""
import json
from pathlib import Path
from database import engine, SessionLocal, Base
import models  # 触发所有模型注册
from models.question import Question, AnswerRecord
from models.algorithm import ProblemList


def seed():
    # 建表
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    # 导入八股题库（每次全量更新）
    db.query(AnswerRecord).delete()
    db.query(Question).delete()
    db.commit()
    questions_path = Path(__file__).parent / "data" / "questions.json"
    questions = json.loads(questions_path.read_text(encoding="utf-8"))
    for q in questions:
        db.add(Question(**q))
    db.commit()
    print(f"✅ 导入 {len(questions)} 道八股题")

    # 导入算法题单（每次全量更新）
    db.query(ProblemList).delete()
    db.commit()
    lists_path = Path(__file__).parent / "data" / "problem_lists.json"
    lists = json.loads(lists_path.read_text(encoding="utf-8"))
    for lst in lists:
        db.add(ProblemList(**lst))
    db.commit()
    print(f"✅ 导入 {len(lists)} 套题单")

    db.close()
    print("🎉 数据库初始化完成")


if __name__ == "__main__":
    seed()
