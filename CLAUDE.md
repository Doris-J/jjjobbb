# AI 面试备战助手 — 开发指南

## 项目概述

面向求职者的 AI 辅助备战工具，核心功能：
- **八股文**：结构化题库，支持浏览背诵、选择/简答/追问训练、掌握度标记
- **算法追踪**：题单管理、刷题记录、每日推荐、薄弱点分析
- **项目深挖**：录入项目经历、AI 分析亮点、WebSocket 模拟面试
- **学习计划**：今日任务聚合

---

## 技术栈

### 后端
- **Python 3.13** + **FastAPI** + **SQLAlchemy 2.0**
- 数据库：本地 SQLite / 生产 PostgreSQL（自动切换）
- 认证：JWT（7天有效期），python-jose
- 密码：bcrypt（直接使用，非 passlib）
- 目录：`backend/`，虚拟环境 `.venv/`

### 前端
- **Next.js 14**（App Router）+ **TypeScript**
- 样式：TailwindCSS
- UI 组件：**shadcn/ui（base-ui 版本）**
- HTTP：axios（封装在 `frontend/lib/api.ts`）
- 目录：`frontend/`

---

## 启动方式

```bash
# 后端
cd backend && .venv/bin/uvicorn main:app --reload
# 接口文档：http://localhost:8000/docs

# 前端
cd frontend && npm run dev
# 页面：http://localhost:3000
```

数据库初始化/重导入：
```bash
cd backend && .venv/bin/python seed.py
```

---

## 项目结构

```
backend/
├── main.py              # 入口，注册路由、CORS、启动时建表/补列
├── database.py          # DB 连接（SQLite↔PostgreSQL 自动切换）
├── seed.py              # 全量重导入题库（每次清空 Question + AnswerRecord）
├── md_parser.py         # Markdown 题库解析器
├── models/              # SQLAlchemy 模型
│   ├── user.py          # User（含 is_admin）
│   ├── question.py      # Question / AnswerRecord / MistakeBook / QuestionMastery
│   ├── algorithm.py     # ProblemList / UserProblemList / AlgorithmRecord
│   └── project.py       # Project / InterviewSession / ProjectConversation
├── schemas/             # Pydantic schemas（请求/响应）
├── routers/             # API 路由（每个模块一个文件）
│   ├── admin.py         # 管理员文件编辑 + 题库重导入
│   └── ...
├── services/
│   ├── auth_service.py  # get_current_user / get_admin_user / JWT 工具
│   └── ai_service.py    # AI 接口（当前 Mock，预留 DeepSeek）
└── data/                # 八股题库 Markdown 文件
    ├── Android/         # 7 个 .md 文件，171 题
    └── Java后端/        # 6 个 .md 文件

frontend/
├── app/
│   ├── (auth)/          # 登录 / 注册
│   └── (main)/          # 需登录页面（layout.tsx 做鉴权）
│       ├── layout.tsx   # 侧边栏（管理员显示 ⚙️ 题库管理）
│       ├── dashboard/
│       ├── projects/[id]/interview/  # WebSocket 面试
│       ├── questions/   # 八股文
│       ├── algorithm/
│       ├── plan/
│       └── admin/       # 管理员题库编辑器
├── lib/
│   ├── api.ts           # 所有接口封装（questionsApi / adminApi / algorithmApi...）
│   └── auth.ts          # token 读写（localStorage）
└── components/ui/       # shadcn/ui 组件
```

---

## 关键约束

### shadcn/ui（base-ui 版本）
- **不支持 `asChild` prop**，不要在任何组件上使用
- Select / Dialog / DropdownMenu 触发器直接用 className 样式，不用 `asChild`

### 后端路由顺序
- FastAPI 路由按定义顺序匹配，路径参数路由必须放在同前缀的具体路由**之后**
- 例：`/api/questions/mastery` 必须在 `GET /api/questions/{question_id}` 之前注册

### 数据库迁移
- 项目使用 `Base.metadata.create_all()` 建表，**不用 Alembic**
- 新增列在 `main.py` 启动时用 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` 补列

### 题库重导入
- `seed.py` 会删除所有 `AnswerRecord`、`QuestionMastery`、`Question` 后全量重插
- 管理员保存文件（PUT /api/admin/files/...）也会触发全量重导入，用户答题历史和掌握度会被清空

---

## 数据模型速查

```
users              id, email, hashed_password, username, is_admin, target_job, level...
questions          id, category, subcategory, question, answer, type, difficulty, options, correct_option
answer_records     id, user_id, question_id, user_answer, ai_score, ai_feedback
question_mastery   id, user_id, question_id, mastery(mastered/fuzzy/unknown)
mistake_book       id, user_id, source_type, source_id, next_review_date
problem_lists      id, name, source, total_count, problems(JSON)
user_problem_lists id, user_id, list_id
algorithm_records  id, user_id, leetcode_id, title, difficulty, tags(JSON), mastery, next_review_date
projects           id, user_id, name, tech_stack(JSON), analysis(JSON)...
interview_sessions id, project_id, user_id, mock_company, score, report(JSON)
```

---

## 八股题库 Markdown 格式

题库文件位于 `backend/data/{category}/{subcategory}.md`，由 `md_parser.py` 解析：

```markdown
### Q1：题目标题？                    → essay, medium（默认）
### Q1：题目标题？ [hard]             → essay, hard
### Q1：题目标题？ [easy]             → essay, easy
### Q1：题目标题？ [choice|easy]      → 选择题, easy

选择题选项格式（紧跟题目标题后）：
- A. 选项内容
- B. 选项内容 ✓   ← 正确答案打 ✓
- C. 选项内容
之后内容为答案说明文本
```

`#`、`##` 标题行会被忽略（仅作文档结构，不生成题目）。

---

## 管理员功能

- 通过 `POST /api/admin/make-admin {"email": "xxx"}` 初始化首个管理员（无管理员时才生效）
- 管理员登录后侧边栏显示 **⚙️ 题库管理**，可在线编辑 Markdown 文件并自动重导入
- `get_admin_user` 依赖在 `backend/services/auth_service.py`，非管理员返回 403

---

## 常用开发任务

### 新增 API 路由
1. 在 `backend/routers/` 新建或修改路由文件
2. 在 `main.py` `include_router()`
3. 在 `frontend/lib/api.ts` 对应 `xxxApi` 对象中添加方法

### 新增数据库表
1. 在 `backend/models/` 新建 Model 类（继承 Base）
2. 在 `backend/models/__init__.py` 导出
3. 在 `main.py` 的 `create_all()` 之前确保 import 已加载

### 新增前端页面
- 在 `frontend/app/(main)/` 下新建目录 + `page.tsx`
- 需要登录则放在 `(main)/` 下（layout 自动鉴权）
- 在 `layout.tsx` 的侧边栏 `NAV_ITEMS` 或条件渲染处添加导航入口

---

## AI 服务（当前 Mock）

`backend/services/ai_service.py` 中所有方法均为 Mock 实现，返回固定格式数据。
接入 DeepSeek 时替换对应方法体，接口签名保持不变：
- `grade_answer(question, user_answer, reference) → {score, correct_points, missing_points, reference_answer}`
- `interview_reply(history, project) → str`
- `generate_follow_up(question, user_answer) → str`
- `analyze_project(project) → dict`
