import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine
import models  # 注册所有模型
from models import *  # noqa
from routers import auth, projects, questions, algorithm, plan, dashboard

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


@app.get("/")
def root():
    return {"message": "AI 面试备战助手 API", "docs": "/docs"}
