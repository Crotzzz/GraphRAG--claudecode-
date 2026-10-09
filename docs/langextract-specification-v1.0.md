# LangExtract 规范文档 v1.0

> **版本**: 1.6.0
> **项目**: https://github.com/google/langextract
> **本文档基于**: 2026-07-15 源码分析 + MVP 实测验证
> **MVP 测试日期**: 2026-07-15
> **MVP 模型**: DeepSeek V4 Flash（通过 OpenAI 兼容协议接入）

---

## 目录

- [1. LangExtract Pipeline 完整执行流程](#1-langextract-pipeline-完整执行流程)
  - [1.1 Pipeline 架构总览](#11-pipeline-架构总览)
  - [1.2 虚拟环境切换](#12-虚拟环境切换)
  - [1.3 MVP 测试脚本位置](#13-mvp-测试脚本位置)
- [2. Pipeline 输入规范](#2-pipeline-输入规范)
  - [2.1 核心输入类型](#21-核心输入类型)
  - [2.2 字符串输入（单文档模式）](#22-字符串输入单文档模式)
  - [2.3 Document 对象输入（多文档模式）](#23-document-对象输入多文档模式)
  - [2.4 输入格式限制说明](#24-输入格式限制说明)
  - [2.5 DeepSeek 接入特殊配置](#25-deepseek-接入特殊配置)
- [3. 文本模型接入规范](#3-文本模型接入规范)
  - [3.1 Provider 系统架构](#31-provider-系统架构)
  - [3.2 内置 Provider 清单](#32-内置-provider-清单)
  - [3.3 模型路由机制与避坑](#33-模型路由机制与避坑)
  - [3.4 关键参数规范（实测验证）](#34-关键参数规范实测验证)
  - [3.5 环境变量配置](#35-环境变量配置)
- [4. Pipeline 输出数据格式规范](#4-pipeline-输出数据格式规范)
  - [4.1 输出数据结构总览](#41-输出数据结构总览)
  - [4.2 AnnotatedDocument](#42-annotateddocument)
  - [4.3 Extraction（核心提取单元）](#43-extraction核心提取单元)
  - [4.4 AlignmentStatus（对齐状态）](#44-alignmentstatus对齐状态)
  - [4.5 实测输出文件清单](#45-实测输出文件清单)
  - [4.6 实测 JSONL 完整示例](#46-实测-jsonl-完整示例)
  - [4.7 对齐统计与幻觉检测](#47-对齐统计与幻觉检测)
- [5. MVP 测试配置清单](#5-mvp-测试配置清单)

---

## 1. LangExtract Pipeline 完整执行流程

### 1.1 Pipeline 架构总览

LangExtract 管线采用 **同步阻塞调用** 架构：

```
┌─────────────────────────────────────────────────────────────┐
│                   LangExtract Pipeline                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  输入层                                                       │
│  ──────                                                       │
│  str / Iterable[Document]                                     │
│      │                                                        │
│      ▼                                                        │
│  处理层                                                       │
│  ──────                                                       │
│  ① 分词 (RegexTokenizer / UnicodeTokenizer)                   │
│     → TokenizedText (tokens[], text)                          │
│                                                              │
│  ② 分块 (ChunkIterator + SentenceIterator)                    │
│     → TextChunk[] (每块 ≤ max_char_buffer 字符)               │
│                                                              │
│  ③ 构建 Prompt (QAPromptGenerator)                            │
│     → description + few-shot examples + chunk_text            │
│     → DeepSeek 模式下自动添加 system "respond in JSON"         │
│                                                              │
│  ④ LLM 推理 (Provider.infer())                                │
│     → OpenAI Provider → POST /v1/chat/completions             │
│     → ScoredOutput(output="...JSON...")                       │
│                                                              │
│  ⑤ 解析 (FormatHandler.parse_output())                        │
│     → 提取 fence 内容 → JSON 解析 → wrapper key 提取           │
│                                                              │
│  ⑥ 对齐 (WordAligner.align_extractions())                     │
│     → DP 精确匹配 → LCS 模糊匹配 → char_interval 填充         │
│                                                              │
│      ▼                                                        │
│  输出层                                                       │
│  ──────                                                       │
│  AnnotatedDocument {                                          │
│    document_id, text,                                          │
│    extractions[]: {                                            │
│      extraction_class, extraction_text,                        │
│      char_interval, alignment_status, attributes               │
│    }                                                           │
│  }                                                             │
│                                                              │
│  输出格式:                                                     │
│  ▶ JSONL 存储 (lx.io.save_annotated_documents())              │
│  ▶ HTML 可视化 (lx.visualize())                                │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 虚拟环境切换

LangExtract 运行在独立的虚拟环境中，路径为 `langextract/.venv`。

**切换方式**：

```bash
# 手动激活（Git Bash，推荐）
cd D:\vibe coding\GraphRAGAgent\langextract
source .venv/Scripts/activate

# PowerShell
cd D:\vibe coding\GraphRAGAgent\langextract
.venv\Scripts\Activate.ps1

# Windows CMD
cd D:\vibe coding\GraphRAGAgent\langextract
.venv\Scripts\activate.bat
```

**环境信息**:

| 配置项 | 说明 |
|--------|------|
| 环境路径 | `D:\vibe coding\GraphRAGAgent\langextract\.venv` |
| Python 版本 | 3.11 |
| 包管理器 | pip（Tsinghua 镜像源） |
| langExtract | v1.6.0（editable 安装） |
| 已安装依赖 | 核心 18 个 + `openai` + `pytest` + `jupyter` |

> ⚠️ **重要**: `.venv` 位于 `langextract/` 目录下，**不是在项目根目录**。进入目录后可通过 `which python` 确认路径是否正确。

### 1.3 MVP 测试脚本位置

完整可运行的 MVP 测试管线位于：

```
D:\vibe coding\GraphRAGAgent\langextract/
├── .venv/                                # 虚拟环境（Python 3.11）
├── CLAUDE.md                             # LangExtract 组件规范
├── mvp_test/
│   ├── .env                              # DeepSeek API Key 配置
│   ├── run_langextract_mvp.py            # 主管线脚本（4 步骤）
│   └── output/{timestamp}/               # 自动生成的输出目录
│       ├── extractions.jsonl             # 结构化提取结果（核心输出）
│       └── summary.json                  # 处理摘要
├── langextract/                          # 核心源码
├── docs/
│   ├── langextract-specification.md       # 旧版规范
│   └── langextract-specification-v1.0.md  # 本文档
```

**运行方式**（已通过实际测试验证）：

```bash
# 进入 LangExtract 目录并激活虚拟环境
cd D:\vibe coding\GraphRAGAgent\langextract
source .venv/Scripts/activate

# 进入测试目录并运行
cd mvp_test
PYTHONIOENCODING=utf-8 python run_langextract_mvp.py
```

---

## 2. Pipeline 输入规范

### 2.1 核心输入类型

`lx.extract()` 函数的入口参数 `text_or_documents` 仅接受两种类型：

```python
from collections.abc import Iterable
from langextract.core import data

def extract(
    text_or_documents: str | Iterable[data.Document],
    ...
) -> list[data.AnnotatedDocument] | data.AnnotatedDocument:
```

| 类型 | 说明 | 映射的输出 |
|------|------|-----------|
| `str` | 单个文本字符串 | 返回单个 `AnnotatedDocument` |
| `Iterable[Document]` | 可迭代的 Document 对象序列 | 返回 `list[AnnotatedDocument]` |

> **关键限制**: LangExtract **不接收** PDF、DOCX、HTML、图片等原始文档格式。所有输入在进入 Pipeline 前必须是**纯文本字符串**。

### 2.2 字符串输入（单文档模式）

直接将文本作为 Python `str` 传入——这是 **MVP 采用的输入方式**：

```python
result = lx.extract(
    text_or_documents="患者因持续性胸痛伴呼吸困难3小时急诊入院。",
    prompt_description="Extract medical entities...",
    examples=[example],
    config=config,
)
# 返回: AnnotatedDocument
```

底层处理流程（`annotation.py:532` `annotate_text()`）：

```
str 输入
  → 封装为 Document(text=..., document_id=None)
  → annotate_documents() 处理
  → 返回 AnnotatedDocument
```

### 2.3 Document 对象输入（多文档模式）

```python
@dataclasses.dataclass
class Document:
    text: str                                         # 文档纯文本内容（唯一数据字段）
    additional_context: str | None = None             # 可选的额外上下文提示
    _document_id: str | None = None                   # 自动生成 "doc_xxxxxxxx" 格式 ID
    _tokenized_text: TokenizedText | None = None      # 缓存的分词结果
```

| 字段 | 类型 | 是否必须 | 说明 |
|------|------|----------|------|
| `text` | `str` | **是** | 文档的纯文本内容。所有后续的分块、推理、对齐都基于此字段 |
| `additional_context` | `str \| None` | 否 | 附加到 prompt 中的上下文信息，用于补充指令 |
| `document_id` | `str` | 自动 | 不传则自动生成 `doc_xxxxxx` 格式的唯一 ID |

### 2.4 输入格式限制说明

| 格式 | 原生支持 | 解决方案 |
|------|----------|----------|
| **纯文本 (.txt)** | ✅ 直接支持 | 直接作为 `str` 传入 |
| **CSV** | ✅ 部分支持 | 通过 `Dataset` 类加载，仅提取文本列 |
| **URL (纯文本)** | ✅ 支持 | 设置 `fetch_urls=True` |
| **PDF** | ❌ 不支持 | 需 MinerU 等工具预先提取文本 |
| **DOCX** | ❌ 不支持 | 需外部工具预先提取文本 |
| **图片/扫描件** | ❌ 不支持 | 需 OCR 或多模态模型预先处理 |

### 2.5 DeepSeek 接入特殊配置

接入 DeepSeek（或其他非 OpenAI 原生模型）时，需注意：

```python
from langextract.factory import ModelConfig

config = ModelConfig(
    model_id="deepseek-v4-flash",
    provider="openai",                    # ⚠️ 必须显式指定为 openai
    provider_kwargs={
        "api_key": "sk-xxx",              # DeepSeek API Key
        "base_url": "https://api.deepseek.com",  # DeepSeek 端点
    },
)

result = lx.extract(
    text_or_documents=doc_text,
    prompt_description=prompt,
    examples=examples,
    config=config,
    use_schema_constraints=False,          # ⚠️ DeepSeek 不支持 json_schema
    format_type=lx.data.FormatType.JSON,
)
```

> ⚠️ `^deepseek` 正则匹配到的是 **Ollama 路由**（`patterns.py:43`），必须通过 `provider="openai"` 显式指定，否则会报错。

---

## 3. 文本模型接入规范

### 3.1 Provider 系统架构

```
extract()
  → factory.create_model()           # 模型工厂
    → router.resolve(model_id)       # 根据 model_id 自动路由到对应 Provider 类
    → provider_class(**kwargs)       # 实例化 Provider
    → model.infer(batch_prompts)     # 执行推理
```

### 3.2 内置 Provider 清单

| Provider | 路由 Pattern | 模型示例 | 依赖 |
|----------|-------------|----------|------|
| **Gemini** | `^gemini` | `gemini-3.5-flash`, `gemini-2.5-pro` | `google-genai>=1.39.0`（默认依赖） |
| **OpenAI** | `^gpt-4`, `^gpt-5` | `gpt-4o`, `gpt-4o-mini` | `openai>=1.50.0`（可选 `[openai]`） |
| **Ollama** | `^gemma`, `^llama`, `^mistral`, `^qwen`, `^deepseek`... | `gemma2:2b`, `llama3.2:1b` | 无（HTTP 调用） |

### 3.3 模型路由机制与避坑

路由基于 **正则表达式匹配**（`providers/patterns.py`）：

```
"deepseek-v4-flash"
  → Ollama 匹配: ^deepseek → OllamaLanguageModel  ← ⚠️ 陷阱！
  → 正确方式: 使用 ModelConfig(provider="openai") 显式指定

"gpt-4o"
  → OpenAI 匹配: ^gpt-4 → OpenAILanguageModel ✓

"gemini-3.5-flash"
  → Gemini 匹配: ^gemini → GeminiLanguageModel ✓
```

**三种接入方式**（按推荐顺序）：

```python
# 方式一：ModelConfig（推荐，MVP 采用）
from langextract.factory import ModelConfig
config = ModelConfig(
    model_id="deepseek-v4-flash",
    provider="openai",
    provider_kwargs={"api_key": "...", "base_url": "https://api.deepseek.com"},
)
result = lx.extract(..., config=config)

# 方式二：直接传入 Model 实例（最高优先级）
from langextract.providers.openai import OpenAILanguageModel
model = OpenAILanguageModel(
    model_id="deepseek-v4-flash",
    api_key="...",
    base_url="https://api.deepseek.com",
)
result = lx.extract(..., model=model)

# 方式三：自动路由（仅限原生 OpenAI/Gemini 模型）
result = lx.extract(
    ..., model_id="gpt-4o-mini", api_key="..."
)
```

### 3.4 关键参数规范（实测验证）

**DeepSeek 接入时的参数设置**（已验证）：

| 参数 | 实测值 | 说明 |
|------|--------|------|
| `model_id` | `"deepseek-v4-flash"` | DeepSeek V4 Flash 模型 |
| `provider` | `"openai"` | **必须显式指定**，避免路由到 Ollama |
| `base_url` | `"https://api.deepseek.com"` | DeepSeek API 端点 |
| `api_key` | 通过 `.env` + `provider_kwargs` 传入 | 不推荐硬编码 |
| `use_schema_constraints` | `False` | DeepSeek **不支持** `json_schema`，设为 `False` 回退到 `json_object` 模式 |
| `format_type` | `JSON` | JSON 格式输出 |
| `max_char_buffer` | `2000` | 分块大小（MVP 文本无需分块） |
| `extraction_passes` | `1` | 单轮提取 |

**Schema 约束说明**:

| Provider | `json_schema` 支持 | `use_schema_constraints` | 说明 |
|----------|:------------------:|:------------------------:|------|
| Gemini | ✅ 支持 | `True`（默认） | 原生支持 `response_schema` |
| OpenAI | ✅ 支持 | `True`（默认） | 原生支持 `response_format` 的 `json_schema` 模式 |
| DeepSeek | ❌ 不支持 | **`False`** | 仅支持 `json_object` 模式，需在 prompt 中包含 "json" |

### 3.5 环境变量配置

| 环境变量 | 用途 | MVP 使用 |
|----------|------|:--------:|
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥 | ✅ `provider_kwargs` 传入 |
| `DEEPSEEK_BASE_URL` | DeepSeek API 端点 | ✅ 默认 `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | DeepSeek 模型 ID | ✅ 默认 `deepseek-v4-flash` |

---

## 4. Pipeline 输出数据格式规范

### 4.1 输出数据结构总览

LangExtract Pipeline 的输出经过三个层次：

```
LLM 原始输出（JSON 字符串）          ← Provider.infer() 返回
  → Resolver.resolve()              ← 解析 JSON → 提取 ordered_extractions
  → Resolver.align()                ← DP 精确匹配 + LCS 模糊匹配
  → AnnotatedDocument               ← 最终输出对象（含 21 个 Extraction）
```

### 4.2 AnnotatedDocument

**定义位置**: `langextract/core/data.py:206`

```python
@dataclasses.dataclass
class AnnotatedDocument:
    extractions: list[Extraction] | None = None   # 提取的所有实体
    text: str | None = None                       # 原始文本
    _document_id: str | None = None               # 文档唯一标识
    _tokenized_text: TokenizedText | None = None  # 缓存的分词结果
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `document_id` | `str` | 唯一标识符，格式 `doc_9686bb59`（8 位 hex） |
| `text` | `str \| None` | 文档的原始完整文本 |
| `extractions` | `list[Extraction] \| None` | 提取结果列表，每个包含实体、位置、属性等信息 |

### 4.3 Extraction（核心提取单元）

**定义位置**: `langextract/core/data.py:64`

```python
@dataclasses.dataclass(init=False)
class Extraction:
    extraction_class: str                                 # 提取类别（如 "patient", "symptom", "disease"）
    extraction_text: str                                  # 提取的原文文本（verbatim）
    char_interval: CharInterval | None = None             # 在原文中的字符位置区间
    alignment_status: AlignmentStatus | None = None       # 对齐状态
    extraction_index: int | None = None                   # 提取序号（用于排序）
    group_index: int | None = None                        # 分组序号（来自不同分块）
    description: str | None = None                         # 可选描述
    attributes: dict[str, str | list[str]] | None = None  # 属性字典
    _token_interval: TokenInterval | None = None           # Token 级别的间隔
```

| 字段 | 类型 | 始终存在 | 说明 |
|------|------|:--------:|------|
| `extraction_class` | `str` | ✅ | 提取类别标签，由用户定义的 prompt/examples 决定 |
| `extraction_text` | `str` | ✅ | LLM 从原文中提取的逐字文本片段 |
| `char_interval` | `CharInterval \| None` | ⚠️ | **为 `None` 表示 LLM 产生了幻觉，应过滤** |
| `alignment_status` | `AlignmentStatus \| None` | ⚠️ | `None` 表示对齐失败 |
| `attributes` | `dict \| None` | 否 | 属性字典，Key=属性名，Value=字符串 |
| `extraction_index` | `int \| None` | ✅ | 排序索引 |

**实测 `attributes` 示例**（MVP 真实输出）：

```json
{"name": "张三", "age": "45岁", "gender": "男", "patient_id": "20240715001"}
{"duration": "3小时", "部位": ""}
{"value": "36.8", "unit": "℃"}
{"项目名称": "CK-MB", "数值": "45", "单位": "U/L", "参考范围": "0-24U/L"}
{"dosage": "300mg", "frequency": "负荷剂量"}
```

### 4.4 AlignmentStatus（对齐状态）

**定义位置**: `langextract/core/data.py:43`

```python
class AlignmentStatus(enum.Enum):
    MATCH_EXACT = "match_exact"     # 完美精确匹配
    MATCH_GREATER = "match_greater" # 提取文本比匹配到的原文更长
    MATCH_LESSER = "match_lesser"   # 部分匹配
    MATCH_FUZZY = "match_fuzzy"     # LCS 模糊匹配（匹配度 ≥ 0.75）
```

| 状态 | 含义 | MVP 中出现次数 |
|------|------|:--------------:|
| `match_exact` | 在原文中找到完全一致的文本片段 | **15 个** |
| `match_fuzzy` | 通过 LCS 找到近似位置（≥75%） | **2 个**（硝苯地平控释片30mg qd、二甲双胍0.5g tid） |
| `match_lesser` | 部分精确匹配 | **1 个**（阿司匹林300mg负荷剂量） |
| `None` | 无法在原文中定位，**可能为幻觉** | **3 个**（持续性胸痛伴呼吸困难3小时、胸骨后压榨性疼痛、大汗淋漓） |

> **最佳实践**: 过滤未对齐的提取结果：`[e for e in result.extractions if e.char_interval]`

### 4.5 实测输出文件清单

**MVP 测试输出目录结构**（2026-07-15 运行）：

```
langextract/mvp_test/output/20260715_151813/
├── extractions.jsonl    (4.4 KB)   → 结构化提取结果
└── summary.json         (0.3 KB)   → 处理摘要
```

**文件说明**:

| 文件 | 大小 | 内容 | 说明 |
|------|:----:|------|------|
| `extractions.jsonl` | 4.4 KB | JSONL 格式 | 每行一个 `AnnotatedDocument` 的完整 JSON 序列化 |
| `summary.json` | 0.3 KB | JSON | 处理摘要（模型、耗时、统计等） |

### 4.6 实测 JSONL 完整示例

以下为 MVP 实际生成的 JSONL 数据（格式化后）：

```json
{
  "document_id": "doc_9686bb59",
  "text": "【患者信息】\n姓名: 张三  性别: 男  年龄: 45岁\n...",
  "extractions": [
    {
      "extraction_class": "patient",
      "extraction_text": "姓名: 张三  性别: 男  年龄: 45岁  病历号: 20240715001",
      "char_interval": { "start_pos": 7, "end_pos": 46 },
      "alignment_status": "match_exact",
      "extraction_index": 1,
      "group_index": 0,
      "description": null,
      "attributes": {
        "name": "张三",
        "age": "45岁",
        "gender": "男",
        "patient_id": "20240715001"
      }
    },
    {
      "extraction_class": "symptom",
      "extraction_text": "持续性胸痛伴呼吸困难3小时",
      "char_interval": null,
      "alignment_status": null,
      "extraction_index": 2,
      "group_index": 1,
      "description": null,
      "attributes": {
        "duration": "3小时",
        "部位": ""
      }
    }
  ]
}
```

**序列化规则**:
- 所有 `_` 开头的私有字段被跳过（如 `_token_interval`, `_tokenized_text`）
- `AlignmentStatus` 枚举转换为 `.value` 字符串（如 `"match_exact"`）
- `None` 值保留为 `null`
- `char_interval` 为 `null` 表示提取未对齐到原文

### 4.7 对齐统计与幻觉检测

**MVP 真实统计**:

| 指标 | 值 |
|------|:----:|
| 总实体数 | **21 个** |
| 精确对齐（MATCH_EXACT） | 15 个（71.4%） |
| 部分对齐（MATCH_LESSER） | 1 个（4.8%） |
| 模糊对齐（MATCH_FUZZY） | 2 个（9.5%） |
| **未对齐（潜在幻觉）** | **3 个（14.3%）** |
| 对齐成功率 | **85.7%** |

**未对齐分析（3 个）**:

| 提取文本 | 可能原因 |
|----------|----------|
| `"持续性胸痛伴呼吸困难3小时"` | 原文为"持续性胸痛伴呼吸困难"，LLM 添加了"3小时"（来自上下文"3小时前"） |
| `"胸骨后压榨性疼痛"` | 原文被换行/空格分割，LK 模糊匹配未能对齐 |
| `"大汗淋漓"` | 原文存在于段落中间，Tokenizer 分词后匹配不到 |

---

## 5. MVP 测试配置清单

### 5.1 必选配置

| 配置项 | 必填 | 说明 | MVP 值 |
|--------|:----:|------|--------|
| API Key | ✅ | DeepSeek API 密钥 | 通过 `.env` 配置 |
| `model_id` | ✅ | 模型标识符 | `deepseek-v4-flash` |
| `provider` | ✅ | **必须**显式指定为 `"openai"` | 避免路由到 Ollama |
| `base_url` | ✅ | API 端点 | `https://api.deepseek.com` |
| `prompt_description` | ✅ | 提取指令 | 定义实体类别 |
| `examples` | ✅（与 output_schema 二选一） | Few-shot 示例 | 1 条示例，含 6 类共 6 个实体 |

### 5.2 DeepSeek 特有配置

| 参数 | 值 | 原因 |
|------|:---:|------|
| `use_schema_constraints` | `False` | DeepSeek 不支持 `json_schema`，回退到 `json_object` 模式 |
| `fence_output` | 默认 | 自动配置为 `False`（无 Schema 时默认 `True`，但 OpenAI Provider 自动处理） |

### 5.3 依赖清单

```bash
# 安装 LangExtract（editable + 全部 extras）
cd D:\vibe coding\GraphRAGAgent\langextract
pip install -e ".[openai,test,notebook]"
```

### 5.4 快速 MVP 脚本

```python
import os
from dotenv import load_dotenv
from pathlib import Path
import langextract as lx
from langextract.factory import ModelConfig

load_dotenv(Path(__file__).parent / ".env")

# 1. 配置
config = ModelConfig(
    model_id=os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash"),
    provider="openai",
    provider_kwargs={
        "api_key": os.getenv("DEEPSEEK_API_KEY"),
        "base_url": os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
    },
)

# 2. 定义提取任务
example = lx.data.ExampleData(
    text="患者男性，65岁，因咳嗽咳痰3天就诊。BP 130/80mmHg。",
    extractions=[
        lx.data.Extraction("patient", "患者男性，65岁",
            attributes={"age": "65岁", "gender": "男性"}),
        lx.data.Extraction("symptom", "咳嗽咳痰3天",
            attributes={"duration": "3天"}),
    ],
)

# 3. 执行提取
result = lx.extract(
    text_or_documents="患者信息...",
    prompt_description="从医疗记录中提取实体",
    examples=[example],
    config=config,
    use_schema_constraints=False,
    format_type=lx.data.FormatType.JSON,
)

# 4. 输出
print(f"提取到 {len(result.extractions)} 个实体")
for ext in result.extractions:
    if ext.char_interval:
        print(f"  ✓ [{ext.extraction_class}] {ext.extraction_text}")
    else:
        print(f"  ? [{ext.extraction_class}] {ext.extraction_text} (未对齐)")
```
