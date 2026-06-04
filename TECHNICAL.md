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
| bcrypt | 直接使用 | 密码哈希（非 passlib） |
| uvicorn | 0.32 | ASGI 服务器 |
| psycopg2-binary | 2.9 | PostgreSQL 驱动 |

### 前端

| 技术 | 版本 | 用途 |
|------|------|------|
| Next.js | 14 | React 框架，App Router |
| TypeScript | 5.x | 类型安全 |
| TailwindCSS | 3.x | 样式 |
| shadcn/ui | latest | UI 组件库（基于 base-ui，**不支持 asChild**） |
| axios | - | HTTP 客户端 |
| WebSocket API | 原生 | 面试实时对话 |

### 基础设施

| 服务 | 用途 |
|------|------|
| GitHub | 代码托管 |
| Render | 后端部署（免费层），`render.yaml` 配置 |
| Supabase | PostgreSQL 托管（免费 500MB） |
| Vercel | 前端部署（免费） |

---

## 三、项目结构

```
jjjobbb/
├── CLAUDE.md                   # 开发指南（AI 助手必读）
├── TECHNICAL.md                # 本文档
├── render.yaml                 # Render 部署配置
├── .gitignore
│
├── backend/
│   ├── main.py                 # 入口，注册路由、CORS、启动时建表/补列迁移
│   ├── database.py             # 数据库连接（SQLite/PostgreSQL 自动切换）
│   ├── seed.py                 # 数据库初始化 + 题库重导入（保留用户数据）
│   ├── md_parser.py            # Markdown 题库解析器
│   ├── requirements.txt
│   │
│   ├── models/                 # SQLAlchemy 数据模型
│   │   ├── __init__.py
│   │   ├── user.py             # User（含 is_admin、profile 字段）
│   │   ├── project.py          # Project / InterviewSession / ProjectConversation
│   │   ├── question.py         # Question / AnswerRecord / MistakeBook / QuestionMastery
│   │   ├── question_set.py     # QuestionSet / QuestionSetItem / UserActiveSet
│   │   ├── plan_item.py        # UserPlanItem（学习计划条目）
│   │   └── algorithm.py        # ProblemList / UserProblemList / AlgorithmRecord
│   │
│   ├── schemas/                # Pydantic 请求/响应 Schema
│   │
│   ├── routers/                # API 路由
│   │   ├── auth.py             # 注册 / 登录 / 个人资料
│   │   ├── projects.py         # 项目 CRUD + AI 分析 + WebSocket 面试
│   │   ├── questions.py        # 八股题库 + 答题 + 掌握度
│   │   ├── question_sets.py    # 题单 CRUD + 激活切换 + MD 导入导出
│   │   ├── algorithm.py        # 算法题单 + 刷题记录 + 每日推荐
│   │   ├── plan.py             # 学习计划条目 + 简历上传
│   │   ├── dashboard.py        # 仪表盘数据
│   │   └── admin.py            # 管理员文件编辑 + 题库重导入 + 题单管理
│   │
│   ├── services/
│   │   ├── auth_service.py     # JWT 工具 / 密码哈希 / 依赖注入
│   │   └── ai_service.py       # AI 服务（当前 Mock，预留 DeepSeek）
│   │
│   └── data/
│       ├── Android/            # Markdown 题库（多个 .md 文件）
│       ├── Java后端/
│       ├── Java语言/
│       ├── Kotlin语言/
│       ├── 安卓Framework/
│       ├── 安卓基础知识/
│       ├── 计算机基础/
│       └── problem_lists.json  # 算法题单（LeetCode Hot 100 / Top 150 等）
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
    │       ├── questions/      # 八股文（4 视图：list/detail/editor/practice）
    │       ├── algorithm/
    │       ├── plan/
    │       ├── profile/        # 个人信息（目标岗位/技术栈/公司/DDL/简历）
    │       └── admin/          # 管理员题库编辑 + 系统题单管理
    ├── components/ui/          # shadcn/ui 组件
    └── lib/
        ├── api.ts              # axios 封装，所有接口调用
        └── auth.ts             # token 读写工具
```

---

## 四、数据库设计

```sql
-- 用户（含个人信息和管理员标志）
users
  id, email, hashed_password, username, is_admin,
  target_job, level, tech_stack(JSON), target_companies(JSON),
  interview_date, created_at, updated_at

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

-- 八股题目（user_id=NULL 为系统题，否则为用户自建题）
questions
  id, category, subcategory, question, answer,
  type(choice/essay/follow_up), difficulty,
  options(JSON), correct_option, user_id

-- 答题记录
answer_records
  id, user_id, question_id, user_answer,
  ai_score, ai_feedback(JSON), is_correct, created_at

-- 掌握度
question_mastery
  id, user_id, question_id, mastery(mastered/fuzzy/unknown), updated_at

-- 错题本
mistake_book
  id, user_id, source_type(question/algorithm), source_id,
  next_review_date, review_count, created_at

-- 八股题单（is_system=True 为系统题单）
question_sets
  id, name, description, is_system, user_id

-- 题单-题目关联
question_set_items
  id, set_id, question_id, order

-- 用户激活的题单（多选，UNIQUE(user_id, set_id)）
user_active_sets
  id, user_id, set_id, selected_at

-- 学习计划条目
user_plan_items
  id, user_id, content, done, order, created_at

-- 算法题单（静态数据，按 name upsert）
problem_lists
  id, name, source, total_count, problems(JSON)

-- 用户选择的算法题单
user_problem_lists
  id, user_id, list_id, selected_at

-- 算法刷题记录
algorithm_records
  id, user_id, leetcode_id, title, difficulty,
  tags(JSON), mastery(mastered/fuzzy/unknown),
  created_at, next_review_date
```

---

## 五、API 文档

> 完整交互文档运行后访问 `http://localhost:8000/docs`

### 认证 / 个人资料

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 注册，返回 JWT Token |
| POST | `/api/auth/login` | 登录，返回 JWT Token |
| GET | `/api/auth/me` | 获取当前用户信息 |
| PUT | `/api/auth/me` | 更新个人资料（username/target_job/level/tech_stack/target_companies/interview_date）|

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
| GET | `/api/questions` | 题目列表（支持 set_id/set_ids/category/type 过滤；reveal_answer=true 返回 answer 字段）|
| GET | `/api/questions/mastery` | 用户掌握度（支持 set_id/set_ids）|
| GET | `/api/questions/{id}` | 题目详情 |
| POST | `/api/questions/{id}/answer` | 提交答案，返回 AI 评分 |
| POST | `/api/questions/{id}/mastery` | 更新掌握度 |
| GET | `/api/questions/categories` | 分类树 |

### 八股题单

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/question-sets` | 所有题单（系统+用户自建），含 is_active 字段 |
| GET | `/api/question-sets/active` | 当前激活题单列表（含题目） |
| POST | `/api/question-sets/select?set_id=N` | 切换激活状态（toggle） |
| POST | `/api/question-sets` | 创建用户题单 |
| GET | `/api/question-sets/{id}` | 题单详情（含题目列表） |
| PUT | `/api/question-sets/{id}` | 更新题单名称/描述 |
| DELETE | `/api/question-sets/{id}` | 删除用户题单 |
| POST | `/api/question-sets/{id}/items` | 添加题目到用户题单 |
| DELETE | `/api/question-sets/{id}/items/{question_id}` | 从用户题单移除题目 |
| GET | `/api/question-sets/{id}/export-md` | 导出为 Markdown |
| POST | `/api/question-sets/{id}/import-md` | 从 Markdown 文本全量导入 |
| POST | `/api/question-sets/{id}/upload-md` | 上传 .md 文件全量导入 |
| POST | `/api/question-sets/admin/sets` | 管理员创建系统题单 |
| PUT | `/api/question-sets/admin/sets/{id}` | 管理员更新系统题单 |
| DELETE | `/api/question-sets/admin/sets/{id}` | 管理员删除系统题单 |

### 算法追踪

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/algorithm/lists` | 所有内置题单 |
| POST | `/api/algorithm/lists/select` | 选择/取消题单 |
| GET | `/api/algorithm/daily` | 今日推荐（3 题）|
| POST | `/api/algorithm/record` | 记录刷题 + 掌握度 |
| GET | `/api/algorithm/weakness` | 薄弱标签统计 |

### 学习计划 / 仪表盘

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/plan/items` | 学习计划条目列表 |
| POST | `/api/plan/items` | 新增条目 |
| PUT | `/api/plan/items/{id}` | 更新条目（内容/完成状态/排序） |
| DELETE | `/api/plan/items/{id}` | 删除条目 |
| POST | `/api/plan/resume` | 上传简历（.md/.pdf/.docx），AI 生成计划条目 |
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
    def analyze_project(self, project: dict) -> dict: ...
    def interview_reply(self, history: list, project: dict) -> str: ...
    def grade_answer(self, question: str, answer: str, reference: str) -> dict: ...
    def generate_follow_up(self, question: str, user_answer: str) -> str: ...
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
# Render 注入的 PostgreSQL URL 以 postgres:// 开头，SQLAlchemy 2.0 需要 postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
```

### 6.6 seed.py 与 Render 部署顺序

Render 启动命令：`python seed.py && uvicorn main:app --host 0.0.0.0 --port $PORT`

因此 seed.py 运行时 main.py 的迁移代码尚未执行。seed.py 内部已包含：
- `user_id` 列迁移（先于任何使用 user_id 的查询）
- 系统题单保存/恢复用户激活记录逻辑
- problem_lists 按 name upsert（避免 ForeignKey 错误）

### 6.7 PostgreSQL vs SQLite 差异处理

main.py 中 `user_active_sets` 迁移有 dialect 分支：
- PostgreSQL：`ALTER TABLE ... DROP CONSTRAINT` + `ADD CONSTRAINT`
- SQLite：重建整张表（SQLite 不支持 DROP CONSTRAINT）

---

## 七、本地开发

### 环境要求

- Python 3.10+
- Node.js 18+

### 启动后端

```bash
cd backend

# 首次：创建虚拟环境并安装依赖
python -m venv .venv
.venv/bin/pip install -r requirements.txt

# 初始化数据库 + 导入题库
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

1. Supabase 创建项目，获取 PostgreSQL 连接串（用 Session Pooler 地址，端口 5432）
2. Render 部署后端，Root Directory 设为 `backend`，填入环境变量
3. Vercel 部署前端，Root Directory 设为 `frontend`，填入 `NEXT_PUBLIC_API_URL`
4. 更新 Render 的 `FRONTEND_URL` 为 Vercel 域名

每次 `git push main`，Render 和 Vercel 均自动重新部署。

---

## 九、环境变量

### 后端（Render）

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `DATABASE_URL` | ✅ | Supabase PostgreSQL 连接串（Session Pooler） |
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

## 十、常见问题排查

| 现象 | 原因 | 解决 |
|------|------|------|
| 前端请求被 CORS 拦截 | `FRONTEND_URL` 未包含当前前端地址 | Render 环境变量加入前端域名 |
| 注册/登录返回 500 | 数据库未初始化 | `cd backend && .venv/bin/python seed.py` |
| WebSocket 连接失败 | token 未正确传递 | 检查 URL 是否带 `?token=xxx` |
| 生产环境 `column does not exist` | seed.py 没有列迁移，main.py 迁移未运行 | seed.py 内部补 ALTER TABLE |
| `ForeignKeyViolation` on problem_lists | DELETE 时 user_problem_lists 有引用 | 改用 upsert by name |
| `DatatypeMismatch` BOOLEAN DEFAULT | PostgreSQL 不接受 `DEFAULT 0` | 改为 `DEFAULT FALSE` |
| 八股文页面加载慢 | list_sets N+1 查询 | 已优化为批量查询（4 次 SQL） |
