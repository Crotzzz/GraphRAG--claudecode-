# GraphRAG 智能文档问答系统

一个基于 **知识图谱 + 大语言模型** 的智能文档分析平台。用户上传 PDF、图片等文档后，系统自动完成文档解析、实体提取与知识图谱构建，并提供**基于知识图谱的 AI 智能问答**能力——回答有据可查、来源可追溯，推理过程全程可视。

> 本项目面向医疗病历、技术文档、企业知识库等需要从长文档中快速提取结构化信息的场景。内置的医疗病历分析为例的示例数据可在 `backend/data/uploads/` 中找到。

---

## 核心特性

| 特性 | 说明 |
|------|------|
| 📄 **文档全链路自动化** | 上传 → 解析（MinerU）→ 实体抽取 → 知识图谱构建，拖拽即用 |
| 🕸️ **知识图谱可视化** | 实体与关系以交互式图谱呈现，节点按类型着色，支持点击查看详情 |
| 💬 **GraphRAG 智能问答** | 基于知识图谱的结构化检索增强生成，回答附带来源引用，降低幻觉 |
| 🔍 **推理过程透明** | SSE 流式推送 Agent 的思考与工具调用过程，用户可实时看到"AI 在做什么" |
| 🧠 **多轮对话记忆** | 对话历史持久化，支持连续追问深入分析 |
| 🎨 **现代化界面** | React 19 + Tailwind CSS 4，响应式布局 + 暗色模式 |

---

## 技术栈

**后端**

- FastAPI — Web 服务与 API
- LangChain / LangGraph — Agent 编排与工具调用
- LangExtract — 结构化实体抽取
- MinerU — PDF / 图片文档解析
- DeepSeek API — 大语言模型
- SQLite — 文档、知识点与对话线程持久化

**前端**

- React 19 + TypeScript
- Vite 8 — 构建与开发服务器
- Tailwind CSS 4 — 样式系统
- React Router 7 — 路由

---

## 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                     前端 SPA (React 19 + Vite)               │
│   工作台 Workbench │ 文档管理 Documents │ 系统设置 Settings    │
└──────────────────────────┬──────────────────────────────────┘
                           │ REST + SSE (http://localhost:8765)
┌──────────────────────────▼──────────────────────────────────┐
│                    FastAPI 后端服务                          │
│  /api/v1/documents  文档上传与管理                            │
│  /api/v1/kg         知识图谱查询                              │
│  /api/v1/agent      Agent 问答（含 SSE 流式）                 │
│  /api/v1/system     健康检查与配置                            │
└───────┬──────────────────────────────────┬──────────────────┘
        │                                  │
┌───────▼─────────┐              ┌─────────▼──────────────┐
│  MinerU 解析     │              │  DeepSeek 大模型        │
│  PDF/图片→文本   │              │  实体抽取 / 图谱构建    │
└───────┬─────────┘              │  GraphRAG 问答          │
        │                        └─────────┬──────────────┘
        │                                  │
┌───────▼──────────────────────────────────▼──────────────┐
│              SQLite：文档 / 实体 / 关系 / 对话线程          │
└─────────────────────────────────────────────────────────┘
```

---

## 目录结构

```
GraphRAGAgent/
├── backend/                        # 后端服务（FastAPI + LangChain）
│   ├── app/
│   │   ├── main.py                 # 应用入口（端口 8765）
│   │   ├── api/                    # 路由层：documents / kg / agent / system
│   │   ├── services/               # 业务层：agent / kg / config
│   │   ├── pipeline/               # 处理流水线：MinerU 解析 → 图谱构建
│   │   ├── db/                     # 数据访问层（SQLite）
│   │   └── models/                 # 数据模型
│   ├── data/
│   │   ├── uploads/                # 上传文档与示例数据
│   │   └── database.sqlite         # 本地数据库（已 gitignore）
│   ├── .env.example                # 环境变量模板
│   └── requirements.txt            # Python 依赖
├── frontend/                       # 前端 SPA（React + Vite）
│   ├── src/
│   │   ├── api/                    # 后端接口封装
│   │   ├── components/             # 通用组件
│   │   ├── layouts/                # 布局（Header / Sidebar / StatusBar）
│   │   └── pages/                  # 页面：Workbench / Documents / Settings
│   ├── vite.config.ts              # 开发服务器端口 8443
│   └── package.json
├── docs/                           # 规范与设计文档（见下文）
└── README.md
```

---

## 快速开始

### 环境要求

- Python 3.10+
- Node.js 18+ 与 [pnpm](https://pnpm.io/)
- 一个 [DeepSeek](https://platform.deepseek.com/) API Key
- 一个 [MinerU](https://mineru.net/) Token（用于文档解析）

### 1. 后端

```bash
cd backend

# 创建并激活虚拟环境
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
# source .venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 配置环境变量：复制模板并填入真实值
cp .env.example .env
#   编辑 .env，填入 DEEPSEEK_API_KEY 与 MINERU_TOKEN

# 启动服务
python -m app.main
```

启动后：

- 服务地址 <http://localhost:8765>
- Swagger UI <http://localhost:8765/docs>

### 2. 前端

```bash
cd frontend

pnpm install
pnpm dev
```

启动后访问 <http://localhost:8443>。

> 前端默认请求 `http://localhost:8765/api/v1`，请确保后端已启动。如需修改，编辑 `frontend/src/api/client.ts` 中的 `API_BASE`。

---

## 配置说明

所有敏感配置集中在 `backend/.env` 中（已被 `.gitignore` 忽略，**不会**进入版本库）：

| 变量 | 说明 |
|------|------|
| `DEEPSEEK_API_KEY` | DeepSeek 大模型 API Key |
| `DEEPSEEK_BASE_URL` | DeepSeek API 地址，默认 `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | 使用的模型名称 |
| `MINERU_TOKEN` | MinerU 文档解析服务 Token |

参考 `backend/.env.example` 填写。**请勿提交任何真实密钥。**

---

## 主要 API

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/v1/documents/upload` | 上传文档并触发解析流水线 |
| `GET` | `/api/v1/documents` | 文档列表 |
| `GET` | `/api/v1/documents/{doc_id}` | 文档详情 |
| `DELETE` | `/api/v1/documents/{doc_id}` | 删除文档 |
| `GET` | `/api/v1/kg/{doc_id}/stats` | 知识图谱统计 |
| `GET` | `/api/v1/kg/{doc_id}/search` | 图谱实体检索 |
| `GET` | `/api/v1/kg/{doc_id}/entities/{entity_id}` | 实体详情与关联关系 |
| `POST` | `/api/v1/agent/query` | 同步问答 |
| `POST` | `/api/v1/agent/stream` | **SSE 流式问答**（含推理过程推送） |
| `GET` | `/api/v1/agent/threads` | 对话线程列表 |
| `GET` | `/api/v1/system/health` | 健康检查 |
| `GET` / `PUT` | `/api/v1/system/config` | 读取 / 更新运行时配置 |

---

## 文档

项目的每一层设计都以独立的规范文档沉淀在 `docs/` 目录：

| 文档 | 内容 |
|------|------|
| `product-requirements-document-v1.0.md` | 产品需求文档（PRD） |
| `frontend-architecture-v1.0.md` | 前端架构设计 |
| `backend-service-architecture-v1.0.md` | 后端服务架构设计 |
| `bridge-pipeline-specification-v1.0.md` | 知识图谱构建流水线规范 |
| `agentic-rag-architecture-v1.0.md` | Agentic RAG 问答架构 |
| `mineru-specification-v1.0.md` | MinerU 文档解析规范 |
| `langextract-specification-v1.0.md` | LangExtract 实体抽取规范 |

---

## 开发说明

此项目由 claude code 辅助实现，过程中每一模块都输出了对应的说明文档，并进行 MVP 测试，以及后续联合测试都反过来让修改原先说明文档，各个功能结合时都是依据原先生成的规范文档，保证输入输出等适配。

---

## 许可

本项目仅供学习与研究使用。示例数据中的人名、病历等信息均为**虚构**，仅用于功能演示。
