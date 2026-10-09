# GraphRAG Bridge Pipeline 规范文档 v1.0

> **版本**: v1.0（基于实际 MVP 测试验证）
> **核心组件**: MinerU v4 (Precision API) + LangExtract v1.6.0 + Graph Builder
> **MVP 测试日期**: 2026-07-15
> **测试文档**: 中文急诊病历 PDF（2 页，75.2 KB）
> **测试模型**: DeepSeek V4 Flash (OpenAI 兼容模式)

---

## 目录

- [1. Bridge Pipeline 完整执行流程](#1-bridge-pipeline-完整执行流程)
  - [1.1 Pipeline 架构总览](#11-pipeline-架构总览)
  - [1.2 虚拟环境切换](#12-虚拟环境切换)
  - [1.3 MVP 测试脚本位置](#13-mvp-测试脚本位置)
  - [1.4 运行方式](#14-运行方式)
- [2. MinerU ↔ LangExtract 接口对接规范](#2-mineru--langextract-接口对接规范)
  - [2.1 数据桥接转换流程](#21-数据桥接转换流程)
  - [2.2 content_list → 纯文本转换规则](#22-content_list--纯文本转换规则)
  - [2.3 类型过滤规则](#23-类型过滤规则)
  - [2.4 LangExtract 输入参数规范](#24-langextract-输入参数规范)
- [3. MinerU Pipeline 关键参数规范](#3-mineru-pipeline-关键参数规范)
  - [3.1 精准模式参数表](#31-精准模式参数表)
  - [3.2 SDK 参数映射](#32-sdk-参数映射)
  - [3.3 模型版本选择](#33-模型版本选择)
- [4. LangExtract Pipeline 关键参数规范](#4-langextract-pipeline-关键参数规范)
  - [4.1 DeepSeek 接入参数表](#41-deepseek-接入参数表)
  - [4.2 提取模板规范](#42-提取模板规范)
  - [4.3 关键配置陷阱](#43-关键配置陷阱)
- [5. Bridge Pipeline 最终输出规范](#5-bridge-pipeline-最终输出规范)
  - [5.1 知识图谱数据结构总览](#51-知识图谱数据结构总览)
  - [5.2 节点（Node）规范](#52-节点node规范)
  - [5.3 关系（Relationship）规范](#53-关系relationship规范)
  - [5.4 元数据（Metadata）规范](#54-元数据metadata规范)
  - [5.5 实测输出文件清单](#55-实测输出文件清单)
  - [5.6 实测数据统计](#56-实测数据统计)
  - [5.7 对齐状态分布](#57-对齐状态分布)
  - [5.8 关系构建规则](#58-关系构建规则)
- [6. MVP 测试配置清单](#6-mvp-测试配置清单)
  - [6.1 必选配置](#61-必选配置)
  - [6.2 环境依赖清单](#62-环境依赖清单)

---

## 1. Bridge Pipeline 完整执行流程

### 1.1 Pipeline 架构总览

Bridge Pipeline 由三个阶段组成，跨越三个独立的模块：

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    GraphRAG 索引阶段 — Bridge Pipeline                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Phase 1: 文档解析 (MinerU)                                                   │
│  ─────────────────────────────────────────────────                          │
│                                                                             │
│  用户端                               MinerU 云端                              │
│  ──────                               ───────────                              │
│  PDF/DOCX/图片/PPT/Excel                                                     │
│      │                              POST /api/v4/file-urls/batch              │
│      ├── 本地文件路径 ──▶ 上传到预签名 URL (PUT)    │                          │
│      └── 公网 URL     ──▶ 直接提交                  │                          │
│                              │                       │                          │
│                              ▼                       ▼                          │
│                       轮询结果 ◀── GET /extract-results/batch/{id}            │
│                                                                             │
│  ▼ 输出: ExtractResult { content_list, markdown }                           │
│                                                                             │
│  Phase 2: 结构化提取 (LangExtract)                                            │
│  ─────────────────────────────────────────────────                          │
│                                                                             │
│  content_list.json                                                          │
│      │                                                                      │
│      ▼                                                                      │
│  content_list_loader.py  ← 桥接层（类型过滤 + 纯文本提取）                    │
│      │                                                                      │
│      ▼  input_text.txt                                                      │
│  LangExtract extract()                                                      │
│      │  → DeepSeek V4 Flash API                                             │
│      ▼                                                                      │
│  ▼ 输出: AnnotatedDocument { extractions[] }                                │
│                                                                             │
│  Phase 3: 知识图谱构建 (Graph Builder)                                        │
│  ─────────────────────────────────────────────────                          │
│                                                                             │
│  extractions.jsonl                                                          │
│      │                                                                      │
│      ▼                                                                      │
│  graph_builder.py                                                            │
│      │  ① 幻觉过滤 (char_interval is None → 丢弃)                           │
│      │  ② 去重 (class + text 相同 → 丢弃)                                   │
│      │  ③ 节点构建 (label/name/properties/source)                           │
│      │  ④ 关系构建 (按 RELATIONSHIP_RULES 规则)                             │
│      ▼                                                                      │
│  ▼ 输出: knowledge_graph.json { nodes[], relationships[], metadata }        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 虚拟环境切换

Bridge Pipeline 涉及两个独立虚拟环境，通过**文件桥接方案**进行数据传递：

| 模块 | 环境路径 | Python | 包管理 |
|------|----------|--------|--------|
| **MinerU** | `mineru_mvp_test/.venv` | 3.10 | uv 创建 + pip |
| **LangExtract** | `langextract/.venv` | 3.11 | pip |
| **content_list_loader.py** | 任意 Python 3 | ≥3.10 | 无额外依赖 |
| **graph_builder.py** | 任意 Python 3 | ≥3.10 | 无额外依赖 |

**环境切换命令**：

```bash
# 切换到 MinerU 环境
cd D:\vibe coding\GraphRAGAgent\mineru_mvp_test
source .venv/Scripts/activate

# 切换到 LangExtract 环境
cd D:\vibe coding\GraphRAGAgent\langextract
source .venv/Scripts/activate

# content_list_loader 和 graph_builder 可在系统 Python 运行
# 无需特定虚拟环境（纯标准库实现）
```

### 1.3 MVP 测试脚本位置

```
D:\vibe coding\GraphRAGAgent\
│
├── mineru_mvp_test/                      # MinerU 组件
│   ├── .venv/                            # 虚拟环境（Python 3.10）
│   ├── CLAUDE.md                         # MinerU 规范
│   ├── .env                              # MINERU_TOKEN
│   ├── run_mvp_pipeline.py               # MinerU 解析主管线
│   ├── generate_medical_pdf.py           # 中文医疗 PDF 生成器
│   ├── medical_record.pdf                # 测试用中文 PDF
│   └── output/{ts}/
│       ├── content_list.json             # ★ Phase 1 输出
│       └── full.md
│
├── langextract/                          # LangExtract 组件
│   ├── .venv/                            # 虚拟环境（Python 3.11）
│   ├── CLAUDE.md                         # LangExtract 规范
│   ├── mvp_test/
│   │   ├── .env                          # DEEPSEEK_API_KEY
│   │   └── run_langextract_mvp.py        # LangExtract 提取管线
│   └── langextract/                      # 核心源码
│
└── graphrag_pipeline/                    # ★ 集成管线目录
    ├── CLAUDE.md                         # Bridge Pipeline 规范（本文）
    ├── content_list_loader.py            # ★ Phase 1→2 桥接层
    ├── graph_builder.py                  # ★ Phase 2→3 图谱构建
    ├── run_integration.py                # ★ 跨环境协调主脚本
    └── output/{ts}/
        ├── input_text.txt                # ★ 桥接文件
        ├── extractions.jsonl             # ★ Phase 2 输出
        ├── knowledge_graph.json          # ★ Phase 3 输出（最终产物）
        └── summary.json                  # 处理摘要
```

### 1.4 运行方式

#### 方式 A：逐步运行（推荐调试）

```bash
# Step 1: MinerU 解析（需要 MinerU 环境）
cd D:\vibe coding\GraphRAGAgent\mineru_mvp_test
source .venv/Scripts/activate
python run_mvp_pipeline.py

# Step 2: content_list → 纯文本（系统 Python）
cd D:\vibe coding\GraphRAGAgent\graphrag_pipeline
python content_list_loader.py --input ../mineru_mvp_test/output/{ts}/content_list.json

# Step 3: LangExtract 提取（需要 LangExtract 环境）
cd D:\vibe coding\GraphRAGAgent\langextract
source .venv/Scripts/activate
cd mvp_test
python run_langextract_mvp.py --input ../../graphrag_pipeline/output/{ts}/input_text.txt

# Step 4: 知识图谱构建（系统 Python）
cd D:\vibe coding\GraphRAGAgent\graphrag_pipeline
python graph_builder.py --input ../graphrag_pipeline/output/{ts}/extractions.jsonl
```

#### 方式 B：一键集成（需要预先配置好两个环境）

```bash
# 使用最新 MinerU 输出
cd D:\vibe coding\GraphRAGAgent\graphrag_pipeline
python run_integration.py

# 指定 extractions.jsonl 跳过前两步（重复构建图谱）
python run_integration.py --extractions ../graphrag_pipeline/output/{ts}/extractions.jsonl
```

---

## 2. MinerU ↔ LangExtract 接口对接规范

### 2.1 数据桥接转换流程

```
MinerU ExtractResult.content_list (list[dict])
  │
  │  content_list_loader.py
  │  extract_text_from_content_list()
  │
  ▼
纯文本字符串 (str) ──→ input_text.txt
  │
  │  LangExtract run_langextract_mvp.py --input
  │  text_or_documents 参数
  │
  ▼
LangExtract AnnotatedDocument
```

### 2.2 content_list → 纯文本转换规则

```python
def extract_text_from_content_list(content_list: list[dict]) -> str:
    """从 MinerU content_list 中提取可读文本，保留阅读顺序。"""
    text_parts = []

    for block in content_list:
        block_type = block.get("type", "")

        # 跳过辅助块
        if block_type in ("header", "footer", "page_number", "discarded", "seal"):
            continue

        if block_type == "text":
            text = block.get("text", "")
            if text:
                text_parts.append(text)

        elif block_type == "table":
            table_body = block.get("table_body", "")
            if table_body:
                text_parts.append(f"[表格]\n{table_body}")
            else:
                caption = block.get("table_caption", [])
                if caption:
                    text_parts.append(f"[表格: {'; '.join(caption)}]")

        elif block_type == "equation":
            eq_text = block.get("text", "")
            if eq_text:
                text_parts.append(f"[公式]\n{eq_text}")

        elif block_type == "code":
            code_body = block.get("code_body", "") or block.get("text", "")
            if code_body:
                text_parts.append(f"[代码块]\n{code_body}")

        elif block_type in ("figure", "image"):
            caption = block.get("text", "") or ""
            img_path = block.get("img_path", "")
            text_parts.append(f"[图片: {caption or img_path}]")

        elif block_type == "list":
            items = block.get("list_items", [])
            if items:
                for item in items:
                    text_parts.append(f"  - {item}")
            else:
                text = block.get("text", "")
                if text:
                    text_parts.append(text)

        elif block_type == "title":
            text = block.get("text", "")
            if text:
                text_parts.append(text)

        else:
            text = block.get("text", "")
            if text:
                text_parts.append(f"[{block_type}] {text}")

    return "\n".join(text_parts)
```

### 2.3 类型过滤规则

| content_list type | 是否保留 | 提取方式 | 备注 |
|:-----------------:|:--------:|----------|------|
| `text` | ✅ 保留 | 直接取 `text` 字段 | 正文、标题均在此类型 |
| `title` | ✅ 保留 | 直接取 `text` 字段 | 部分版本的标题专用类型 |
| `table` | ✅ 保留 | 优先 `table_body`（HTML），降级 `table_caption` | 实测表格数据在 HTML 中 |
| `equation` | ✅ 保留 | 取 `text` 字段（LaTeX 格式） | 含 `$$` 围栏 |
| `code` | ✅ 保留 | 优先 `code_body`，降级 `text` | 含语言标记围栏 |
| `figure` / `image` | ✅ 保留 | 取 `text` 或 `img_path` | 仅保留描述文本 |
| `list` | ✅ 保留 | 优先 `list_items`，降级 `text` | 实测可能为独立 text 块 |
| `header` | ❌ 过滤 | — | VLM 模式可能保留 |
| `footer` | ❌ 过滤 | — | VLM 模式可能保留 |
| `page_number` | ❌ 过滤 | — | — |
| `discarded` | ❌ 过滤 | — | 被标记为丢弃的块 |
| `seal` | ❌ 过滤 | — | 印章 |

### 2.4 LangExtract 输入参数规范

当从 content_list 提取的纯文本送入 LangExtract 时，`extract()` 的关键参数如下：

```python
from langextract.factory import ModelConfig

config = ModelConfig(
    model_id="deepseek-v4-flash",
    provider="openai",                       # ⚠️ 必须显式指定
    provider_kwargs={
        "api_key": "sk-xxx",                 # DeepSeek API Key
        "base_url": "https://api.deepseek.com",
    },
)

result = lx.extract(
    text_or_documents=full_text,             # ← content_list 提取的纯文本
    prompt_description=prompt,               # 提取指令
    examples=examples,                       # Few-shot 示例
    config=config,
    use_schema_constraints=False,            # ⚠️ DeepSeek 不支持
    format_type=lx.data.FormatType.JSON,     # JSON 输出
    max_char_buffer=2000,                    # 分块大小
    debug=False,
    show_progress=True,
)
```

---

## 3. MinerU Pipeline 关键参数规范

### 3.1 精准模式参数表

| 参数 | 实测值 | 说明 | 必填 |
|------|--------|------|:----:|
| `source` | `./medical_record.pdf` | 本地 PDF 路径 | ✅ |
| `model` | `"vlm"` | 视觉语言模型（推荐） | ❌ 默认为 vlm |
| `ocr` | `True` | 中文文档建议开启 | ❌ |
| `formula` | `True` | 公式识别 | ❌ 默认 true |
| `table` | `True` | 表格识别 | ❌ 默认 true |
| `language` | `"ch"` | 文档语言 | ❌ |
| `timeout` | `300` | 轮询超时 | ❌ |

### 3.2 SDK 参数映射

| SDK 参数名 | API JSON 字段 | 类型 | 默认值 |
|-----------|:-------------:|:----:|:------:|
| `source` | `url` / `name` | `str` | 必填 |
| `model` | `model_version` | `str` | `"vlm"` |
| `ocr` | `is_ocr` | `bool \| None` | `None` |
| `formula` | `enable_formula` | `bool \| None` | `None` |
| `table` | `enable_table` | `bool \| None` | `None` |
| `language` | `language` | `str \| None` | `None` |

### 3.3 模型版本选择

| SDK 值 | API 值 | 适用场景 |
|:------:|:------:|----------|
| `"vlm"` | `"vlm"` | **推荐**，复杂版面、中文文档、多栏布局 |
| `"pipeline"` | `"pipeline"` | 简单版式、追求速度 |
| `"html"` | `"MinerU-HTML"` | .html 文件专用 |

---

## 4. LangExtract Pipeline 关键参数规范

### 4.1 DeepSeek 接入参数表

| 参数 | 实测值 | 说明 | 必填 |
|------|--------|------|:----:|
| `model_id` | `"deepseek-v4-flash"` | DeepSeek 模型 | ✅ |
| `provider` | `"openai"` | **必须指定**，避免路由到 Ollama | ✅ |
| `base_url` | `"https://api.deepseek.com"` | DeepSeek API 端点 | ✅ |
| `api_key` | 通过 `.env` 传入 | API 密钥 | ✅ |
| `use_schema_constraints` | `False` | DeepSeek 不支持 json_schema | ⚠️ |
| `format_type` | `"json"` | 输出格式 | ❌ |
| `max_char_buffer` | `2000` | 分块大小 | ❌ |
| `extraction_passes` | `1` | 单轮提取 | ❌ |

### 4.2 提取模板规范

**Prompt 模板（医疗领域 MVP）**：

```
你是一个信息提取助手。请从以下文档内容中提取结构化信息。

提取目标实体类别:
1. patient (患者): 患者姓名、年龄、性别、病历号
2. symptom (症状): 症状名称、部位、持续时间
3. disease (诊断): 疾病名称、分类/分期
4. medication (用药): 药物名称、剂量、用法
5. vital_sign (生命体征): 体征名称、测量值、单位
6. lab_result (化验结果): 项目名称、数值、单位、参考范围

要求:
- 逐字提取原文内容，不要改写或归纳
- 每个实体按出现顺序提取
- 输出必须为 JSON 格式
```

**Example 规范**：

```python
lx.data.ExampleData(
    text="患者男性，65岁，因咳嗽咳痰3天就诊。T 38.5℃，BP 130/80mmHg。"
         "诊断: 社区获得性肺炎。处方: 阿莫西林克拉维酸钾625mg tid",
    extractions=[
        lx.data.Extraction("patient", "患者男性，65岁",
            attributes={"name": "未知", "age": "65岁", "gender": "男性"}),
        lx.data.Extraction("symptom", "咳嗽咳痰3天",
            attributes={"duration": "3天"}),
        lx.data.Extraction("vital_sign", "T 38.5℃",
            attributes={"value": "38.5", "unit": "℃"}),
        # ...
    ],
)
```

### 4.3 关键配置陷阱

| 陷阱 | 说明 | 解决方案 |
|------|------|----------|
| `^deepseek` 路由到 Ollama | `patterns.py:43` 中 `^deepseek` 匹配 Ollama 路由 | 使用 `ModelConfig(provider="openai")` |
| `json_schema` 不可用 | DeepSeek 不支持 `response_format: {type: json_schema}` | 设置 `use_schema_constraints=False` |
| `api_key` 未设置 | SDK 需要 API Key | 通过 `.env` + `provider_kwargs` 传入 |

---

## 5. Bridge Pipeline 最终输出规范

### 5.1 知识图谱数据结构总览

最终产物 `knowledge_graph.json` 包含三个顶级字段：

```json
{
  "metadata": { ... },         // 处理统计信息
  "nodes": [ ... ],            // 实体节点列表
  "relationships": [ ... ]     // 关系边列表
}
```

### 5.2 节点（Node）规范

```json
{
  "id": "entity_doc_fa4d7411_0",
  "label": "patient",
  "name": "姓名：王小明    性别：男    年龄：58岁\n病历号：EMG20260715001",
  "properties": {
    "name": "王小明",
    "age": "58岁",
    "gender": "男"
  },
  "source": {
    "document_id": "doc_fa4d7411",
    "char_interval": { "start_pos": 16, "end_pos": 59 },
    "alignment_status": "match_exact",
    "context": "...姓名：王小明    性别：男    年龄：58岁..."
  }
}
```

| 字段 | 类型 | 始终存在 | 说明 |
|------|------|:--------:|------|
| `id` | `string` | ✅ | 唯一节点标识符，格式 `entity_{document_id}_{index}` |
| `label` | `string` | ✅ | 实体类别，来自 `extraction_class`。如 `patient`, `symptom`, `disease` |
| `name` | `string` | ✅ | 实体名称，来自 `extraction_text`，即原文逐字提取的文本 |
| `properties` | `dict` | ✅ | 实体属性，来自 `attributes`。非空字段 |
| `source.document_id` | `string` | ✅ | 来源文档 ID |
| `source.char_interval` | `dict` | ✅ | 原文字符定位 `{start_pos, end_pos}` |
| `source.alignment_status` | `string` | ✅ | 对齐状态 `match_exact/match_fuzzy/match_lesser` |
| `source.context` | `string` | ✅ | 实体周围的上下文文本片段（±30 字符） |

### 5.3 关系（Relationship）规范

```json
{
  "id": "rel_doc_fa4d7411_0",
  "type": "has_symptom",
  "source_id": "entity_doc_fa4d7411_0",
  "source_label": "patient",
  "source_name": "姓名：王小明  性别：男  年龄：58岁\n病历号：EMG20260715001",
  "target_id": "entity_doc_fa4d7411_1",
  "target_label": "symptom",
  "target_name": "持续性上腹痛伴恶心呕吐6小时",
  "properties": {},
  "document_id": "doc_fa4d7411"
}
```

| 字段 | 类型 | 始终存在 | 说明 |
|------|------|:--------:|------|
| `id` | `string` | ✅ | 唯一关系标识符，格式 `rel_{document_id}_{index}` |
| `type` | `string` | ✅ | 关系类型。如 `has_symptom`, `has_disease`, `has_medication` |
| `source_id` | `string` | ✅ | 源节点 ID |
| `source_label` | `string` | ✅ | 源节点类型 |
| `source_name` | `string` | ✅ | 源节点名称（便于调试） |
| `target_id` | `string` | ✅ | 目标节点 ID |
| `target_label` | `string` | ✅ | 目标节点类型 |
| `target_name` | `string` | ✅ | 目标节点名称（便于调试） |
| `properties` | `dict` | ✅ | 关系属性（当前为空） |
| `document_id` | `string` | ✅ | 所属文档 ID |

### 5.4 元数据（Metadata）规范

```json
{
  "total_extractions_input": 21,
  "hallucinations_filtered": 0,
  "duplicates_removed": 0,
  "total_nodes": 21,
  "total_relationships": 25,
  "node_types": {
    "patient": 1, "symptom": 3, "vital_sign": 4,
    "lab_result": 4, "disease": 4, "medication": 5
  },
  "relationship_types": {
    "has_symptom": 3, "has_disease": 4, "has_medication": 5,
    "has_vital_sign": 4, "has_lab_result": 4, "treated_with": 5
  },
  "built_at": "2026-07-15T16:26:58.790592"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `total_extractions_input` | `int` | LangExtract 输出的原始提取总数（未过滤前） |
| `hallucinations_filtered` | `int` | 因 `char_interval = None` 被过滤的幻觉数 |
| `duplicates_removed` | `int` | 因相同 label + name 被去重的节点数 |
| `total_nodes` | `int` | 最终有效节点数 |
| `total_relationships` | `int` | 最终有效关系数 |
| `node_types` | `dict` | 按 label 分组的节点数量统计 |
| `relationship_types` | `dict` | 按 type 分组的关系数量统计 |
| `built_at` | `string` | ISO 格式构建时间戳 |

### 5.5 实测输出文件清单

**MVP 实际生成的输出**：

```
graphrag_pipeline/output/20260715_162424/
├── input_text.txt            (1.2 KB)   → 从 content_list 提取的纯文本
├── extractions.jsonl         (4.6 KB)   → LangExtract 提取的 21 个实体
├── summary.json              (0.3 KB)   → 提取处理摘要
└── knowledge_graph.json      (24.1 KB)  → ★ 最终知识图谱（21 节点，25 关系）
```

### 5.6 实测数据统计

| 指标 | 值 |
|------|:----:|
| **原始提取数** | **21 个** |
| 幻觉过滤 | 0 个（0%） |
| 去重移除 | 0 个（0%） |
| **有效节点数** | **21 个** |
| **有效关系数** | **25 条** |
| 节点标签种类 | 6 种 |
| 关系种类 | 6 种 |
| 对齐率 | **100%**（21/21） |

**节点类型分布**：

| 类型 | 数量 | 占比 |
|------|:----:|:----:|
| `medication`（用药） | 5 | 23.8% |
| `vital_sign`（生命体征） | 4 | 19.0% |
| `lab_result`（化验结果） | 4 | 19.0% |
| `disease`（诊断） | 4 | 19.0% |
| `symptom`（症状） | 3 | 14.3% |
| `patient`（患者） | 1 | 4.8% |

**关系类型分布**：

| 关系 | 数量 | 语义 |
|------|:----:|------|
| `has_medication` | 5 | patient → medication |
| `treated_with` | 5 | disease → medication |
| `has_disease` | 4 | patient → disease |
| `has_vital_sign` | 4 | patient → vital_sign |
| `has_lab_result` | 4 | patient → lab_result |
| `has_symptom` | 3 | patient → symptom |

### 5.7 对齐状态分布

| 状态 | 数量 | 占比 | 说明 |
|------|:----:|:----:|------|
| `match_exact` | 15 | 71.4% | 完美精确匹配 |
| `match_fuzzy` | 2 | 9.5% | LCS 模糊匹配 |
| `match_lesser` | 4 | 19.0% | 部分精确匹配 |
| `match_greater` | 0 | 0% | — |
| `None`（未对齐/幻觉） | 0 | 0% | 实际 MVP 未出现 |

### 5.8 关系构建规则

当 `graph_builder.py` 处理节点时，按以下规则建立关系：

```python
RELATIONSHIP_RULES = {
    "has_symptom":        (["patient"],       ["symptom"]),
    "has_disease":        (["patient"],       ["disease"]),
    "has_medication":     (["patient"],       ["medication"]),
    "has_vital_sign":     (["patient"],       ["vital_sign"]),
    "has_lab_result":     (["patient"],       ["lab_result"]),
    "treated_with":       (["disease"],       ["medication"]),
}
```

**策略**：同文档内，源节点类型列表中的第一个实体，与目标节点类型列表中的所有实体建立关系。

---

## 6. MVP 测试配置清单

### 6.1 必选配置

| 配置项 | 所属模块 | 必填 | 说明 |
|--------|----------|:----:|------|
| `MINERU_TOKEN` | MinerU | ✅ | MinerU API Token（从 https://mineru.net 申请） |
| `DEEPSEEK_API_KEY` | LangExtract | ✅ | DeepSeek API Key |
| `DEEPSEEK_BASE_URL` | LangExtract | ✅ | `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | LangExtract | ❌ | 默认 `deepseek-v4-flash` |

### 6.2 环境依赖清单

#### MinerU 环境（`mineru_mvp_test/.venv`）

```bash
pip install mineru-open-sdk python-dotenv fpdf2
```

#### LangExtract 环境（`langextract/.venv`）

```bash
cd D:\vibe coding\GraphRAGAgent\langextract
pip install -e ".[openai]"
```

#### Bridge Pipeline 脚本（`graphrag_pipeline/`）

无额外依赖（纯标准库实现：`json`, `argparse`, `pathlib`, `datetime`, `subprocess`）。
