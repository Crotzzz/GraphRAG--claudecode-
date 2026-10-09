# Agentic RAG 技术架构方案 v1.0（实测验证版）

> **版本**: v1.0（基于实际 MVP 测试验证）
> **测试日期**: 2026-07-17
> **框架**: LangChain v1.3 + LangGraph + DeepSeek V4 Flash
> **输入**: Bridge Pipeline 输出的 `knowledge_graph.json`（节点 + 关系）
> **底层支撑**:
>   - MinerU v4（文档解析）→ content_list.json
>   - LangExtract v1.6（实体提取）→ extractions.jsonl
>   - Graph Builder（图谱构建）→ knowledge_graph.json
> **参考文档**:
>   - `bridge-pipeline-specification-v1.0.md`
>   - `mineru-specification-v1.0.md`
>   - `langextract-specification-v1.0.md`
>   - https://docs.langchain.com (通过 MCP 实时获取)

---

## 目录

- [1. 完整执行流程与脚本位置](#1-完整执行流程与脚本位置)
  - [1.1 Pipeline 架构总览](#11-pipeline-架构总览)
  - [1.2 执行步骤详解](#12-执行步骤详解)
  - [1.3 虚拟环境配置](#13-虚拟环境配置)
  - [1.4 脚本与文件位置](#14-脚本与文件位置)
- [2. 全链路对接规范](#2-全链路对接规范)
  - [2.1 MinerU → content_list 规范](#21-mineru--content_list-规范)
  - [2.2 content_list → Knowledge Graph 规范](#22-content_list--knowledge-graph-规范)
  - [2.3 Knowledge Graph → LangChain Agent 规范](#23-knowledge-graph--langchain-agent-规范)
- [3. LangChain Agent 接入与关键参数规范](#3-langchain-agent-接入与关键参数规范)
  - [3.1 DeepSeek 接入 LangChain 参数表](#31-deepseek-接入-langchain-参数表)
  - [3.2 Tool 定义规范（实测版本）](#32-tool-定义规范实测版本)
  - [3.3 Agent 系统提示词规范](#33-agent-系统提示词规范)
  - [3.4 LangChain create_agent 参数表](#34-langchain-create_agent-参数表)
- [4. 核心问答技术架构](#4-核心问答技术架构)
  - [4.1 Agent 多步推理流程](#41-agent-多步推理流程)
  - [4.2 知识图谱检索机制](#42-知识图谱检索机制)
  - [4.3 幻觉防御机制](#43-幻觉防御机制)
- [5. 最终输出数据格式规范](#5-最终输出数据格式规范)
  - [5.1 Agent 回答格式规范](#51-agent-回答格式规范)
  - [5.2 实测回答类型分类](#52-实测回答类型分类)
  - [5.3 错误与边界处理](#53-错误与边界处理)
- [6. MVP 测试结果与统计](#6-mvp-测试结果与统计)
  - [6.1 测试指标](#61-测试指标)
  - [6.2 实测问答样本](#62-实测问答样本)
  - [6.3 工具调用统计](#63-工具调用统计)

---

## 1. 完整执行流程与脚本位置

### 1.1 Pipeline 架构总览

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    GraphRAG 完整技术栈                                      │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  Phase 1: MinerU 文档解析                                                   │
│  ──────────────────────────                                                │
│  PDF → MinerU API(VLM) → content_list.json (40 个内容块)                   │
│                                                                            │
│  Phase 2: LangExtract 实体提取                                              │
│  ──────────────────────────                                                │
│  content_list → 纯文本 → DeepSeek 提取 → extractions.jsonl (21 个实体)      │
│                                                                            │
│  Phase 3: Graph Builder 图谱构建                                            │
│  ──────────────────────────                                                │
│  extractions → 幻觉过滤 → 去重 → 关系构建 → knowledge_graph.json            │
│                        (21节点, 25关系, 6种实体类型)                        │
│                                                                            │
│  Phase 4: Agentic RAG 智能问答                                              │
│  ──────────────────────────                                                │
│  knowledge_graph.json → KnowledgeGraph 类 → LangChain Tools                │
│                                           → DeepSeek Agent                 │
│                                           → 多步推理回答                    │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 执行步骤详解

#### Phase 1-3: Bridge Pipeline（已完成）

| 步骤 | 组件 | 输入 | 输出 | 耗时 |
|:----:|------|------|------|:----:|
| ① | MinerU VLM | medical_record.pdf | content_list.json（40 块） | ~6s |
| ② | content_list_loader.py | content_list.json | input_text.txt（1242 字符） | ~0.5s |
| ③ | LangExtract + DeepSeek | input_text.txt | extractions.jsonl（21 实体） | ~11s |
| ④ | graph_builder.py | extractions.jsonl | knowledge_graph.json | ~1s |

#### Phase 4: Agentic RAG（实测通过）

| 步骤 | 操作 | 源码位置 | 说明 |
|:----:|------|----------|------|
| ⑤ | `KnowledgeGraph.__init__(kg_path)` | `kg_loader.py:15` | 加载 JSON，构建节点/关系索引 |
| ⑥ | `create_kg_agent()` | `kg_agent.py:54` | 初始化 `LangChain.create_agent` + DeepSeek |
| ⑦ | `agent.invoke({"messages": [...]})` | `kg_agent.py:89` | 用户提问 → Agent 多步推理 |
| ⑧ | Tool 自动调用 | `kg_tools.py` | Agent 按需调用 `retrieve_kg`/`query_graph`/`list_entities` |
| ⑨ | 返回最终回答 | `kg_agent.py:103` | 自然语言回答 |

### 1.3 虚拟环境配置

Agentic RAG 与 **LangExtract 共用同一虚拟环境**（因为都依赖 `langchain-openai` 和 DeepSeek SDK）：

```
环境路径: D:\vibe coding\GraphRAGAgent\langextract\.venv
Python: 3.11
依赖安装:
  pip install langchain langgraph langchain-openai langchain-community
```

### 1.4 脚本与文件位置

```
D:\vibe coding\GraphRAGAgent\
│
├── graphrag_pipeline/
│   ├── agentic_rag/                          # ★ Agentic RAG 模块
│   │   ├── __init__.py
│   │   ├── kg_loader.py                      # 知识图谱数据加载
│   │   ├── kg_tools.py                       # 3 个 LangChain Tool
│   │   ├── kg_agent.py                       # Agent 封装（create_agent + query）
│   │   ├── run_mvp.py                        # ★ MVP 测试入口
│   │   └── CLAUDE.md
│   │
│   ├── content_list_loader.py                # content_list → 纯文本
│   ├── graph_builder.py                      # extractions → 知识图谱
│   ├── run_integration.py                    # 跨环境协调
│   ├── viewer/                               # Web 查看器
│   │
│   ├── output/{ts}/
│   │   ├── input_text.txt
│   │   ├── extractions.jsonl
│   │   ├── knowledge_graph.json              # ★ Agent 输入文件
│   │   └── summary.json
│   │
│   └── agentic_rag/                          # （与上方同一目录）
│       ├── kg_loader.py                      # KnowledgeGraph 类
│       ├── kg_tools.py                       # 3 个 Tool
│       ├── kg_agent.py                       # Agent 封装
│       └── run_mvp.py                        # 测试入口
│
└── docs/
    ├── agentic-rag-architecture-v1.0.md       # ★ 本文档
    ├── bridge-pipeline-specification-v1.0.md
    ├── mineru-specification-v1.0.md
    └── langextract-specification-v1.0.md
```

**运行方式**：

```bash
# Step 1: 激活虚拟环境
cd D:\vibe coding\GraphRAGAgent\langextract
source .venv/Scripts/activate

# Step 2: 运行 Agentic RAG MVP
cd ../graphrag_pipeline/agentic_rag
PYTHONIOENCODING=utf-8 python run_mvp.py
```

---

## 2. 全链路对接规范

### 2.1 MinerU → content_list 规范（MinerU 输出）

**文档**：参考 `mineru-specification-v1.0.md §4.4`

MinerU 精准模式输出 `content_list.json`，是 LangExtract 的输入源。

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | `string` | 内容类型（text / table / equation / code） |
| `text` | `string` | 纯文本内容 |
| `text_level` | `int` | 标题层级（1=H1, 2=H2...） |
| `bbox` | `list[int]` | 归一化坐标 [x0, y0, x1, y1]，0-1000 |
| `page_idx` | `int` | 页码 |

**实测**：中文医疗 PDF → 40 个内容块（38 text + 2 table）

### 2.2 content_list → Knowledge Graph 规范（Bridge Pipeline 输出）

**文档**：参考 `bridge-pipeline-specification-v1.0.md §5`

`knowledge_graph.json` 是最终传递给 Agent 的数据文件：

```json
{
  "metadata": {
    "total_extractions_input": 21,
    "hallucinations_filtered": 0,
    "total_nodes": 21,
    "total_relationships": 25,
    "node_types": {"patient": 1, "symptom": 3, "disease": 4, ...},
    "relationship_types": {"has_symptom": 3, "has_disease": 4, ...}
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
      "type": "has_symptom",
      "source_id": "entity_doc_xxx_0",
      "source_label": "patient",
      "source_name": "王小明...",
      "target_id": "entity_doc_xxx_1",
      "target_label": "symptom",
      "target_name": "持续性上腹痛伴恶心呕吐6小时",
      "document_id": "doc_xxx"
    }
  ]
}
```

#### 实体类型枚举（实测验证）

| label | 实体类型 | 实测数量 | attributes 示例 |
|-------|----------|:--------:|-----------------|
| `patient` | 患者 | 1 | `name`, `age`, `gender` |
| `symptom` | 症状 | 3 | `duration`, `body_part`, `name` |
| `disease` | 诊断 | 4 | `classification` |
| `medication` | 用药 | 5 | `dosage`, `frequency` |
| `vital_sign` | 生命体征 | 4 | `value`, `unit` |
| `lab_result` | 化验结果 | 4 | `value`, `unit`, `reference_range` |

#### 关系类型枚举（实测验证）

| type | 语义 | 源→目标 | 实测数量 |
|------|------|---------|:--------:|
| `has_symptom` | 表现出症状 | patient → symptom | 3 |
| `has_disease` | 被诊断疾病 | patient → disease | 4 |
| `has_medication` | 使用药物 | patient → medication | 5 |
| `has_vital_sign` | 生命体征 | patient → vital_sign | 4 |
| `has_lab_result` | 化验结果 | patient → lab_result | 4 |
| `treated_with` | 治疗使用 | disease → medication | 5 |

### 2.3 Knowledge Graph → LangChain Agent 规范

`kg_loader.py` 中的 `KnowledgeGraph` 类将 JSON 图谱封装为可检索对象，对外暴露以下接口：

```python
class KnowledgeGraph:
    def search_nodes(self, keyword: str) -> list[dict]     # 关键词搜索实体
    def get_node(self, node_id: str) -> Optional[dict]      # 按 ID 获取实体
    def get_nodes_by_label(self, label: str) -> list[dict]  # 按类型获取实体
    def get_all_labels(self) -> list[str]                   # 获取所有实体类型
    def get_outgoing_relations(self, node_id) -> list[dict] # 出边关系
    def get_incoming_relations(self, node_id) -> list[dict] # 入边关系
    def get_entity_context(self, node_id) -> str            # 实体上下文
```

**Agent 通过 Tool 间接调用的示例**：

```
用户问："患者有哪些诊断？"
  → Agent 调用 retrieve_kg(keyword="诊断")
    → KnowledgeGraph.search_nodes("诊断") → 返回匹配实体
  → Agent 调用 query_graph(entity_name="王小明", relation_type="has_disease")
    → KnowledgeGraph.get_outgoing_relations("entity_0")
    → 过滤 type="has_disease" 的关系 → 返回诊断列表
  → Agent 综合结果生成回答
```

---

## 3. LangChain Agent 接入与关键参数规范

### 3.1 DeepSeek 接入 LangChain 参数表

通过 `LangChain` 的 `init_chat_model` 或 `ChatOpenAI` 接入 DeepSeek。

| 参数 | 实测值 | 说明 | 必填 |
|------|--------|------|:----:|
| `model` / `model_id` | `"deepseek-v4-flash"` | DeepSeek 模型 | ✅ |
| `model_provider` | `"openai"` | **必须指定**（兼容 OpenAI 协议） | ✅ |
| `api_key` | 通过 `.env` 的 `DEEPSEEK_API_KEY` | API 密钥 | ✅ |
| `base_url` | `"https://api.deepseek.com"` | DeepSeek API 端点 | ✅ |
| `temperature` | `0.0` | 确定性输出，减少幻觉 | ❌ |

**代码示例**（`kg_agent.py:69-75`）：

```python
from langchain.chat_models import init_chat_model

model = init_chat_model(
    "deepseek-v4-flash",                    # model_id
    model_provider="openai",                # 兼容 OpenAI 协议
    api_key="sk-xxx",                       # DeepSeek API Key
    base_url="https://api.deepseek.com",    # DeepSeek 端点
    temperature=0.0,                        # 降低幻觉
)
```

### 3.2 Tool 定义规范（实测版本）

MVP 实现了 **3 个 Tool**，均基于 `@tool` 装饰器定义：

#### Tool 1: `retrieve_kg`（关键词搜索）

```python
from langchain.tools import tool

@tool
def retrieve_kg(keyword: str) -> str:
    """从知识图谱中搜索与关键词相关的实体信息。
    适合回答"有哪些X"、"关于Y的信息"这类问题。"""
    kg = _get_kg()
    nodes = kg.search_nodes(keyword)
    # 返回格式: 
    #   找到 N 个相关实体:
    #   [实体类型] 实体名称 (属性1: 值1 | 属性2: 值2)
    #   ...
```

| 参数 | 类型 | 必须 | 说明 |
|------|------|:----:|------|
| `keyword` | `string` | ✅ | 搜索关键词，如"胰腺炎"、"王小明" |

**返回格式**：
```
找到 4 个相关实体:
[disease] 急性胰腺炎（水肿型） (classification: 水肿型)
[disease] 胆囊结石伴慢性胆囊炎 (classification: 无)
[disease] 高血压病3级（极高危） (classification: 3级（极高危）)
[disease] 高脂血症 (classification: 无)
```

#### Tool 2: `query_graph`（关系查询）

```python
@tool
def query_graph(entity_name: str, relation_type: str = "") -> str:
    """查询知识图谱中指定实体的关联关系和邻居节点。
    适合回答"X有哪些症状"、"X用了什么药"这类问题。"""
    kg = _get_kg()
    nodes = kg.search_nodes(entity_name)
    # 返回格式:
    #   === 实体类型: 实体名称 ===
    #   --[关系类型]--> [目标类型] 目标名称
    #   <--[关系类型]-- [源类型] 源名称
```

| 参数 | 类型 | 必须 | 默认值 | 说明 |
|------|------|:----:|:------:|------|
| `entity_name` | `string` | ✅ | — | 实体名称关键词 |
| `relation_type` | `string` | ❌ | `""` | 过滤关系类型，如 `has_disease` |

**返回格式**：
```
=== patient: 姓名：王小明  性别：男  年龄：58岁 ===
  --[has_symptom]--> [symptom] 持续性上腹痛伴恶心呕吐6小时
  --[has_disease]--> [disease] 急性胰腺炎（水肿型）
  --[has_medication]--> [medication] 硝苯地平控释片 30mg qd
  ...
```

#### Tool 3: `list_entities`（实体浏览）

```python
@tool
def list_entities(entity_type: str = "") -> str:
    """列出知识图谱中的所有实体类型，或指定类型的所有实体。
    不传参数时列出所有实体类型和数量。
    适合回答"有哪些诊断/用药"这类浏览型问题。"""
```

| 参数 | 类型 | 必须 | 默认值 | 说明 |
|------|------|:----:|:------:|------|
| `entity_type` | `string` | ❌ | `""` | 实体类型，如 `disease` / `medication` |

**返回格式（不传参）**：
```
知识图谱共 21 个实体，25 条关系
实体类型:
  - disease: 4 个
  - lab_result: 4 个
  - medication: 5 个
  - patient: 1 个
  - symptom: 3 个
  - vital_sign: 4 个
```

**返回格式（指定类型）**：
```
disease (4 个):
  - 急性胰腺炎（水肿型） (classification: 水肿型)
  - 胆囊结石伴慢性胆囊炎 (classification: 无)
  - 高血压病3级（极高危） (classification: 3级（极高危）)
  - 高脂血症 (classification: 无)
```

### 3.3 Agent 系统提示词规范

```python
KG_SYSTEM_PROMPT = """你是医疗知识图谱分析助手。你拥有一个完整的医疗病历知识图谱，
包含患者信息、症状、诊断、用药、生命体征和化验结果等实体，以及它们之间的关系。

## 可用的工具
1. **retrieve_kg(keyword)** — 搜索与关键词相关的实体信息
2. **query_graph(entity_name, relation_type?)** — 查询实体的关联关系
3. **list_entities(entity_type?)** — 浏览实体类型和清单

## 回答规则
1. 用户提问后，必须先分析问题需要哪些信息
2. 使用工具获取相关信息，不要凭空编造
3. 如果第一次检索结果不充分，可以多尝试不同关键词
4. 回答时引用知识图谱中的具体信息，说明实体之间的关系
5. 如果知识图谱中没有相关信息，如实告知用户
6. 回答要结构清晰、易于理解"""
```

### 3.4 LangChain create_agent 参数表

```python
from langchain.agents import create_agent

agent = create_agent(
    model=model,                           # DeepSeek ChatOpenAI 实例
    tools=tools,                           # [retrieve_kg, query_graph, list_entities]
    system_prompt=KG_SYSTEM_PROMPT,        # 系统提示词
    name="KG_Agentic_RAG",                 # Agent 名称
)
```

| 参数 | 类型 | 必须 | 说明 |
|------|------|:----:|------|
| `model` | `ChatModel` | ✅ | DeepSeek 通过 `ChatOpenAI` / `init_chat_model` 封装 |
| `tools` | `list[StructuredTool]` | ✅ | `@tool` 装饰器定义的工具列表 |
| `system_prompt` | `str` | ❌ | Agent 系统提示词 |
| `name` | `str` | ❌ | Agent 名称标识 |
| `response_format` | `dict` | ❌ | 输出格式约束（实测未使用） |
| `checkpointer` | `BaseCheckpointer` | ❌ | 对话记忆（实测未使用） |

---

## 4. 核心问答技术架构

### 4.1 Agent 多步推理流程

```
用户提问 "患者有哪些诊断？"
    │
    ▼
┌─────────────────────┐
│ DeepSeek Agent 推理  │   ← Agent 分析问题，判断需要调用工具
│ (第一步)             │
└─────────┬───────────┘
          │
          ▼ 决定调用 query_graph(entity_name="王小明", relation_type="has_disease")
    ┌─────┴──────┐
    │ query_graph │   ← Tool 遍历图谱，返回 4 条诊断关系
    │ (Tool 调用)  │
    └─────┬──────┘
          │
          ▼ 返回:
      === patient: 姓名：王小明 ... ===
        --[has_disease]--> [disease] 急性胰腺炎（水肿型）
        --[has_disease]--> [disease] 胆囊结石伴慢性胆囊炎
        --[has_disease]--> [disease] 高血压病3级（极高危）
        --[has_disease]--> [disease] 高脂血症
          │
          ▼
┌─────────────────────┐
│ DeepSeek Agent 推理  │   ← Agent 基于检索结果生成回答
│ (第二步)             │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ 最终回答             │   ← 结构化表格 + 分析总结
│ "该患者共确诊4项疾病:  │
│ 1. 急性胰腺炎...     │
│ 2. 胆囊结石...      │
│ ..."                │
└─────────────────────┘
```

### 4.2 知识图谱检索机制

Agentic RAG 不依赖 Embedding/向量库，使用**纯图遍历 + 关键词匹配**：

```
检索引擎               适用场景             速度
─────────             ──────────           ─────
search_nodes(keyword)  实体关键词搜索        <10ms
   ↓
get_outgoing_relations  关系遍历（出边）      <1ms
get_incoming_relations  关系遍历（入边）      <1ms
   ↓
get_entity_context     实体上下文聚合        <1ms
```

**数据在内存中的索引结构**：

```python
# kg_loader.py 中构建的内存索引
self._node_by_id = {node["id"]: node}              # O(1) 查询
self._nodes_by_label = {label: [node, ...]}         # O(1) 按类型
self._rels_by_source = {source_id: [rel, ...]}      # O(1) 出边
self._rels_by_target = {target_id: [rel, ...]}      # O(1) 入边
```

### 4.3 幻觉防御机制

| 机制 | 实现方式 | 效果 |
|------|----------|------|
| **Tool 强制检索** | System Prompt 要求"必须先分析需要哪些信息，使用工具获取" | Agent 不会凭空回答 |
| **源数据溯源** | Node 中包含 `source.char_interval` + `source.alignment_status` | Agent 可引用原文位置 |
| **未知识别** | Prompt 要求"如果知识图谱中没有相关信息，如实告知" | 实测"药物过敏"问题未编造 |
| **多关键词重试** | 允许 Agent 用不同关键词多次检索 | 提高召回率 |
| **temperature=0** | 确定性输出，降低随机编造概率 | 实测有效 |

---

## 5. 最终输出数据格式规范

### 5.1 Agent 回答格式规范

Agent 的回答通过 `response["messages"][-1].content` 获取，为纯文本字符串。

**通用结构**：
```
[引言/背景说明]
    ↓
[核心回答主体]
  ├── 表格（Markdown 格式）
  ├── 列表（数字/符号列表）
  └── 分析段落
    ↓
[结论/总结（可选）]
```

### 5.2 实测回答类型分类

#### 类型 A：列表型（浏览类问题）

**问题**："患者有哪些诊断？"
**回答格式**（结构化列表 + 表格）：

```
该患者共确诊 4 项疾病：

| 序号 | 诊断名称 | 备注 |
|:---:|:---------|:----:|
| 1 | 急性胰腺炎（水肿型） | 主要诊断 |
| 2 | 胆囊结石伴慢性胆囊炎 | 相关疾病 |
| 3 | 高血压病3级（极高危） | 慢性病 |
| 4 | 高脂血症 | 代谢疾病 |
```

**特征**：表格结构 + 序号 + 备注列

#### 类型 B：综合型（综合推理类问题）

**问题**："总结一下这位患者的整体情况"
**回答格式**（多段落 + 多表格）：

```
## 基本信息
| 项目 | 内容 |
|------|------|
| 姓名 | 王小明 | 性别 | 男 | 年龄 | 58岁 |

## 诊断结果（共4项）
1. 急性胰腺炎...
...

## 用药方案（5种）
| 药物 | 用法 | 用途 |
|------|------|------|

## 化验结果
| 项目 | 数值 | 参考意义 |
|------|:----:|:--------:|

## 综合分析
> 总结段落...
```

**特征**：Markdown 二级标题分段 + 多角度表格聚合 + 首尾综合分析

#### 类型 C：分析型（数据分析类问题）

**问题**："患者的化验结果有哪些异常？"
**回答格式**（数据表格 + 医学分析）：

```
| 检查项目 | 结果值 | 参考范围 | 判定 |
|:--------:|:-----:|:--------:|:---:|
| WBC | 14.5×10⁹/L | 3.5-9.5 | ↑ 偏高 |
| CRP | 68 mg/L | <10 | ↑ 偏高 |
| AMY | 1250 U/L | 30-110 | ↑↑ 显著偏高 |

分析结论：
1. WBC+NEUT%+CRP升高 → 感染/炎症
2. AMY显著升高 → 急性胰腺炎
```

**特征**：带状态标记（↑/↓/正常）的数据表 + 分点医学解读

#### 类型 D：否定型（未找到信息）

**问题**："患者对什么药物过敏？"
**回答格式**（诚实告知 + 补充信息 + 建议）：

```
知识图谱中未记录该患者的药物过敏信息。
搜索"过敏"关键词也未找到相关实体。

同时可以告诉您该患者的其他信息：（补充诊断/用药）

建议：
1. 查阅原始病历或过敏史记录
2. 直接询问患者...
```

**特征**：明确告知缺失 + 提供替代信息 + 给出后续建议

#### 类型 E：枚举型（实体浏览）

**问题**："知识图谱中有哪些实体类型？"
**回答格式**（统计表格）：

```
知识图谱共 21 个实体，25 条关系

| 实体类型 | 含义 | 数量 |
|:--------:|:---:|:----:|
| patient | 患者 | 1 |
| disease | 诊断 | 4 |
| symptom | 症状 | 3 |
| medication | 用药 | 5 |
| vital_sign | 生命体征 | 4 |
| lab_result | 化验结果 | 4 |
```

### 5.3 错误与边界处理

| 场景 | 实测行为 | 返回内容 |
|------|----------|----------|
| 图谱中无相关信息 | Agent 诚实告知 | "知识图谱中未找到..." |
| 关键词模糊匹配不到 | 返回空结果提示 | "未找到与「关键词」相关的实体" |
| Agent 工具调用失败 | 抛出异常被捕获 | `[错误] {异常信息}` |
| 模型 API 超时 | `timeout` 异常 | 脚本层面捕获 |

---

## 6. MVP 测试结果与统计

### 6.1 测试指标

| 指标 | 值 |
|------|:----:|
| **测试问题数** | **10 个** |
| **成功率** | **100%（10/10）** |
| **总耗时** | **66.7 秒** |
| **平均单题耗时** | **6.7 秒** |
| **工具调用方式** | Agent 自动选择 |
| **错误回答数** | **0 个**（含未编造） |
| **DeepSeek Token 消耗** | 由 API 自动计费 |

### 6.2 单题耗时分布

| 问题类型 | 问题 | 耗时 | 工具调用次数 |
|----------|------|:----:|:-----------:|
| 枚举型 | 实体类型有哪些？ | 3.2s | 1 |
| 综合型 | 患者基本信息 | 7.8s | 3+ |
| 列表型 | 有哪些诊断？ | 4.7s | 2 |
| 列表型 | 有哪些症状？ | 4.2s | 2 |
| 列表型 | 用了哪些药物？ | 5.5s | 2 |
| 分析型 | 胰腺炎用什么药？ | 7.5s | 3 |
| 列表型 | 生命体征？ | 8.1s | 2 |
| 分析型 | 化验异常？ | 6.3s | 2 |
| 否定型 | 药物过敏？ | 9.0s | 2 |
| 综合型 | 整体总结？ | 10.4s | 3+ |

### 6.3 工具调用统计

| Tool | 调用率 | 典型触发问题 |
|------|:-----:|-------------|
| `retrieve_kg`（关键词搜索） | ~90% | 所有实体查询型问题 |
| `query_graph`（关系查询） | ~70% | "有哪些诊断/症状/用药" |
| `list_entities`（实体浏览） | ~20% | "有哪些实体类型" |

---

## 附录：与全体架构的集成全景

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         GraphRAG 完整数据流                                │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  PDF/图片/Office                                                          │
│     │                                                                    │
│     ▼                                                                    │
│  ┌──────────────┐     ┌─────────────────┐     ┌──────────────────────┐   │
│  │ MinerU       │     │ LangExtract     │     │ Graph Builder        │   │
│  │ (文档解析)    │────▶│ (实体提取)      │────▶│ (图谱构建)           │   │
│  │              │     │                 │     │                      │   │
│  │ content_list │     │ extractions     │     │ knowledge_graph.json │   │
│  │ .json        │     │ .jsonl          │     │ {nodes[], rels[]}    │   │
│  └──────────────┘     └─────────────────┘     └──────────┬───────────┘   │
│                                                          │               │
│                     Bridge Pipeline (已完成)              │               │
│                                                          ▼               │
│                                               ┌──────────────────────┐   │
│                                               │ Agentic RAG          │   │
│                                               │ (KG 问答系统)        │   │
│                                               │                      │   │
│                                               │ KnowledgeGraph 类    │   │
│                                               │ → 关键词搜索          │   │
│                                               │ → 图遍历              │   │
│                                               │                      │   │
│                                               │ LangChain Tools      │   │
│                                               │ → retrieve_kg()      │   │
│                                               │ → query_graph()      │   │
│                                               │ → list_entities()    │   │
│                                               │                      │   │
│                                               │ DeepSeek V4 Agent    │   │
│                                               │ → 多步推理            │   │
│                                               │ → 工具调用           │   │
│                                               │ → 最终回答           │   │
│                                               │                      │   │
│                                               │ 输出: 结构化Markdown  │   │
│                                               │ 表格/列表/分析/总结    │   │
│                                               └──────────────────────┘   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```
