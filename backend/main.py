import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
import models  # 注册所有模型
from models import *  # noqa

Base.metadata.create_all(bind=engine)

# 兼容旧数据库：自动补充新增列
from sqlalchemy import text, inspect as sa_inspect
with engine.connect() as _conn:
    _cols = [c["name"] for c in sa_inspect(engine).get_columns("users")]
    if "is_admin" not in _cols:
        _conn.execute(text("ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT 0"))
        _conn.commit()

with engine.connect() as _conn:
    _qcols = [c["name"] for c in sa_inspect(engine).get_columns("questions")]
    if "user_id" not in _qcols:
        _conn.execute(text("ALTER TABLE questions ADD COLUMN user_id INTEGER REFERENCES users(id)"))
        _conn.commit()

# 迁移 user_active_sets：将 UNIQUE(user_id) 改为 UNIQUE(user_id, set_id)
_uas_constraints = sa_inspect(engine).get_unique_constraints("user_active_sets")
if any(c["column_names"] == ["user_id"] for c in _uas_constraints):
    with engine.connect() as _conn:
        _conn.execute(text("""
            CREATE TABLE user_active_sets_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id),
                set_id INTEGER NOT NULL REFERENCES question_sets(id),
                selected_at DATETIME DEFAULT (CURRENT_TIMESTAMP),
                UNIQUE (user_id, set_id)
            )
        """))
        _conn.execute(text(
            "INSERT OR IGNORE INTO user_active_sets_new (id, user_id, set_id, selected_at) "
            "SELECT id, user_id, set_id, selected_at FROM user_active_sets"
        ))
        _conn.execute(text("DROP TABLE user_active_sets"))
        _conn.execute(text("ALTER TABLE user_active_sets_new RENAME TO user_active_sets"))
        _conn.commit()

from routers import auth, projects, questions, algorithm, plan, dashboard, admin, question_sets

app = FastAPI(title="AI 面试备战助手 API", version="1.0.0")

# FRONTEND_URL 支持多个来源，逗号分隔，本地默认 localhost:3000
_origins_env = os.getenv("FRONTEND_URL", "http://localhost:3000")
origins = [o.strip() for o in _origins_env.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(questions.router)
app.include_router(algorithm.router)
app.include_router(plan.router)
app.include_router(dashboard.router)
app.include_router(admin.router)
app.include_router(question_sets.router)


@app.get("/")
def root():
    return {"message": "AI 面试备战助手 API", "docs": "/docs"}
