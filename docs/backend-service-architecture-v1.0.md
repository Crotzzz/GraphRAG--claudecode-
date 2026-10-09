# GraphRAG 后端服务架构规范文档 v1.0

> **文档版本**: v1.0  
> **最后更新**: 2026-07-17  
> **对应代码**: `graphrag_pipeline/app/`  
> **前置依赖**:  
>   - `bridge-pipeline-specification-v1.0.md` — 知识图谱构建  
>   - `agentic-rag-architecture-v1.0.md` — Agent 问答  
>   - `mineru-specification-v1.0.md` — 文档解析  
>   - `langextract-specification-v1.0.md` — 实体提取  

---

## 目录

- [1. 系统概述](#1-系统概述)
- [2. 分层架构](#2-分层架构)
- [3. 技术栈选型](#3-技术栈选型)
- [4. 数据模型规范](#4-数据模型规范)
  - [4.1 文档索引模型](#41-文档索引模型)
  - [4.2 对话线程模型](#42-对话线程模型)
  - [4.3 Agent 问答模型](#43-agent-问答模型)
- [5. 数据库设计](#5-数据库设计)
  - [5.1 ER 关系](#51-er-关系)
  - [5.2 表结构](#52-表结构)
- [6. API 接口规范](#6-api-接口规范)
  - [6.1 文档索引 API](#61-文档索引-api)
  - [6.2 知识图谱 API](#62-知识图谱-api)
  - [6.3 Agent 问答 API](#63-agent-问答-api)
  - [6.4 系统管理 API](#64-系统管理-api)
- [7. 服务层设计](#7-服务层设计)
  - [7.1 索引服务 (IndexService)](#71-索引服务-indexservice)
  - [7.2 知识图谱服务 (KGService)](#72-知识图谱服务-kgservice)
  - [7.3 Agent 问答服务 (AgentService)](#73-agent-问答服务-agentservice)
- [8. 错误码规范](#8-错误码规范)
- [9. 部署配置](#9-部署配置)
  - [9.1 环境要求](#91-环境要求)
  - [9.2 启动方式](#92-启动方式)
  - [9.3 环境变量](#93-环境变量)

---

## 1. 系统概述

GraphRAG 后端服务是一个多模态 RAG（检索增强生成）问答系统的核心服务层。它提供了一套完整的 RESTful API，覆盖从文档上传、解析索引、知识图谱构建到 Agent 智能问答的全链路能力。

### 1.1 设计目标

| 目标 | 说明 |
|------|------|
| **全链路自动化** | 从文档上传到知识图谱构建再到问答，一站式完成 |
| **多模态输入** | 支持 PDF、图片、Office 文档等 10+ 文件格式 |
| **Agent 推理** | 基于知识图谱的多步推理问答，支持工具调用与溯源 |
| **流式交互** | SSE 流式推送 Agent 推理过程和回答 |
| **对话管理** | 多轮对话记忆，thread 级持久化 |
| **工程化** | SQLite 持久化 + 虚拟环境隔离 + RESTful API |

### 1.2 核心流程

```
用户上传文件
    │
    ▼
┌──────────────── INDEXING PIPELINE ─────────────────┐
│                                                     │
│  POST /api/v1/documents/upload                     │
│    │                                                │
│    ├──① MinerU 解析（subprocess 跨 venv）           │
│    │   → content_list.json                          │
│    │                                                │
│    ├──② content_list_loader.py                     │
│    │   → input_text.txt                             │
│    │                                                │
│    ├──③ LangExtract + DeepSeek（实体提取）          │
│    │   → extractions.jsonl                          │
│    │                                                │
│    └──④ graph_builder.py（图谱构建）                │
│       → knowledge_graph.json ★ 最终产物              │
│                                                     │
└─────────────────────────────────────────────────────┘
    │
    ▼ 知识图谱已就绪，可供查询与问答
    │
┌───────────────── AGENT / KG APIs ──────────────────┐
│                                                     │
│  GET  /api/v1/kg/{doc_id}          D3 图谱数据      │
│  GET  /api/v1/kg/{doc_id}/stats    统计信息         │
│  GET  /api/v1/kg/{doc_id}/search   搜索实体         │
│  POST /api/v1/agent/query          同步问答         │
│  POST /api/v1/agent/stream         SSE 流式问答     │
│  POST /api/v1/agent/chat           多轮对话         │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 2. 分层架构

系统采用经典的四层架构，各层职责清晰、单向依赖。

```
┌────────────────────────────────────────────────────────────────────┐
│                      CLIENT LAYER (客户端)                          │
│         Web App (Vue 3) / Mobile / Curl / Postman                   │
└───────────────────────────┬────────────────────────────────────────┘
                            │ HTTP / SSE
┌───────────────────────────▼────────────────────────────────────────┐
│                    API GATEWAY LAYER (FastAPI)                      │
│                                                                     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────┐  │
│  │ Documents    │ │ Knowledge    │ │ Agent        │ │ System   │  │
│  │ Router      │ │ Graph Router │ │ Router      │ │ Router   │  │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └────┬─────┘  │
│         │                │                │               │         │
└─────────┼────────────────┼────────────────┼───────────────┼─────────┘
          │                │                │               │
┌─────────▼────────────────▼────────────────▼───────────────▼─────────┐
│                     SERVICE LAYER (业务服务层)                        │
│                                                                     │
│  ┌─────────────────┐ ┌──────────────┐ ┌──────────────────────────┐  │
│  │ IndexService    │ │ KGService    │ │ AgentService             │  │
│  │                 │ │              │ │                          │  │
│  │ ① MinerU subproc│ │ load KG →    │ │ create_agent()           │  │
│  │ ② 内容提取      │ │ search/search│ │ query() / stream()/chat()│  │
│  │ ③ LangExtract   │ │ graph entity │ │ thread management       │  │
│  │ ④ 图谱构建      │ │ stats        │ │ source extraction       │  │
│  └────────┬────────┘ └──────┬───────┘ └───────────┬──────────────┘  │
│           │                 │                      │                 │
└───────────┼─────────────────┼──────────────────────┼─────────────────┘
            │                 │                      │
┌───────────▼─────────────────▼──────────────────────▼─────────────────┐
│                   INFRASTRUCTURE LAYER (基础设施)                     │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────────┐ │
│  │ SQLite       │  │ 文件系统     │  │ 虚拟环境调度器              │ │
│  │ (文档/对话)   │  │ (上传/输出)   │  │ (MinerU venv subprocess)  │ │
│  │              │  │              │  │                           │ │
│  │ documents    │  │ uploads/     │  │ mineru_mvp_test/.venv/    │ │
│  │ threads      │  │ data/        │  │ python.exe miner_worker   │ │
│  │ messages     │  │ output/      │  │                           │ │
│  └──────────────┘  └──────────────┘  └───────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

### 2.1 层间依赖规则

| 依赖方向 | 规则 | 示例 |
|----------|------|------|
| API → Service | API 路由层只能调用 Service 层 | `documents.py → IndexService` |
| Service → DB | Service 层通过 Repository 访问数据库 | `AgentService → ThreadRepository` |
| Service → Infrastructure | Service 层可调用基础设施 | `IndexService → subprocess(MinerU)` |
| Model 层 | 所有层都可引用 Model 层 | `AgentQueryRequest` 被 API 和 Service 引用 |

---

## 3. 技术栈选型

### 3.1 核心技术栈

| 层次 | 技术 | 版本 | 说明 |
|------|------|:----:|------|
| **Web 框架** | FastAPI | ≥0.100 | 异步支持，自动生成 OpenAPI 文档 |
| **ASGI 服务器** | Uvicorn | ≥0.20 | 轻量级 ASGI 服务器 |
| **数据持久化** | SQLite 3 | 内置 | 零配置嵌入式数据库，WAL 模式 |
| **ORM** | 原生 sqlite3 | 标准库 | 轻量级直接 SQL 操作 |
| **数据验证** | Pydantic | ≥2.0 | 请求/响应模型校验 |
| **Agent 框架** | LangChain | 1.3.14 | create_agent + 工具调用 |
| **图编排** | LangGraph | 最新 | 状态图驱动 Agent 流程 |
| **LLM** | DeepSeek | V4 Flash | 通过 ChatOpenAI 兼容协议接入 |
| **文档解析** | MinerU | v4 API | 云端精准模式，VLM 模型 |
| **实体提取** | LangExtract | 1.6.0 | DeepSeek 驱动，Schema-less 模式 |

### 3.2 Python 依赖清单

```bash
# 核心 Web 服务
fastapi>=0.100.0
uvicorn>=0.20.0
python-multipart>=0.0.5

# LLM / Agent
langchain>=1.3.0
langchain-openai>=0.1.0
langgraph>=0.1.0

# 知识图谱构建（已安装在独立 venv）
mineru-open-sdk>=0.2.0
langextract>=1.6.0

# 工具
python-dotenv>=1.0.0
pydantic>=2.0.0
```

### 3.3 虚拟环境隔离策略

| 组件 | 环境路径 | Python | 说明 |
|------|----------|:------:|------|
| **后端服务** | `langextract/.venv` | 3.11 | 含 LangChain + FastAPI + DeepSeek |
| **MinerU 解析** | `mineru_mvp_test/.venv` | 3.10 | 仅含 mineru SDK，通过 subprocess 调用 |

> 后端服务与 LangExtract 共用同一虚拟环境。MinerU 通过 subprocess + 绝对路径 Python 解释器跨环境调用。

---

## 4. 数据模型规范

### 4.1 文档索引模型

**文件**: `app/models/document.py`

```python
@dataclass
class DocumentRecord:
    doc_id: str                    # 文档唯一标识，格式 "doc_xxxxxxxx"
    filename: str                  # 源文件名（含扩展名）
    file_size: int                 # 文件大小（字节）
    file_type: str                 # 文件类型枚举（pdf / image / doc / ppt / xls / html）
    status: str                    # 状态枚举: pending | running | done | failed
    progress: int                  # 进度百分比 0-100
    error: Optional[str]           # 失败时的错误信息
    created_at: str                # 创建时间 (ISO 8601)
    updated_at: str                # 最后更新时间 (ISO 8601)
    output_path: str               # 输出目录路径
    markdown_path: Optional[str]   # MinerU 解析的 Markdown 路径
    content_list_path: Optional[str]  # content_list.json 路径
    kg_path: Optional[str]         # knowledge_graph.json 路径（最终产物）
```

**状态机**:

```
pending ──→ running ──→ done
               │
               └──→ failed
```

**文件类型枚举**（支持 14 种扩展名）:

| file_type | 扩展名 | 说明 |
|:---------:|--------|------|
| `pdf` | `.pdf` | Adobe PDF |
| `image` | `.png .jpg .jpeg .webp .bmp .gif` | 图片格式 |
| `doc` | `.doc .docx` | Word 文档 |
| `ppt` | `.ppt .pptx` | PowerPoint 演示文稿 |
| `xls` | `.xls .xlsx` | Excel 电子表格 |
| `html` | `.html .htm` | 网页文件 |

### 4.2 对话线程模型

**文件**: `app/models/thread.py`

```python
@dataclass
class ThreadRecord:
    thread_id: str                 # 线程唯一标识，格式 "thread_xxxxxxxx"
    doc_id: Optional[str]          # 关联文档 ID（允许空，通用对话）
    title: str                     # 对话标题（自动从首条消息生成）
    message_count: int             # 消息总数
    created_at: str                # 创建时间 (ISO 8601)
    updated_at: str                # 最后更新时间 (ISO 8601)


@dataclass
class MessageRecord:
    message_id: str                # 消息唯一标识，格式 "msg_xxxxxxxx"
    thread_id: str                 # 所属线程 ID
    role: str                      # 角色: user | assistant
    content: str                   # 消息内容
    tool_calls: Optional[list]     # 工具调用列表（assistant 消息适用）
    sources: Optional[list]        # 来源引用列表（assistant 消息适用）
    latency_ms: Optional[int]      # 响应延迟（毫秒，assistant 消息适用）
    created_at: str                # 创建时间 (ISO 8601)
```

### 4.3 Agent 问答模型

**文件**: `app/models/agent.py`

```python
@dataclass
class AgentQueryRequest:
    """Agent 问答请求体"""
    doc_id: str                    # 文档 ID，指定使用的知识图谱
    question: str                  # 用户问题
    thread_id: Optional[str]       # 对话线程 ID（多轮对话用，null 则自动创建）


@dataclass
class AgentQueryResponse:
    """Agent 问答响应体"""
    answer: str                    # 回答文本（Markdown 格式，含表格/列表）
    sources: Optional[list[SourceInfo]]  # 来源引用
    tool_calls: Optional[list[str]]      # 调用的工具名列表
    tool_call_details: Optional[list[ToolCallDetail]]  # 工具调用详情
    latency_ms: int                # 响应延迟（毫秒）
    thread_id: Optional[str]       # 对话线程 ID


@dataclass
class SourceInfo:
    """回答来源引用"""
    type: str                      # 引用类型: entity | relationship
    label: str                     # 实体类型（如 disease）或关系类型
    name: str                      # 实体名称
    confidence: Optional[str]      # 对齐置信度: match_exact / match_fuzzy / match_lesser
    document_id: Optional[str]     # 来源文档 ID
    relation: Optional[str]        # 关系类型（type=relationship 时）


@dataclass
class ToolCallDetail:
    """单次工具调用详情"""
    tool: str                      # 工具名称: retrieve_kg / query_graph / list_entities
    args: dict                     # 调用参数
    result_summary: str            # 结果摘要（前 100 字符）
    latency_ms: int                # 调用耗时（毫秒）
```

---

## 5. 数据库设计

### 5.1 ER 关系

```
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│  documents   │       │   threads    │       │   messages   │
├──────────────┤       ├──────────────┤       ├──────────────┤
│ PK doc_id    │       │ PK thread_id │       │ PK message_id│
│              │       │              │       │              │
│ filename     │       │ FK doc_id    │◄──────│ FK thread_id │
│ file_size    │       │ title        │       │ role         │
│ file_type    │       │ message_count│       │ content      │
│ status       │       │ created_at   │       │ tool_calls   │
│ progress     │       │ updated_at   │       │ sources      │
│ error        │       └──────────────┘       │ latency_ms   │
│ created_at   │                              │ created_at   │
│ updated_at   │                              └──────────────┘
│ output_path  │
│ kg_path      │
│ ...          │
└──────────────┘
```

### 5.2 表结构

#### `documents` 表

```sql
CREATE TABLE documents (
    doc_id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    file_size INTEGER NOT NULL DEFAULT 0,
    file_type TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    progress INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    output_path TEXT NOT NULL DEFAULT '',
    markdown_path TEXT,
    content_list_path TEXT,
    kg_path TEXT
);
CREATE INDEX idx_documents_status ON documents(status);
```

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `doc_id` | TEXT | PK | 格式 `doc_xxxxxxxx` |
| `filename` | TEXT | NOT NULL | 原始文件名 |
| `file_size` | INTEGER | DEFAULT 0 | 字节数 |
| `file_type` | TEXT | DEFAULT '' | 文件类型枚举 |
| `status` | TEXT | DEFAULT 'pending' | pending/running/done/failed |
| `progress` | INTEGER | DEFAULT 0 | 0-100 |
| `error` | TEXT | NULLABLE | 错误消息 |
| `created_at` | TEXT | NOT NULL | ISO 8601 |
| `updated_at` | TEXT | NOT NULL | ISO 8601 |
| `output_path` | TEXT | NOT NULL | 输出目录 |
| `markdown_path` | TEXT | NULLABLE | full.md 路径 |
| `content_list_path` | TEXT | NULLABLE | content_list.json 路径 |
| `kg_path` | TEXT | NULLABLE | knowledge_graph.json 路径 |

#### `threads` 表

```sql
CREATE TABLE threads (
    thread_id TEXT PRIMARY KEY,
    doc_id TEXT,
    title TEXT NOT NULL DEFAULT '',
    message_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `thread_id` | TEXT | PK | 格式 `thread_xxxxxxxx` |
| `doc_id` | TEXT | NULLABLE | 关联文档 ID |
| `title` | TEXT | DEFAULT '' | 对话标题 |
| `message_count` | INTEGER | DEFAULT 0 | 消息数 |
| `created_at` | TEXT | NOT NULL | ISO 8601 |
| `updated_at` | TEXT | NOT NULL | ISO 8601 |

#### `messages` 表

```sql
CREATE TABLE messages (
    message_id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    tool_calls TEXT,
    sources TEXT,
    latency_ms INTEGER,
    created_at TEXT NOT NULL,
    FOREIGN KEY (thread_id) REFERENCES threads(thread_id) ON DELETE CASCADE
);
CREATE INDEX idx_messages_thread_id ON messages(thread_id);
```

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `message_id` | TEXT | PK | 格式 `msg_xxxxxxxx` |
| `thread_id` | TEXT | FK → threads | 所属线程 |
| `role` | TEXT | NOT NULL | user / assistant |
| `content` | TEXT | NOT NULL | 消息正文 |
| `tool_calls` | TEXT | JSON array | 工具调用列表 |
| `sources` | TEXT | JSON array | 来源引用 |
| `latency_ms` | INTEGER | NULLABLE | 响应延迟 |
| `created_at` | TEXT | NOT NULL | ISO 8601 |

---

## 6. API 接口规范

### 6.1 文档索引 API

**Router**: `app/api/documents.py`  
**Prefix**: `/api/v1/documents`

---

#### `POST /api/v1/documents/upload`

上传文件并启动索引管线。

**Request**: `multipart/form-data`

| 参数 | 类型 | 必须 | 默认值 | 说明 |
|------|------|:----:|:------:|------|
| `file` | `UploadFile` | ✅ | — | 文件（支持 14 种扩展名） |
| `ocr` | `bool` | ❌ | `true` | 是否启用 OCR |
| `language` | `str` | ❌ | `"ch"` | 文档语言 |
| `pages` | `str` | ❌ | `null` | 页码范围，如 `"1-10,15"` |
| `model` | `str` | ❌ | `"vlm"` | MinerU 模型版本 |

> **文件限制**: 单文件 ≤ 200 MB，页数 ≤ 600 页（由 MinerU API 限制）

**Response 201**:
```json
{
  "doc_id": "doc_a1b2c3d4",
  "filename": "medical_report.pdf",
  "file_size": 152780,
  "file_type": "pdf",
  "status": "pending",
  "progress": 0,
  "error": null,
  "created_at": "2026-07-17T10:30:00",
  "updated_at": "2026-07-17T10:30:00"
}
```

**Error 400**:
```json
{
  "detail": {
    "error": "UNSUPPORTED_FILE_TYPE",
    "message": "不支持的文件格式: .exe，支持的格式: pdf, png, jpg, docx, pptx, xlsx, html"
  }
}
```

---

#### `GET /api/v1/documents`

获取文档列表。

**Query Parameters**:

| 参数 | 类型 | 默认值 | 说明 |
|------|------|:------:|------|
| `page` | `int` | `1` | 页码（≥ 1） |
| `page_size` | `int` | `20` | 每页条数（1-100） |
| `status` | `str` | — | 按状态过滤: `done` / `running` / `failed` |

**Response 200**:
```json
{
  "total": 5,
  "page": 1,
  "page_size": 20,
  "items": [
    {
      "doc_id": "doc_a1b2c3d4",
      "filename": "medical_report.pdf",
      "file_size": 152780,
      "file_type": "pdf",
      "status": "done",
      "progress": 100,
      "error": null,
      "created_at": "2026-07-17T10:30:00",
      "updated_at": "2026-07-17T10:31:00",
      "kg_stats": {
        "total_nodes": 21,
        "total_relationships": 25,
        "node_types": {"patient": 1, "disease": 4, "medication": 5},
        "relationship_types": {"has_disease": 4, "has_medication": 5}
      }
    }
  ]
}
```

> `kg_stats` 仅在 `status=done` 且 `kg_path` 存在时附加。

---

#### `GET /api/v1/documents/{doc_id}`

获取单个文档详情。

**Response 200**:
```json
{
  "doc_id": "doc_a1b2c3d4",
  "filename": "medical_report.pdf",
  "file_size": 152780,
  "file_type": "pdf",
  "status": "running",
  "progress": 45,
  "error": null,
  "created_at": "2026-07-17T10:30:00",
  "updated_at": "2026-07-17T10:30:45"
}
```

**Error 404**:
```json
{
  "detail": "文档不存在"
}
```

---

#### `DELETE /api/v1/documents/{doc_id}`

删除文档及其所有产出文件。

**Response 200**:
```json
{
  "message": "文档已删除",
  "doc_id": "doc_a1b2c3d4"
}
```

---

### 6.2 知识图谱 API

**Router**: `app/api/knowledge_graph.py`  
**Prefix**: `/api/v1/kg`

---

#### `GET /api/v1/kg/{doc_id}`

获取完整知识图谱数据（供前端 D3.js 渲染）。

**Response 200**:
```json
{
  "metadata": {
    "total_nodes": 21,
    "total_relationships": 25,
    "node_types": {"patient": 1, "disease": 4},
    "relationship_types": {"has_symptom": 3, "has_disease": 4},
    "built_at": "2026-07-17T10:31:00"
  },
  "nodes": [
    {
      "id": "entity_doc_xxx_0",
      "label": "patient",
      "name": "姓名：王小明    性别：男    年龄：58岁\n病历号：EMG...",
      "properties": {"name": "王小明", "age": "58岁", "gender": "男"},
      "source": {
        "document_id": "doc_xxx",
        "char_interval": {"start_pos": 16, "end_pos": 59},
        "alignment_status": "match_exact",
        "context": "...原文上下文..."
      }
    }
  ],
  "relationships": [
    {
      "id": "rel_doc_xxx_0",
      "type": "has_disease",
      "source_id": "entity_doc_xxx_0",
      "source_label": "patient",
      "target_id": "entity_doc_xxx_12",
      "target_label": "disease",
      "target_name": "急性胰腺炎（水肿型）"
    }
  ]
}
```

---

#### `GET /api/v1/kg/{doc_id}/stats`

获取知识图谱轻量统计信息。

**Response 200**:
```json
{
  "total_nodes": 21,
  "total_relationships": 25,
  "node_types": {"patient": 1, "disease": 4, "medication": 5, "symptom": 3, "vital_sign": 4, "lab_result": 4},
  "relationship_types": {
    "has_symptom": 3, "has_disease": 4, "has_medication": 5,
    "has_vital_sign": 4, "has_lab_result": 4, "treated_with": 5
  },
  "node_counts_by_label": {
    "patient": [{"name": "王小明", "property_keys": ["name","age","gender"]}],
    "disease": [
      {"name": "急性胰腺炎", "property_keys": ["classification"]},
      {"name": "胆囊结石伴慢性胆囊炎", "property_keys": ["classification"]}
    ]
  }
}
```

---

#### `GET /api/v1/kg/{doc_id}/search`

搜索知识图谱实体。

**Query Parameters**:

| 参数 | 类型 | 必须 | 默认值 | 说明 |
|------|------|:----:|:------:|------|
| `q` | `str` | ✅ | — | 搜索关键词 |
| `label` | `str` | ❌ | — | 按实体类型过滤 |
| `limit` | `int` | ❌ | `20` | 返回数量 |

**Response 200**:
```json
{
  "query": "胰腺炎",
  "total": 1,
  "results": [
    {
      "id": "entity_doc_xxx_12",
      "label": "disease",
      "name": "急性胰腺炎（水肿型）",
      "properties": {"classification": "水肿型"},
      "source": {
        "char_interval": {"start_pos": 1012, "end_pos": 1022},
        "alignment_status": "match_exact"
      },
      "related_count": 5
    }
  ]
}
```

---

#### `GET /api/v1/kg/{doc_id}/entities/{entity_id}`

获取单个实体详情及其关联关系。

**Response 200**:
```json
{
  "entity": {
    "id": "entity_doc_xxx_12",
    "label": "disease",
    "name": "急性胰腺炎（水肿型）",
    "properties": {"classification": "水肿型"},
    "source": {
      "document_id": "doc_xxx",
      "char_interval": {"start_pos": 1012, "end_pos": 1022},
      "alignment_status": "match_exact",
      "context": "...原文上下文..."
    }
  },
  "outgoing_relations": [
    {
      "id": "rel_doc_xxx_22",
      "type": "treated_with",
      "source_id": "entity_doc_xxx_12",
      "source_label": "disease",
      "source_name": "急性胰腺炎（水肿型）",
      "target_id": "entity_doc_xxx_18",
      "target_label": "medication",
      "target_name": "生长抑素 250ug/h 持续静脉泵入"
    }
  ],
  "incoming_relations": [
    {
      "id": "rel_doc_xxx_3",
      "type": "has_disease",
      "source_id": "entity_doc_xxx_0",
      "source_label": "patient",
      "source_name": "姓名：王小明...",
      "target_id": "entity_doc_xxx_12",
      "target_label": "disease",
      "target_name": "急性胰腺炎（水肿型）"
    }
  ]
}
```

---

### 6.3 Agent 问答 API

**Router**: `app/api/agent.py`  
**Prefix**: `/api/v1/agent`

---

#### `POST /api/v1/agent/query`

同步问答接口。Agent 执行多步推理后返回完整回答。

**Request Body**:
```json
{
  "doc_id": "doc_a1b2c3d4",
  "question": "患者有哪些诊断？",
  "thread_id": null
}
```

| 字段 | 类型 | 必须 | 说明 |
|------|------|:----:|------|
| `doc_id` | `str` | ✅ | 文档 ID，指定使用的知识图谱 |
| `question` | `str` | ✅ | 用户问题（非空） |
| `thread_id` | `str` | ❌ | 对话线程 ID，传 null 或新 ID 创建新对话 |

**Response 200**:
```json
{
  "answer": "该患者共确诊 4 项疾病：\n\n| 序号 | 诊断名称 | 备注 |\n|:---:|:---------|:----:|\n| 1 | 急性胰腺炎（水肿型） | 主要诊断 |\n| 2 | 胆囊结石伴慢性胆囊炎 | 相关疾病 |\n| 3 | 高血压病3级（极高危） | 慢性病 |\n| 4 | 高脂血症 | 代谢疾病 |",
  "sources": [
    {"type": "entity", "label": "disease", "name": "急性胰腺炎（水肿型）", "confidence": "match_exact"},
    {"type": "entity", "label": "disease", "name": "胆囊结石伴慢性胆囊炎", "confidence": "match_exact"},
    {"type": "relationship", "relation": "has_disease"}
  ],
  "tool_calls": ["retrieve_kg", "query_graph"],
  "tool_call_details": [
    {"tool": "retrieve_kg", "args": {"keyword": "诊断"}, "result_summary": "找到 4 个相关实体", "latency_ms": 1200},
    {"tool": "query_graph", "args": {"entity_name": "王小明", "relation_type": "has_disease"}, "result_summary": "=== patient: 王小明... ===", "latency_ms": 800}
  ],
  "latency_ms": 4700,
  "thread_id": "thread_001"
}
```

**Error 404**:
```json
{
  "detail": {
    "error": "DOCUMENT_NOT_FOUND",
    "message": "文档不存在或知识图谱尚未构建完成"
  }
}
```

**Error 500**:
```json
{
  "detail": {
    "error": "AGENT_ERROR",
    "message": "Agent 调用失败: ..."
  }
}
```

---

#### `POST /api/v1/agent/stream`

SSE 流式问答接口。实时推送 Agent 推理过程和最终回答。

**Request Body**: 同 `/api/v1/agent/query`

**Response**: `text/event-stream` (SSE)

**SSE 事件类型**:

| type | 方向 | 说明 | 字段 |
|------|------|------|------|
| `status` | server → client | 状态更新 | `stage`, `message` |
| `tool_call` | server → client | Agent 正在调用工具 | `tool`, `args` |
| `tool_result` | server → client | 工具返回结果 | `tool`, `content` |
| `token` | server → client | 回答逐 token 流 | `content` |
| `done` | server → client | 回答结束 | `latency_ms`, `sources`, `thread_id` |
| `error` | server → client | 错误 | `message` |

**SSE 交互示例**:
```
data: {"type": "status", "stage": "ready", "message": "Agent 已就绪"}

data: {"type": "tool_call", "tool": "retrieve_kg", "args": {"keyword": "诊断"}}

data: {"type": "tool_result", "tool": "retrieve_kg", "content": "找到 4 个相关实体..."}

data: {"type": "tool_call", "tool": "query_graph", "args": {"entity_name": "王小明", "relation_type": "has_disease"}}

data: {"type": "tool_result", "tool": "query_graph", "content": "=== patient: 王小明 ===\\n  --[has_disease]--> [disease] 急性胰腺炎..."}

data: {"type": "token", "content": "该"}

data: {"type": "token", "content": "患者共确诊 4 项疾病"}

data: {"type": "done", "latency_ms": 5200, "sources": [...], "thread_id": "thread_001"}

data: {"type": "error", "message": "Agent 调用失败"}
```

**SSE 响应头**:
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no
```

---

#### `POST /api/v1/agent/chat`

多轮对话接口。与 `/api/v1/agent/query` 共享相同实现，但 Agent 可感知对话历史。

**Request Body**:
```json
{
  "doc_id": "doc_a1b2c3d4",
  "question": "针对这些诊断用了什么药？",
  "thread_id": "thread_001"
}
```

**Response 200**: 同 `/api/v1/agent/query`

---

#### `GET /api/v1/agent/threads`

获取对话线程列表。

**Query Parameters**:

| 参数 | 类型 | 默认值 |
|------|------|:------:|
| `page` | `int` | `1` |
| `page_size` | `int` | `20` |

**Response 200**:
```json
{
  "total": 3,
  "threads": [
    {
      "thread_id": "thread_001",
      "doc_id": "doc_a1b2c3d4",
      "title": "患者诊断与用药咨询",
      "message_count": 4,
      "created_at": "2026-07-17T10:35:00",
      "updated_at": "2026-07-17T10:40:00"
    }
  ]
}
```

---

#### `GET /api/v1/agent/threads/{thread_id}`

获取指定线程的完整对话历史。

**Response 200**:
```json
{
  "thread_id": "thread_001",
  "doc_id": "doc_a1b2c3d4",
  "messages": [
    {"role": "user", "content": "患者有哪些诊断？", "created_at": "2026-07-17T10:35:00"},
    {
      "role": "assistant",
      "content": "该患者共确诊 4 项疾病...",
      "tool_calls": ["retrieve_kg", "query_graph"],
      "sources": [...],
      "latency_ms": 4700,
      "created_at": "2026-07-17T10:35:05"
    }
  ]
}
```

---

#### `DELETE /api/v1/agent/threads/{thread_id}`

删除对话线程及其所有消息。

**Response 200**:
```json
{
  "message": "对话已删除",
  "thread_id": "thread_001"
}
```

---

### 6.4 系统管理 API

**Router**: `app/api/system.py`  
**Prefix**: `/api/v1/system`

---

#### `GET /api/v1/system/health`

健康检查。

**Response 200**:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime_seconds": 86400,
  "docs_count": 5,
  "threads_count": 3,
  "deepseek_api": "connected",
  "disk_usage_percent": 35
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `status` | `str` | `healthy` / `degraded` |
| `version` | `str` | 服务版本号 |
| `uptime_seconds` | `int` | 服务运行时长（秒） |
| `docs_count` | `int` | 文档总数 |
| `threads_count` | `int` | 对话线程总数 |
| `deepseek_api` | `str` | DeepSeek API 状态: `connected` / `missing_key` |
| `disk_usage_percent` | `int` | 磁盘使用率预估（0-100） |

---

#### `GET /api/v1/system/config`

获取系统配置。

**Response 200**:
```json
{
  "llm_provider": "deepseek",
  "llm_model": "deepseek-v4-flash",
  "llm_base_url": "https://api.deepseek.com",
  "mineru_model": "vlm",
  "mineru_language": "ch",
  "concurrent_tasks": 3
}
```

---

#### `PUT /api/v1/system/config`

更新系统配置。

**Request Body**（部分更新）:
```json
{
  "llm_model": "deepseek-v4-pro",
  "mineru_language": "en"
}
```

**Response 200**: 返回更新后的完整配置。

---

## 7. 服务层设计

### 7.1 索引服务 (IndexService)

**文件**: `app/services/index_service.py`

#### 职责

- 接收文件上传，校验文件类型
- 调度索引管线（4 个子步骤）
- 管理 pipeline 过程中文档状态和进度的持久化
- 处理失败回退与异常

#### 核心方法

```python
class IndexService:
    def get_file_type(self, filename: str) -> str | None
        """校验文件扩展名，返回文件类型枚举"""

    def create_document(self, filename: str, file_size: int, file_type: str) -> DocumentRecord
        """创建文档记录，初始化输出目录"""

    def save_upload(self, doc_id: str, content: bytes) -> Path
        """保存上传文件到磁盘"""

    def start_indexing(self, doc_id: str, file_path: Path, params: dict)
        """后台线程启动索引管线"""
```

#### 索引管线执行步骤

| 步骤 | 方法 | 耗时 | 进度 | 产出 |
|:----:|------|:----:|:----:|------|
| ① | `_step1_mineru()` | ~6s | 5%→30% | `content_list.json` |
| ② | `_step2_extract_text()` | ~0.5s | 30%→50% | `input_text.txt` |
| ③ | `_step3_langextract()` | ~11s | 50%→80% | `extractions.jsonl` |
| ④ | `_step4_graph_builder()` | ~1s | 80%→100% | `knowledge_graph.json` |

#### MinerU 跨环境调用逻辑

```python
# 使用 subprocess + 绝对路径 Python 解释器调用 MinerU
MINERU_PYTHON = ROOT_DIR / "mineru_mvp_test" / ".venv" / "Scripts" / "python.exe"
MINERU_WORKER = ROOT_DIR / "graphrag_pipeline" / "viewer" / "mineru_worker.py"

result = subprocess.run(
    [str(MINERU_PYTHON), str(MINERU_WORKER), "--pdf", file_path, "--out", out_dir],
    env=env, capture_output=True, timeout=600,
)
```

---

### 7.2 知识图谱服务 (KGService)

**文件**: `app/services/kg_service.py`

#### 职责

- 加载 `knowledge_graph.json` 到内存缓存
- 构建多维索引（`node_by_id`, `nodes_by_label`, `rels_by_source`, `rels_by_target`）
- 提供实体搜索、统计、详情查询

#### 核心方法

```python
class KGService:
    def load(self, kg_path: str) -> dict
        """加载并缓存知识图谱，构建 O(1) 内存索引"""

    def clear_cache(self, kg_path: str = None)
        """清除缓存"""

    def get_stats(self, kg: dict) -> dict
        """图谱统计：节点/关系数量、类型分布"""

    def search_nodes(self, kg: dict, query: str, label: str = None, limit: int = 20) -> list[dict]
        """关键词搜索实体（名称/标签/属性模糊匹配）"""

    def get_entity(self, kg: dict, entity_id: str) -> dict | None
        """按 ID 获取实体详情"""

    def get_entity_relations(self, kg: dict, entity_id: str) -> dict
        """获取实体的出边/入边关系"""
```

#### 内存索引结构

```python
# 加载时构建的 O(1) 索引
kg["_node_by_id"] = {node["id"]: node}                    # 按 ID 查询
kg["_nodes_by_label"] = {label: [node, ...]}              # 按类型查询
kg["_rels_by_source"] = {source_id: [rel, ...]}           # 出边索引
kg["_rels_by_target"] = {target_id: [rel, ...]}           # 入边索引
```

#### 搜索匹配策略

```
对于关键词 "胰腺炎":
  1. node.name 包含 "胰腺炎" → 匹配
  2. node.label 包含 "胰腺炎" → 匹配
  3. node.properties 任意 value 包含 "胰腺炎" → 匹配
```

---

### 7.3 Agent 问答服务 (AgentService)

**文件**: `app/services/agent_service.py`

#### 职责

- 创建和管理 LangChain Agent 实例
- 处理同步/SSE 流式/多轮对话三种问答模式
- 管理对话线程和消息持久化
- 从回答中提取来源引用（SourceInfo）

#### 核心方法

```python
class AgentService:
    def query(self, req: AgentQueryRequest) -> AgentQueryResponse
        """同步问答"""

    def stream(self, req: AgentQueryRequest) -> Generator[dict]
        """SSE 流式问答（事件生成器）"""

    def chat(self, req: AgentQueryRequest) -> AgentQueryResponse
        """多轮对话"""

    def get_thread_history(self, thread_id: str) -> list[MessageRecord]
        """获取对话历史"""

    def get_threads(self, page: int, page_size: int) -> tuple
        """获取线程列表"""

    def delete_thread(self, thread_id: str) -> bool
        """删除线程及其消息"""
```

#### LangChain Agent 配置

| 参数 | 值 | 说明 |
|------|:---:|------|
| `model` | `ChatOpenAI(model="deepseek-v4-flash")` | DeepSeek via OpenAI 协议 |
| `temperature` | `0.0` | 确定性输出 |
| `tools` | `retrieve_kg`, `query_graph`, `list_entities` | 3 个知识图谱工具 |
| `system_prompt` | 见下文 | 回答规则约束 |

#### Agent 工具清单

| 工具名称 | 功能 | 触发问题示例 |
|----------|------|-------------|
| `retrieve_kg(keyword)` | 关键词搜索实体 | "胰腺炎的信息"、"有哪些诊断" |
| `query_graph(entity_name, relation_type?)` | 查询实体关联关系 | "有哪些症状"、"用了什么药" |
| `list_entities(entity_type?)` | 浏览实体清单 | "有哪些实体类型"、"有哪些药物" |

#### 多轮对话流程

```
用户第1轮: "患者有哪些诊断？"
    → 创建 thread_001，保存消息
    → Agent 调用工具，生成回答
    → 保存 assistant 消息

用户第2轮: "用了什么药？" (thread_id=thread_001)
    → 加载 thread_001 历史消息
    → 构建对话上下文（user+assistant 消息序列）
    → Agent 感知上下文，生成针对性回答
    → 保存新消息
```

#### 来源提取逻辑

```python
def _extract_sources(self, answer: str, kg: KnowledgeGraph) -> list[SourceInfo]:
    """遍历知识图谱节点，将回答中包含的实体名匹配为来源引用。"""
    for node in kg.nodes:
        if node["name"][:30] in answer:
            sources.append(SourceInfo(
                type="entity",
                label=node["label"],
                name=node["name"][:60],
                confidence=node["source"]["alignment_status"],
            ))
```

---

## 8. 错误码规范

### 8.1 HTTP 状态码

| 状态码 | 含义 | 典型场景 |
|:------:|------|----------|
| `200` | 请求成功 | GET/PUT/DELETE 操作成功 |
| `201` | 创建成功 | POST 上传文件成功 |
| `400` | 请求参数错误 | 不支持的文件格式、文件为空 |
| `404` | 资源不存在 | 文档/DKG 不存在 |
| `500` | 服务内部错误 | Agent 调用失败、管线异常 |

### 8.2 业务错误码

| error | HTTP | 说明 |
|-------|:----:|------|
| `UNSUPPORTED_FILE_TYPE` | 400 | 上传的文件格式不支持 |
| `DOCUMENT_NOT_FOUND` | 404 | 文档不存在或知识图谱未就绪 |
| `KG_NOT_FOUND` | 404 | 知识图谱尚未构建完成 |
| `ENTITY_NOT_FOUND` | 404 | 实体 ID 不存在 |
| `AGENT_ERROR` | 500 | Agent 调用过程发生异常 |

### 8.3 错误响应结构

```json
{
  "detail": {
    "error": "ERROR_CODE",
    "message": "人类可读的错误描述"
  }
}
```

---

## 9. 部署配置

### 9.1 环境要求

| 项目 | 要求 |
|------|------|
| **Python** | ≥ 3.10 |
| **操作系统** | Windows 10+ / Linux / macOS |
| **磁盘空间** | ≥ 10 GB（用于存储上传文件和解析结果） |
| **网络** | 需访问 `api.deepseek.com` 和 `mineru.net` |
| **内存** | ≥ 4 GB（知识图谱加载到内存） |

### 9.2 启动方式

```bash
# 1. 激活虚拟环境
cd D:\vibe coding\GraphRAGAgent\langextract
source .venv/Scripts/activate

# 2. 启动后端服务
cd ../graphrag_pipeline
PYTHONIOENCODING=utf-8 python -m app.main

# 3. 访问服务
#    http://localhost:8765           根路径
#    http://localhost:8765/docs      Swagger UI
#    http://localhost:8765/api/v1/system/health  健康检查
```

### 9.3 环境变量

| 变量 | 必须 | 说明 | 默认值 |
|------|:----:|------|:------:|
| `DEEPSEEK_API_KEY` | ✅ | DeepSeek API 密钥 | — |
| `DEEPSEEK_BASE_URL` | ❌ | DeepSeek API 端点 | `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | ❌ | DeepSeek 模型名称 | `deepseek-v4-flash` |
| `MINERU_TOKEN` | ✅ | MinerU API Token | — |
| `PYTHONIOENCODING` | ❌ | 控制台编码 | `utf-8` |

> 环境变量从 `langextract/mvp_test/.env` 文件加载。

### 9.4 目录结构（部署视图）

```
graphrag_pipeline/
│
├── app/                         # 后端服务源码
│   ├── main.py                  # FastAPI 入口
│   ├── api/                     # API 路由层
│   ├── models/                  # 数据模型
│   ├── services/                # 业务服务层
│   └── db/                      # 数据库层
│
├── agentic_rag/                 # Agent 模块
│   ├── kg_loader.py             # 知识图谱加载器
│   ├── kg_tools.py              # LangChain 工具
│   └── kg_agent.py              # Agent 封装
│
├── data/                        # 数据持久化
│   ├── database.sqlite          # SQLite 数据库
│   ├── config.json              # 系统配置
│   └── uploads/                 # 上传文件 + 解析输出
│
├── viewer/                      # 旧版前端（保留）
│   └── templates/
│       └── index.html
│
└── output/                      # 旧版管线输出（保留）
    └── {timestamp}/
        ├── content_list.json
        ├── extractions.jsonl
        └── knowledge_graph.json
```
