# AI 面试备战助手 — 技术文档

## 目录

1. [系统架构](#一系统架构)
2. [技术选型](#二技术选型)
3. [项目结构](#三项目结构)
4. [数据库设计](#四数据库设计)
5. [API 文档](#五api-文档)
6. [核心模块说明](#六核心模块说明)
7. [本地开发](#七本地开发)
8. [生产部署](#八生产部署)
9. [环境变量](#九环境变量)

---

## 一、系统架构

```
┌─────────────────────────────────────────────┐
│  用户浏览器                                   │
│  Next.js 14 (Vercel)                         │
│  - App Router + React Server Components      │
│  - shadcn/ui (base-ui)                       │
└──────────────┬──────────────────────────────┘
               │ HTTP / WebSocket
┌──────────────▼──────────────────────────────┐
│  FastAPI 后端 (Render)                       │
│  - REST API（认证/项目/题库/算法/计划）       │
│  - WebSocket（实时面试对话）                  │
│  - Mock AI Service（预留 DeepSeek 接口）      │
└──────┬──────────────────────────────────────┘
       │ SQLAlchemy ORM
┌──────▼──────────────────────────────────────┐
│  PostgreSQL (Supabase)                       │
│  本地开发：SQLite                             │
└─────────────────────────────────────────────┘
```

---

## 二、技术选型

### 后端

| 技术 | 版本 | 用途 |
|------|------|------|
| Python | 3.13 | 运行环境 |
| FastAPI | 0.115 | Web 框架，原生支持 async / WebSocket |
| SQLAlchemy | 2.0 | ORM，兼容 SQLite 和 PostgreSQL |
| Pydantic | 2.x | 请求/响应数据校验 |
| python-jose | 3.3 | JWT 签发与验证 |
| passlib + bcrypt | - | 密码哈希 |
| uvicorn | 0.32 | ASGI 服务器 |
| psycopg2-binary | 2.9 | PostgreSQL 驱动 |

### 前端

| 技术 | 版本 | 用途 |
|------|------|------|
| Next.js | 14 | React 框架，App Router |
| TypeScript | 5.x | 类型安全 |
| TailwindCSS | 3.x | 样式 |
| shadcn/ui | latest | UI 组件库（基于 base-ui） |
| axios | - | HTTP 客户端 |
| WebSocket API | 原生 | 面试实时对话 |

### 基础设施

| 服务 | 用途 |
|------|------|
| GitHub | 代码托管 |
| Render | 后端部署（免费层） |
| Supabase | PostgreSQL 托管（免费 500MB） |
| Vercel | 前端部署（免费） |

---

## 三、项目结构

```
jjjobbb/
├── prd.md                      # 产品需求文档
├── TECHNICAL.md                # 本文档
├── render.yaml                 # Render 部署配置
├── .gitignore
│
├── backend/
│   ├── main.py                 # 入口，注册路由、CORS
│   ├── database.py             # 数据库连接（SQLite/PostgreSQL 自动切换）
│   ├── seed.py                 # 数据库初始化 + 种子数据
│   ├── Procfile                # Railway 启动配置（备用）
│   ├── requirements.txt
│   │
│   ├── models/                 # SQLAlchemy 数据模型
│   │   ├── user.py
│   │   ├── project.py          # Project / InterviewSession / ProjectConversation
│   │   ├── question.py         # Question / AnswerRecord / MistakeBook
│   │   ├── algorithm.py        # ProblemList / UserProblemList / AlgorithmRecord
│   │   └── study_plan.py
│   │
│   ├── schemas/                # Pydantic 请求/响应 Schema
│   │   ├── user.py
│   │   ├── project.py
│   │   ├── question.py
│   │   ├── algorithm.py
│   │   └── study_plan.py
│   │
│   ├── routers/                # API 路由
│   │   ├── auth.py             # 注册 / 登录 / 个人资料
│   │   ├── projects.py         # 项目 CRUD + AI 分析 + WebSocket 面试
│   │   ├── questions.py        # 八股题库 + 答题 + 错题本
│   │   ├── algorithm.py        # 题单 + 刷题记录 + 每日推荐
│   │   ├── plan.py             # 今日学习计划
│   │   └── dashboard.py        # 仪表盘数据
│   │
│   ├── services/
│   │   ├── auth_service.py     # JWT 工具 / 密码哈希 / 依赖注入
│   │   └── ai_service.py       # AI 服务（当前 Mock，预留 DeepSeek）
│   │
│   └── data/
│       ├── questions.json      # 内置八股题库（20 题，Java后端/计算机基础）
│       └── problem_lists.json  # 内置题单（LeetCode 75 + 剑指Offer 30题）
│
└── frontend/
    ├── app/
    │   ├── (auth)/             # 不需要登录的页面
    │   │   ├── login/
    │   │   └── register/
    │   └── (main)/             # 需要登录的页面（layout 做鉴权）
    │       ├── layout.tsx      # 侧边栏 + 鉴权跳转
    │       ├── dashboard/
    │       ├── projects/
    │       │   └── [id]/
    │       │       └── interview/  # WebSocket 面试对话
    │       ├── questions/
    │       ├── algorithm/
    │       └── plan/
    ├── components/ui/          # shadcn/ui 组件
    └── lib/
        ├── api.ts              # axios 封装，所有接口调用
        └── auth.ts             # token 读写工具
```

---

## 四、数据库设计

```sql
-- 用户
users
  id, email, hashed_password, username,
  target_job, tech_stack(JSON), target_companies(JSON),
  interview_date, level, created_at, updated_at

-- 项目经历
projects
  id, user_id, name, start_date, end_date, role, team_size,
  background, tech_arch, my_work, highlights, difficulties,
  tech_stack(JSON), project_type,
  analysis(JSON),   -- AI 分析结果缓存
  created_at, updated_at

-- 面试会话
interview_sessions
  id, project_id, user_id, mock_company,
  score, report(JSON), created_at, ended_at

-- 面试对话记录
project_conversations
  id, session_id, role(interviewer/user), content, created_at

-- 八股题库
questions
  id, category, subcategory, question, answer,
  type(choice/essay/follow_up), difficulty,
  options(JSON), correct_option, follow_up_ids(JSON)

-- 答题记录
answer_records
  id, user_id, question_id, user_answer,
  ai_score, ai_feedback(JSON), is_correct, created_at

-- 错题本
mistake_book
  id, user_id, source_type(question/algorithm), source_id,
  next_review_date, review_count, created_at

-- 内置题单（静态数据）
problem_lists
  id, name, source, total_count, problems(JSON)

-- 用户选择的题单
user_problem_lists
  id, user_id, list_id, selected_at

-- 刷题记录
algorithm_records
  id, user_id, list_id, leetcode_id, title, difficulty,
  tags(JSON), mastery(mastered/fuzzy/unknown),
  created_at, next_review_date

-- 学习计划
study_plans
  id, user_id, date, tasks(JSON), created_at
```

---

## 五、API 文档

> 完整交互文档运行后访问 `http://localhost:8000/docs`

### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 注册，返回 JWT Token |
| POST | `/api/auth/login` | 登录，返回 JWT Token |
| GET | `/api/auth/me` | 获取当前用户信息 |
| PUT | `/api/auth/me` | 更新个人资料 |

所有需要登录的接口，Header 携带：
```
Authorization: Bearer <token>
```

### 项目深挖

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/projects` | 项目列表 |
| POST | `/api/projects` | 创建项目 |
| GET | `/api/projects/{id}` | 项目详情 |
| PUT | `/api/projects/{id}` | 更新项目 |
| DELETE | `/api/projects/{id}` | 删除项目 |
| POST | `/api/projects/{id}/analyze` | AI 分析项目 |
| POST | `/api/projects/{id}/interview` | 创建面试会话 |
| GET | `/api/projects/{id}/sessions` | 历史面试记录 |
| GET | `/api/projects/sessions/{id}/messages` | 获取对话记录 |
| POST | `/api/projects/sessions/{id}/end` | 结束面试并生成报告 |
| WS | `/api/projects/sessions/{id}/ws?token=` | 实时面试对话 |

### 八股文

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/questions` | 题目列表（支持 category/type/difficulty 筛选）|
| GET | `/api/questions/categories` | 分类树 |
| GET | `/api/questions/{id}` | 题目详情 |
| POST | `/api/questions/{id}/answer` | 提交答案，返回 AI 评分 |
| POST | `/api/questions/follow-up` | 获取连环追问 |
| GET | `/api/questions/mistakes/list` | 错题本 |

### 算法追踪

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/algorithm/lists` | 所有内置题单 |
| POST | `/api/algorithm/lists/select` | 选择题单 |
| GET | `/api/algorithm/lists/progress` | 当前题单进度 |
| GET | `/api/algorithm/daily` | 今日推荐（3 题）|
| POST | `/api/algorithm/record` | 记录刷题 + 掌握度 |
| GET | `/api/algorithm/weakness` | 薄弱标签统计 |

### 学习计划 / 仪表盘

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/plan/today` | 今日学习计划（自动生成）|
| GET | `/api/dashboard` | 仪表盘数据 |

---

## 六、核心模块说明

### 6.1 认证流程

```
注册/登录 → 生成 JWT（有效期 7 天）→ 前端存 localStorage
→ axios 拦截器自动带 Authorization Header
→ 401 时自动清除 token 并跳转登录页
```

### 6.2 WebSocket 面试对话

```
前端 new WebSocket(url + ?token=xxx)
→ 后端解码 token 验证身份
→ 前端发送 {content: "用户回答"}
→ 后端存入 project_conversations
→ 调用 ai_service.interview_reply() 生成追问
→ 推送 {role: "interviewer", content: "追问内容"}
```

### 6.3 AI 服务接入

当前使用 Mock 实现，接入 DeepSeek 只需替换 `backend/services/ai_service.py` 中各方法：

```python
class AIService:
    def analyze_project(self, project: dict) -> dict:
        # 替换为 DeepSeek API 调用
        pass

    def interview_reply(self, history: list, project: dict) -> str:
        # 替换为流式输出
        pass

    def grade_answer(self, question: str, answer: str, reference: str) -> dict:
        # 替换为 AI 批改
        pass
```

### 6.4 每日算法推荐逻辑

```
1. 从用户选择的题单中取第一道未完成的题（主线推进）
2. 查找 mastery=fuzzy/unknown 且 next_review_date <= 今天的记录（复习）
3. 补足到 3 道
```

### 6.5 数据库自动切换

```python
# database.py
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./interview_assistant.db")

# Railway/Render 注入的 PostgreSQL URL 以 postgres:// 开头
# SQLAlchemy 2.0 需要 postgresql://，自动替换
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
```

---

## 七、本地开发

### 环境要求

- Python 3.10+
- Node.js 18+
- uv（Python 包管理，可用 `pip install uv` 安装）

### 启动后端

```bash
cd backend

# 首次：创建虚拟环境并安装依赖
uv venv
uv pip install -r requirements.txt

# 初始化数据库 + 种子数据
.venv/bin/python seed.py

# 启动开发服务器
.venv/bin/uvicorn main:app --reload
# 访问 http://localhost:8000/docs
```

### 启动前端

```bash
cd frontend

# 首次安装依赖
npm install

# 启动
npm run dev
# 访问 http://localhost:3000
```

---

## 八、生产部署

### 架构

```
GitHub → Render（后端自动部署）
GitHub → Vercel（前端自动部署）
Supabase（PostgreSQL，独立托管）
```

### 部署流程

1. Supabase 创建项目，获取 PostgreSQL 连接串
2. Render 部署后端，Root Directory 设为 `backend`，填入环境变量
3. Vercel 部署前端，Root Directory 设为 `frontend`，填入 `NEXT_PUBLIC_API_URL`
4. 更新 Render 的 `FRONTEND_URL` 为 Vercel 域名

每次 `git push main`，Render 和 Vercel 均自动重新部署。

---

## 九、环境变量

### 后端（Render）

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `DATABASE_URL` | ✅ | Supabase PostgreSQL 连接串 |
| `SECRET_KEY` | ✅ | JWT 签名密钥（随机 64 位十六进制字符串）|
| `FRONTEND_URL` | ✅ | 前端域名，用于 CORS 白名单（多个用逗号分隔）|

### 前端（Vercel）

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `NEXT_PUBLIC_API_URL` | ✅ | 后端 API 地址，如 `https://xxx.onrender.com` |

### 本地开发

后端无需 `.env` 文件，默认使用 SQLite。

前端创建 `frontend/.env.local`：
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## 十、本地调试

### 启动方式

同时开两个终端：

**终端 1 — 后端**
```bash
cd backend
.venv/bin/uvicorn main:app --reload
```

**终端 2 — 前端**
```bash
cd frontend
npm run dev
```

访问 `http://localhost:3000`，后端接口文档在 `http://localhost:8000/docs`。

### 排查接口问题

1. 打开浏览器**开发者工具 → Network 标签**
2. 触发出错操作（如注册、登录）
3. 找到红色失败请求，点进去看 **Response** 的错误信息
4. 同时观察后端终端的报错输出

### 常见问题

| 现象 | 原因 | 解决 |
|------|------|------|
| 前端请求被 CORS 拦截 | `FRONTEND_URL` 未包含当前前端地址 | 后端 `.env` 或环境变量加入 `http://localhost:3000` |
| 注册/登录返回 500 | 数据库未初始化 | `cd backend && .venv/bin/python seed.py` |
| WebSocket 连接失败 | token 未正确传递 | 检查 URL 是否带 `?token=xxx` |
| 生产环境注册失败 | Supabase 连接失败 | 改用连接池地址（见第八节），或检查 `DATABASE_URL` 是否正确填写 |
