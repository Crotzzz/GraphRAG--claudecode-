# GraphRAG 智能文档问答系统 — 项目说明文档

> **适用场景**: 应届生求职 AI 应用开发 / Agent 开发岗位  
> **项目定位**: 简历上的高质量实战项目 — 全栈 + AI + 工程化  
> **技术栈**: Python FastAPI + LangChain + React + D3.js + DeepSeek + MinerU

---

## 一、项目概况

### 1.1 项目简介

GraphRAG 是一个基于**知识图谱 + 大语言模型**的智能文档问答系统。用户上传 PDF、Word、图片等文档后，系统自动完成文档解析、实体提取、知识图谱构建，并提供基于知识图谱的 AI 智能问答能力。核心特点是将传统的 RAG（检索增强生成）升级为 **GraphRAG**——基于知识图谱结构的多步推理问答，回答有据可查、来源可追溯。

### 1.2 核心亮点

| 亮点 | 说明 |
|------|------|
| **全链路自动化** | 从文档上传到图谱构建到 AI 问答，一键完成 |
| **GraphRAG 架构** | 非传统向量检索 RAG，而是基于知识图谱的实体关系推理 |
| **Agent 多步推理** | DeepSeek + LangChain Agent 实现多步工具调用、文档评分、查询重写 |
| **SSE 流式交互** | Agent 推理过程实时推送到前端（工具调用→搜索→生成→完成） |
| **知识图谱可视化** | D3.js 力导向图实时展示文档中的实体和关系网络 |
| **多文档管理** | 支持 14 种文件格式，每个文档独立构建知识图谱和对话历史 |

### 1.3 技术栈

| 层级 | 技术 | 版本 | 用途 |
|------|------|:----:|------|
| **后端框架** | FastAPI | 0.139 | RESTful API + SSE 流式 |
| **Agent 框架** | LangChain | 1.3 | Agent 编排 + 工具调用 |
| **LLM** | DeepSeek V4 Flash | — | 实体提取 + 智能问答（OpenAI 兼容协议） |
| **文档解析** | MinerU | v4 API | PDF/Office/图片 → 结构化文本 |
| **实体提取** | LangExtract | 1.6 | LLM 驱动的结构化信息提取 |
| **数据持久化** | SQLite | — | 文档记录 + 对话历史 |
| **前端框架** | React 19 | 19.0 | SPA 单页应用 |
| **可视化** | D3.js | 7 | 知识图谱力导向图 |
| **样式** | TailwindCSS | 4 | 响应式布局 + 暗色模式 |

### 1.4 核心数据指标

| 指标 | 值 |
|------|:----:|
| 后端代码量 | **2,045 行** Python |
| 前端代码量 | **2,966 行** TypeScript/CSS |
| API 端点 | **17 个** RESTful + SSE |
| 规约文档 | **9 份** 完整规范 |
| 单文档平均提取 | **25 节点 / 30 关系** |
| Agent 平均响应 | **6.7 秒** / 问题 |

---

## 二、系统架构

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                          前端 (React SPA)                            │
│  Workbench │ Documents │ Settings │ D3.js Graph │ Chat Panel        │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTP / SSE
┌──────────────────────────────▼──────────────────────────────────────┐
│                      后端 (FastAPI :8765)                            │
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ 文档索引  │  │ 知识图谱  │  │ Agent    │  │ 系统管理          │   │
│  │ API      │  │ API      │  │ 问答 API │  │ API              │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └─────┬────────────┘   │
│       │             │             │               │                 │
│  ┌────▼─────────────▼─────────────▼───────────────▼──────────────┐ │
│  │                    服务层                                      │ │
│  │  IndexService │ KGService │ AgentService │ ConfigService       │ │
│  │  (pipeline)   │ (内存索引) │ (LangChain) │ (.env)              │ │
│  └──────────────────────────────────────────────────────────────┘ │
│       │                                                           │
│  ┌────▼──────────────────────────────────────────────────────────┐ │
│  │                    基础设施层                                   │ │
│  │  SQLite │ 文件系统 │ 内存缓存 │ .env 配置                       │ │
│  └──────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 GraphRAG 索引管线

```
PDF/图片/Office
    │
    ▼
┌──────────────────────────────────────────────────────────┐
│  索引管线 (Indexing Pipeline)                             │
│                                                          │
│  ① MinerU 解析 ──→ content_list.json（结构化内容块）      │
│  ② 纯文本提取   ──→ input_text.txt（按阅读顺序拼接）       │
│  ③ LangExtract  ──→ extractions.jsonl（实体+属性+位置）    │
│  ④ 图谱构建     ──→ knowledge_graph.json（节点+关系）      │
│                                                          │
│  输出: 25+ 节点 / 30+ 关系 / 6 种实体类型                   │
└──────────────────────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────────────────────┐
│  Agentic RAG 问答                                        │
│                                                          │
│  DeepSeek Agent → 调用 Tool (retrieve_kg/query_graph)    │
│  → 多步推理 → 生成回答 + 来源引用 + 图谱联动               │
└──────────────────────────────────────────────────────────┘
```

### 2.3 Agent 多步推理流程

```
用户提问: "患者有哪些诊断？"
    │
    ▼
① Agent 分析问题 → 判断需要查询诊断信息
    │
    ▼
② 调用 retrieve_kg(keyword="诊断") → 返回相关实体
    │
    ▼
③ 调用 query_graph(entity="王小明", type="has_disease")
    │  → 返回 4 条诊断关系
    ▼
④ Agent 综合结果 → 生成结构化回答
    │  → "共确诊 4 项疾病: 急性胰腺炎、胆囊结石..."
    ▼
⑤ 返回回答 + 来源引用 + 图谱高亮联动
```

---

## 三、核心功能模块

### 3.1 文档索引管线

| 步骤 | 耗时 | 产出 |
|:----:|:----:|------|
| MinerU 云端解析 | ~6s | `content_list.json` |
| 纯文本提取 | ~0.5s | `input_text.txt` |
| LangExtract + DeepSeek 提取 | ~11s | `extractions.jsonl` |
| 知识图谱构建 | ~1s | `knowledge_graph.json` |

MinerU 支持的文件格式：PDF、PNG/JPEG/WebP、DOC/DOCX、PPT/PPTX、XLS/XLSX、HTML（共 14 种扩展名）。

### 3.2 知识图谱

**实体类型**（6 种）:

| 类型 | 含义 | 属性示例 |
|------|------|----------|
| `patient` | 患者 | name, age, gender |
| `disease` | 诊断 | classification |
| `symptom` | 症状 | duration, body_part |
| `medication` | 用药 | dosage, frequency |
| `vital_sign` | 生命体征 | value, unit |
| `lab_result` | 化验结果 | value, unit, reference_range |

**关系类型**（6 种）:

| 关系 | 语义 | 示例 |
|------|------|------|
| `has_symptom` | patient → symptom | 患者表现出症状 |
| `has_disease` | patient → disease | 患者被诊断为… |
| `has_medication` | patient → medication | 患者使用药物 |
| `has_vital_sign` | patient → vital_sign | 患者生命体征 |
| `has_lab_result` | patient → lab_result | 患者化验结果 |
| `treated_with` | disease → medication | 诊断治疗使用… |

### 3.3 Agent 问答

**3 个 LangChain Tool**:

| 工具 | 功能 | 触发场景 |
|------|------|----------|
| `retrieve_kg(keyword)` | 关键词搜索实体 | "胰腺炎的信息"、"有哪些诊断" |
| `query_graph(entity)` | 查询关联关系 | "有什么症状"、"用了什么药" |
| `list_entities(type)` | 浏览实体清单 | "有哪些实体类型" |

**系统提示词**严格约定了 Agent 的回答规则：
1. 必须先使用工具获取信息，不凭空编造
2. 如果知识图谱中没有相关信息，如实告知
3. 回答时引用具体实体信息，说明关系

---

## 四、项目亮点深度分析（面试用）

### 4.1 为什么用 GraphRAG 而不是传统 RAG？

**传统 RAG**：将文档切分成 Chunk → 向量化 Embedding → 向量检索 Top-K → LLM 生成回答。

**GraphRAG 的优势**：

| 维度 | 传统 RAG | GraphRAG（本项目） |
|------|----------|-------------------|
| **检索粒度** | 文本块（语义相似） | 实体+关系（精确结构） |
| **推理能力** | 单步检索+生成 | 多步工具调用+推理 |
| **可解释性** | 黑盒检索，难溯源 | 每个回答都有来源引用 |
| **幻觉控制** | 容易产生幻觉 | 实体精准对齐原文位置 |
| **关系理解** | 不理解实体间关系 | 知识图谱天然表达关系 |

**面试话术**："传统 RAG 在需要多跳推理和关系理解的场景下表现不佳，比如'患者有哪些症状？用了什么药来治疗？'这类需要理解实体间关系的问题。GraphRAG 通过构建知识图谱，让 Agent 能在图谱上进行多步遍历和推理，回答更准确、更有依据。"

### 4.2 技术难点与解决方案

| 难点 | 解决方案 |
|------|----------|
| DeepSeek 不支持 `json_schema` 结构化输出 | 使用 `use_schema_constraints=False` + 在 prompt 中强约束 JSON 格式 |
| DeepSeek 不产生 token 级流式输出 | invoke 获取完整结果后按事件拆分，前端保留打字机效果 |
| 跨文档 Agent 回答串数据 | Tool 闭包捕获指定文档的 KG，而非取最新文档 |
| SSE 连接管理 | AbortController 管理连接生命周期，组件卸载自动清理 |
| 环境依赖隔离 | 后端统一 venv，通过 pip 安装所有依赖 |

### 4.3 工程化实践

- **分层架构**: API → Service → DB → Pipeline，层间单向依赖
- **RESTful + SSE**: 同步 API 用于基础查询，SSE 流式用于 AI 推理
- **SQLite 持久化**: 零配置嵌入式数据库，对话历史 + 文档元数据
- **虚拟环境**: uv 管理 Python 依赖，.env 管理敏感配置
- **ErrorBoundary**: 前端全局错误捕获，白屏时展示重新加载按钮
- **暗色模式**: 前端完整支持，偏好持久化到 localStorage

---

## 五、项目目录结构

```
GraphRAGAgent/
├── backend/                          # 后端 2045 行 Python
│   ├── app/
│   │   ├── api/                      # API 路由（17 个端点）
│   │   │   ├── documents.py          #   文档上传/列表/删除
│   │   │   ├── knowledge_graph.py    #   知识图谱查询/搜索
│   │   │   ├── agent.py              #   Agent 问答 + SSE 流式
│   │   │   └── system.py             #   健康检查 + 配置
│   │   ├── models/                   # 数据模型（Python dataclass）
│   │   ├── services/                 # 业务服务
│   │   │   ├── agent_service.py      #   LangChain Agent 封装
│   │   │   ├── kg_service.py         #   知识图谱加载/检索
│   │   │   └── config_service.py     #   系统配置
│   │   ├── db/                       # 持久化（SQLite）
│   │   └── pipeline/                 # 索引管线（核心）
│   │       ├── __init__.py           #   Pipeline 调度
│   │       ├── content_list_loader.py #   MinerU → 纯文本
│   │       ├── graph_builder.py      #   extractions → 知识图谱
│   │       └── mineru_worker.py      #   MinerU API 封装
│   ├── .env                          # API Keys
│   └── .venv/                        # Python 虚拟环境
│
├── frontend/                         # 前端 2966 行 TypeScript
│   ├── src/
│   │   ├── api/                      # HTTP + SSE 客户端
│   │   ├── components/               # UI 组件（Chat/Graph/Upload）
│   │   ├── layouts/                  # 布局组件
│   │   ├── pages/                    # 页面（Workbench/Documents/Settings）
│   │   └── types/                    # TypeScript 类型定义
│   └── package.json
│
├── docs/                             # 9 份规范文档
│   ├── backend-service-architecture-v1.0.md
│   ├── frontend-architecture-v1.0.md
│   ├── agentic-rag-architecture-v1.0.md
│   ├── product-requirements-document-v1.0.md
│   └── ...
│
└── CLAUDE.md                         # 项目规范
```

---

## 六、简历项目经历写法

### 6.1 推荐格式（中文简历）

```
项目名称: GraphRAG 智能文档问答系统

项目时间: 2026.07

项目描述:
基于知识图谱与大语言模型（DeepSeek）构建的智能文档问答系统，实现从 PDF/Office 
文档上传到自动化知识图谱构建再到 AI 智能问答的全链路闭环。

技术栈:
Python · FastAPI · LangChain · React · TypeScript · D3.js · SQLite · DeepSeek · MinerU

我的职责:
- 设计并实现后端 17 个 RESTful + SSE 流式 API 端点（FastAPI）
- 基于 LangChain 构建 Agentic RAG 问答管线，实现多步工具调用与推理
- 设计知识图谱构建管线：文档解析（MinerU）→ 实体提取（LangExtract + DeepSeek）
  → 图谱构建，单文档平均产出 25+ 节点和 30+ 关系
- 实现 SSE 流式问答，支持 Agent 推理过程实时推送和前端打字机效果
- 基于 D3.js 实现知识图谱力导向图可视化，支持节点交互、图谱联动
- 使用 SQLite 实现对话历史持久化和多轮对话上下文管理
- 前端状态管理（React Hooks）+ 响应式布局 + 暗色模式

项目成果:
- 后端 2045 行 / 前端 2966 行 TypeScript 代码
- 完整支持 14 种文档格式上传解析
- Agent 问答平均响应 6.7 秒，对齐率 100%
- 系统已完整运行并通过 6 份医疗测试文档验证
```

### 6.2 推荐格式（英文简历）

```
GraphRAG — Intelligent Document QA System | Jul 2026

• Built a full-stack document QA system combining Knowledge Graph + LLM (DeepSeek),
  covering the complete pipeline from PDF upload to automated KG construction to AI Q&A
• Designed and implemented 17 RESTful + SSE streaming API endpoints with FastAPI
• Built Agentic RAG pipeline with LangChain, enabling multi-step tool calling and reasoning
• Designed KG construction pipeline: MinerU parsing → LangExtract entity extraction → 
  Graph Building (25+ nodes and 30+ relations per document on average)
• Implemented SSE streaming for real-time Agent reasoning visualization
• Built interactive KG visualization with D3.js force-directed graph
• SQLite for conversation persistence and multi-turn dialogue management
• Tech stack: Python, FastAPI, LangChain, React, TypeScript, D3.js, DeepSeek, SQLite
```

### 6.3 面试关键话术

**问：为什么这个项目有亮点？**

> "这个项目的核心创新在于用 GraphRAG 替代了传统的向量检索 RAG。传统 RAG 把文档切成 Chunk 做语义检索，这种方式有两个问题：一是检索结果像黑盒，你不知道为什么召回了这些内容；二是对于需要多跳推理的问题（比如'患者有什么症状？用什么药治疗？'），单纯靠语义相似度是解决不了的。GraphRAG 通过构建知识图谱，把实体和关系显式地表达出来，然后让 Agent 在图谱上做多步遍历和推理。每个回答都能精确溯源到文档的原文位置（char_interval），对齐率达到了 100%。"

**问：你在项目中遇到的最大挑战？**

> "最大的挑战是跨文档的 Agent 问答隔离。最开始所有 Agent 的 Tool 都查询'最新完成'的文档知识图谱，导致用户如果同时上传了多份病历，问 A 文档的问题时 Agent 可能返回 B 文档的内容。解决方式是在 _create_agent() 时通过闭包将指定文档的 KG 引用固定到 Tool 内部，而不是每次调用时动态查找。这个 bug 花了些时间定位，但修复后效果很明显——6 个测试文档各自的问答完全独立了。"

**问：为什么不直接用 OpenAI？**

> "选择了 DeepSeek V4 Flash 主要是考虑到成本效益。对于实体提取和知识图谱问答这个场景，DeepSeek 的表现完全够用，但它的 API 和 OpenAI 不完全兼容——比如不支持 json_schema 结构化输出。我们的应对方式是把 use_schema_constraints 设为 False，同时在 prompt 中强约束 JSON 格式。这其实也展示了项目的一个工程能力：不依赖单一模型提供商，通过抽象层适配不同模型。"

**问：和同类项目比，你的项目有什么不同？**

> "和目前主流的 RAG 框架（如 LangChain 自带的 RAG、LlamaIndex）相比，我的项目有两个差异点：一是数据流向不同——大部分框架走的是'文档→Chunk→向量库→检索'的路线，我走的是'文档→实体→知识图谱→图遍历'，这在需要精确理解实体关系的医疗、法律等场景中更有优势。二是前端体验更完整——不只是简单的问答界面，还有知识图谱可视化、Agent 推理过程透明化、文档管理、对话历史等功能。我认为作为一个完整的全栈 AI 应用，它在简历上能比较全面地展示技术能力。"

---

## 七、面试官可能问的问题

| 问题 | 答案要点 |
|------|----------|
| 为什么用 SQLite 不用 PostgreSQL？ | 单机部署、零配置、数据量小（文档记录+对话消息），不需要分布式 |
| LangChain 的 `create_agent` 和 `AgentExecutor` 有什么区别？ | `create_agent` 是 v1.0 新 API，高阶封装，自动处理 tool_calls |
| SSE 和 WebSocket 的区别？ | SSE 服务端→客户端单向，基于 HTTP，浏览器原生支持，实现简单 |
| 知识图谱存在内存里，百万级节点怎么办？ | MVP 阶段设计，生产可用 Neo4j 图数据库 + 缓存层 |
| DeepSeek 和 OpenAI 的差异？ | JSON Schema 支持、流式输出、成本（Flash 约 $0.14/M token） |
| 怎么做幻觉检测？ | 通过 `char_interval` 字段验证提取实体是否在原文中存在 |

---

## 八、项目部署与运行

```bash
# 1. 启动后端
cd GraphRAGAgent/backend
source .venv/Scripts/activate
python -m app.main
# → http://localhost:8765

# 2. 启动前端（另一个终端）
cd GraphRAGAgent/frontend
pnpm dev
# → http://localhost:8443
```

---

> **最后建议**: 面试时如果能**现场演示**这个项目，效果会比口头描述好得多。建议准备 2-3 个测试 PDF，现场上传 → 看图谱生成 → 提问，展示完整的流程。演示过程中的"意外"（比如加载慢、回答异常）反而是展示你 problem-solving 能力的好机会。
