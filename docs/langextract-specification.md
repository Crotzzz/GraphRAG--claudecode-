# LangExtract 规范文档

> **版本**: 1.6.0  
> **项目**: https://github.com/google/langextract  
> **本文档基于**: 2026-07-10 源码分析

---

## 目录

- [1. Pipeline 输入规范](#1-pipeline-输入规范)
  - [1.1 核心输入类型](#11-核心输入类型)
  - [1.2 字符串输入（单文档模式）](#12-字符串输入单文档模式)
  - [1.3 Document 对象输入（多文档模式）](#13-document-对象输入多文档模式)
  - [1.4 URL 输入](#14-url-输入)
  - [1.5 CSV 数据集输入](#15-csv-数据集输入)
  - [1.6 输入格式限制说明](#16-输入格式限制说明)
  - [1.7 输入参数完整清单](#17-输入参数完整清单)
- [2. 文本模型接入规范](#2-文本模型接入规范)
  - [2.1 Provider 系统架构](#21-provider-系统架构)
  - [2.2 内置 Provider 清单](#22-内置-provider-清单)
  - [2.3 模型路由机制](#23-模型路由机制)
  - [2.4 抽象基类规范（BaseLanguageModel）](#24-抽象基类规范baselanguagemodel)
  - [2.5 Schema 约束接入规范](#25-schema-约束接入规范)
  - [2.6 自定义 Provider 接入规范](#26-自定义-provider-接入规范)
  - [2.7 模型连接参数汇总](#27-模型连接参数汇总)
- [3. Pipeline 输出数据格式规范](#3-pipeline-输出数据格式规范)
  - [3.1 输出数据结构总览](#31-输出数据结构总览)
  - [3.2 AnnotatedDocument](#32-annotateddocument)
  - [3.3 Extraction（核心提取单元）](#33-extraction核心提取单元)
  - [3.4 CharInterval（字符级定位）](#34-charinterval字符级定位)
  - [3.5 AlignmentStatus（对齐状态）](#35-alignmentstatus对齐状态)
  - [3.6 序列化输出格式（JSONL）](#36-序列化输出格式jsonl)
  - [3.7 LLM 原始响应格式](#37-llm-原始响应格式)
  - [3.8 可视化输出](#38-可视化输出)

---

## 1. Pipeline 输入规范

### 1.1 核心输入类型

LangExtract 的 `lx.extract()` 函数（定义于 `langextract/extraction.py:45`）的入口参数 `text_or_documents` 仅接受两种类型：

```python
def extract(
    text_or_documents: str | Iterable[data.Document],  # ← 唯一的输入通道
    ...
) -> list[data.AnnotatedDocument] | data.AnnotatedDocument:
```

| 类型 | 说明 | 映射的输出 |
|------|------|-----------|
| `str` | 单个文本字符串 | 返回单个 `AnnotatedDocument` |
| `Iterable[Document]` | 可迭代的 Document 对象序列 | 返回 `list[AnnotatedDocument]` |

> **⚠️ 关键限制**: LangExtract **不接收** PDF、DOCX、HTML、图片等原始文档格式。所有输入在进入 Pipeline 前必须是**纯文本字符串**。

### 1.2 字符串输入（单文档模式）

直接将文本作为 Python `str` 传入：

```python
# 最简形式
result = lx.extract(
    text_or_documents="Lady Juliet gazed longingly at the stars, her heart aching for Romeo",
    prompt_description="Extract characters and emotions",
    examples=[example],
    model_id="gemini-3.5-flash",
)
# 返回: AnnotatedDocument
```

**底层处理流程**（`annotation.py:532` `annotate_text()`）:

```
str 输入
  → 封装为 Document(text=..., document_id=None)
  → annotate_documents() 处理
  → 返回 AnnotatedDocument
```

### 1.3 Document 对象输入（多文档模式）

`Document` 类（定义于 `langextract/core/data.py:130`）是 LangExtract 中所有文档数据的载体：

```python
@dataclasses.dataclass
class Document:
    text: str                                         # 文档纯文本内容（唯一数据字段）
    additional_context: str | None = None             # 可选的额外上下文提示
    _document_id: str | None = None                   # 自动生成 "doc_xxxxxxxx" 格式 ID
    _tokenized_text: TokenizedText | None = None      # 缓存的分词结果（自动计算）
```

**字段详细说明**:

| 字段 | 类型 | 是否必须 | 说明 |
|------|------|----------|------|
| `text` | `str` | **是** | 文档的纯文本内容。所有后续的分块、推理、对齐都基于此字段 |
| `additional_context` | `str \| None` | 否 | 附加到 prompt 中的上下文信息，用于补充指令 |
| `document_id` | `str` | 自动 | 不传则自动生成 `doc_xxxxxx` 格式的唯一 ID；也可手动传入 |
| `tokenized_text` | `TokenizedText` | 自动 | `text` 属性被设置后，通过 tokenizer 自动计算并缓存 |

**多文档示例**:

```python
docs = [
    Document(text="Patient presents with chest pain and shortness of breath."),
    Document(text="Lab results show elevated troponin levels."),
]

results = lx.extract(
    text_or_documents=docs,       # ← 传入 Iterable[Document]
    prompt_description="Extract medical conditions and findings",
    examples=[example],
    model_id="gemini-3.5-flash",
)
# 返回: list[AnnotatedDocument]（每个 Document 对应一个）
```

### 1.4 URL 输入

当 `fetch_urls=True` 且字符串为 HTTP(S) URL 时，Pipeline 会自动下载文本内容：

```python
result = lx.extract(
    text_or_documents="https://www.gutenberg.org/files/1513/1513-0.txt",
    fetch_urls=True,              # ← 必须显式开启
    ...
)
```

**下载逻辑**（`io.py:265` `download_text_from_url()`）:

```
URL 输入
  → requests.get(url, stream=True)
  → 检查 Content-Type: text/*, application/json, application/xml 之一
  → 尝试编码解码: utf-8 → latin-1 → ascii → utf-16
  → 返回纯文本 str
```

> **安全注意**: `fetch_urls=True` 会引入 SSRF 风险（可访问内部元数据、localhost、DNS rebinding 等）。仅当 URL 来源可信且进程在沙箱中运行时启用。

### 1.5 CSV 数据集输入

`io.Dataset` 类（`io.py:43`）提供 CSV 文件到 Document 的转换：

```python
dataset = Dataset(
    input_path=Path("data.csv"),
    id_key="patient_id",      # 用作 document_id 的列名
    text_key="note_text",     # 用作 text 内容的列名
)

# dataset.load() 返回 Iterator[Document]
results = lx.extract(
    text_or_documents=dataset.load(delimiter=","),
    ...
)
```

**CSV 加载限制**:
- 仅支持 `.csv` 后缀文件
- 使用 `pandas.read_csv()` 读取
- `text_key` 列的内容必须是纯文本字符串
- 其他文件类型（.xlsx, .json, .parquet）均 **不支持**

### 1.6 输入格式限制说明

| 格式 | 原生支持 | 解决方案 |
|------|----------|----------|
| **纯文本 (.txt)** | ✅ 直接支持 | 直接作为 `str` 传入 |
| **CSV** | ✅ 部分支持 | 通过 `Dataset` 类加载，仅提取文本列 |
| **URL (纯文本)** | ✅ 支持 | 设置 `fetch_urls=True` |
| **PDF** | ❌ 不支持 | 需外部工具（PyMuPDF/fitz）预先提取文本 |
| **DOCX** | ❌ 不支持 | 需外部工具（python-docx）预先提取文本 |
| **HTML** | ❌ 不支持 | 需外部工具（BeautifulSoup）预先提取文本 |
| **图片/扫描件** | ❌ 不支持 | 需 OCR 或多模态模型预先处理 |
| **音频/视频** | ❌ 不支持 | 需外部语音转文字工具 |
| **JSON/XML** | ❌ 不支持 | 需外部工具解析为纯文本 |

### 1.7 输入参数完整清单

`extract()` 函数的完整参数（`extraction.py:45`）：

```python
def extract(
    # ──── 核心输入 ────
    text_or_documents: str | Iterable[data.Document],  # 文本或文档集合
    prompt_description: str | None = None,              # 提取指令描述
    examples: Sequence[Any] | None = None,              # Few-shot 示例（与 output_schema 二选一）

    # ──── 模型配置 ────
    model_id: str = "gemini-3.5-flash",                # 模型 ID（自动路由 provider）
    api_key: str | None = None,                         # API 密钥
    temperature: float | None = None,                   # 生成温度
    model_url: str | None = None,                       # 自托管模型端点 URL
    config: Any = None,                                 # ModelConfig 对象（显式指定 provider）
    model: Any = None,                                  # 预配置的模型实例（最高优先级）

    # ──── 输出格式 ────
    format_type: Any = None,                            # JSON 或 YAML
    fence_output: bool | None = None,                   # 是否使用 ```json 围栏
    use_schema_constraints: bool = True,                # 是否启用 Schema 约束
    output_schema: JsonSchema | None = None,            # 自定义输出 JSON Schema

    # ──── 分块与并行 ────
    max_char_buffer: int = 1000,                        # 每个分块的最大字符数
    batch_length: int = 10,                             # 每批处理的分块数
    max_workers: int = 10,                              # 并行 API 调用数
    extraction_passes: int = 1,                         # 顺序提取轮次（>1 提高召回率）
    context_window_chars: int | None = None,            # 跨分块上下文窗口（字符数）

    # ──── 其他 ────
    additional_context: str | None = None,              # 全局额外上下文
    fetch_urls: bool = False,                           # 是否将 URL 字符串作为网络请求
    debug: bool = False,                                # 调试模式
    show_progress: bool = True,                         # 显示进度条
    tokenizer: Tokenizer | None = None,                 # 自定义分词器
    ...
) -> list[data.AnnotatedDocument] | data.AnnotatedDocument:
```

---

## 2. 文本模型接入规范

### 2.1 Provider 系统架构

LangExtract 通过 **Provider 插件架构** 对接各类 LLM，核心位于 `langextract/providers/`：

```
extract()
  → factory.create_model()           # 模型工厂
    → router.resolve(model_id)       # 根据 model_id 自动路由到对应 Provider 类
    → provider_class(**kwargs)       # 实例化 Provider
    → model.infer(batch_prompts)     # 执行推理
```

**Provider 注册入口**（`pyproject.toml:94`）：

```toml
[project.entry-points."langextract.providers"]
gemini = "langextract.providers.gemini:GeminiLanguageModel"
ollama = "langextract.providers.ollama:OllamaLanguageModel"
openai = "langextract.providers.openai:OpenAILanguageModel"
```

### 2.2 内置 Provider 清单

| Provider | 路由 Pattern | 模型示例 | 依赖 | Schema 支持 |
|----------|-------------|----------|------|-------------|
| **Gemini** | `^gemini` | `gemini-3.5-flash`, `gemini-3.1-flash-lite`, `gemini-2.5-pro` | `google-genai>=1.39.0`（默认） | ✅ `response_schema` / `response_json_schema` |
| **OpenAI** | `^gpt-4`, `^gpt-5` | `gpt-4o`, `gpt-4o-mini`, `gpt-5` | `openai>=1.50.0`（可选 `[openai]`） | ✅ `json_schema` strict mode |
| **Ollama** | `^gemma`, `^llama`, `^mistral`, `^qwen`, `^deepseek`, ... | `gemma2:2b`, `llama3.2:1b`, `mistral:7b` | 无（HTTP 调用） | ⚠️ 仅 `format: json` 模式 |

> **Ollama 完整路由 Pattern**（`patterns.py`）: `gemma`, `llama`, `mistral`, `mixtral`, `phi`, `qwen`, `deepseek`, `command-r`, `starcoder`, `codellama`, `codegemma`, `tinyllama`, `wizardcoder`, `gpt-oss` 以及 HuggingFace 风格 ID。

### 2.3 模型路由机制

路由逻辑（`providers/router.py`）基于 **正则表达式匹配** 和 **优先级（Priority）**：

```
model_id = "gemini-3.5-flash"
  → 遍历注册的 Provider Pattern 列表
  → 找到匹配: ^gemini → GeminiLanguageModel（priority=10）

model_id = "gpt-4o"
  → 找到匹配: ^gpt-4 → OpenAILanguageModel（priority=10）

model_id = "gemma2:2b"
  → 找到匹配: ^gemma → OllamaLanguageModel（priority=10）
```

**显式指定 Provider**（当 model_id 路由冲突或需要覆盖时）：

```python
from langextract.factory import ModelConfig

result = lx.extract(
    text_or_documents=text,
    config=ModelConfig(
        model_id="my-custom-model",
        provider="openai",                                    # 显式指定
        provider_kwargs={"base_url": "https://custom.endpoint"},
    ),
    ...
)
```

**直接传入 Model 实例**（最高优先级，跳过路由）：

```python
from langextract.providers.ollama import OllamaLanguageModel

model = OllamaLanguageModel(
    model_id="gemma2:2b",
    model_url="http://localhost:11434",
)
result = lx.extract(
    text_or_documents=text,
    model=model,  # ← 直接传入实例，完全跳过路由
    ...
)
```

### 2.4 抽象基类规范（BaseLanguageModel）

所有 Provider 必须继承 `base_model.BaseLanguageModel`（`langextract/core/base_model.py:32`）：

```python
class BaseLanguageModel(abc.ABC):
    """所有 LLM Provider 的抽象基类。"""

    def __init__(self, constraint: Constraint | None = None, **kwargs):
        self._constraint = constraint or Constraint()
        self._schema: BaseSchema | None = None
        self._fence_output_override: bool | None = None
        self._extra_kwargs: dict = kwargs.copy()

    @abc.abstractmethod
    def infer(
        self, batch_prompts: Sequence[str], **kwargs
    ) -> Iterator[Sequence[ScoredOutput]]:
        """核心推理方法。
        
        Args:
            batch_prompts: 一批文本 prompt（纯文本字符串）
            **kwargs: 额外参数（temperature, max_output_tokens 等）
        
        Returns:
            Iterator[Sequence[ScoredOutput]]:
            每轮 yield 一个 list[ScoredOutput]，对应 batch_prompts 中的一个 prompt。
        """
        pass

    def infer_batch(
        self, prompts: Sequence[str], batch_size: int = 32
    ) -> list[list[ScoredOutput]]:
        """批量推理（便捷方法，收集所有 infer() 结果）。"""
        pass
```

**Provider 必须保证**:
1. `infer()` 接收 `Sequence[str]`（纯文本 prompt 列表）
2. 返回 `Iterator[Sequence[ScoredOutput]]`（对每个 prompt 返回一个评分输出列表）
3. `ScoredOutput` 包含 `score: float | None` 和 `output: str | None`

**可选覆写的方法**:
- `get_schema_class()` — 返回 Schema 类（支持结构化输出时覆写）
- `apply_schema()` — 应用 Schema 约束
- `apply_output_schema()` — 应用用户自定义输出 Schema

### 2.5 Schema 约束接入规范

当启用 `use_schema_constraints=True` 时，Pipeline 会从 few-shot examples 自动推导 JSON Schema 并传递给模型，实现结构化输出控制。

**Schema 类必须实现**（`langextract/core/schema.py`）：

```python
class BaseSchema(abc.ABC):
    @classmethod
    def from_examples(cls, examples_data: Sequence[ExampleData]) -> BaseSchema:
        """从示例数据推导出 Schema。"""
        pass

    @classmethod
    def from_schema_dict(cls, schema_dict: JsonSchema) -> BaseSchema:
        """从用户提供的 Schema 字典创建。"""
        pass

    def to_provider_config(self) -> dict[str, Any]:
        """转换为 Provider 可识别的配置参数。"""
        pass

    @property
    def requires_raw_output(self) -> bool:
        """该 Schema 是否输出纯文本（无需 fence 包装）。"""
        pass
```

**Gemini Schema 示例**（`providers/schemas/gemini.py:34`）：

```
GeminiSchema: from_examples() 生成
  {
    "type": "object",
    "properties": {
      "extractions": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "character": {"type": "string"},
            "character_attributes": {
              "type": "object",
              "properties": {...},
              "nullable": true
            }
          }
        }
      }
    },
    "required": ["extractions"]
  }
  
  → to_provider_config() 转换为:
    {
      "response_schema": <上述字典>,
      "response_mime_type": "application/json"
    }
  → requires_raw_output = True（原生输出 JSON，无需 fence）
```

**OpenAI Schema 示例**（`providers/schemas/openai.py`）：

```
OpenAISchema: from_examples() 生成类似的 JSON Schema
  
  → to_provider_config() 转换为:
    {
      "response_format": {
        "type": "json_schema",
        "json_schema": {"name": "extractions", "schema": <...>, "strict": true}
      }
    }
  → requires_raw_output = True
```

### 2.6 自定义 Provider 接入规范

通过 Entry Points 机制注册自定义 Provider，详见 `scripts/create_provider_plugin.py`：

```python
# my_provider.py
from langextract.core import base_model
from langextract.providers import router

@router.register(                     # 注册路由 Pattern
    r"^my-model",                     # 匹配 model_id
    priority=10,                      # 优先级
)
class MyModel(base_model.BaseLanguageModel):
    """自定义 Provider。"""
    
    def __init__(self, model_id: str, **kwargs):
        super().__init__(**kwargs)
        self.model_id = model_id
        # 初始化客户端连接...
    
    def infer(self, batch_prompts, **kwargs):
        for prompt in batch_prompts:
            response = self.client.generate(prompt)  # 调用自定义端点
            yield [ScoredOutput(score=1.0, output=response.text)]
    
    @classmethod
    def get_schema_class(cls):
        return MySchema  # 可选：返回 Schema 类
```

```python
# pyproject.toml 中注册
[project.entry-points."langextract.providers"]
my_provider = "my_package.my_provider:MyModel"
```

### 2.7 模型连接参数汇总

| 参数 | 适用 Provider | 说明 |
|------|---------------|------|
| `api_key` | Gemini, OpenAI | API 密钥（也可通过环境变量设置） |
| `model_id` | 全部 | 模型标识符 |
| `temperature` | 全部 | 采样温度（0.0 = 确定性） |
| `max_workers` | Gemini, OpenAI | 并行线程数 |
| `vertexai=True` | Gemini 专用 | 使用 Vertex AI 而非 API Key |
| `project` | Gemini (Vertex AI) | GCP 项目 ID |
| `location` | Gemini (Vertex AI) | Vertex AI 区域（如 `us-central1`） |
| `http_options` | Gemini 专用 | HTTP 客户端选项（含重试策略） |
| `max_retries` | Gemini 专用 | 最大重试次数（默认 3） |
| `base_url` | OpenAI, Ollama | API 端点 URL |
| `organization` | OpenAI 专用 | 组织 ID |
| `model_url` | Ollama 专用 | Ollama 服务 URL（默认 localhost:11434） |
| `batch.enabled` | Gemini, OpenAI | 是否启用 Batch API |
| `batch.threshold` | Gemini, OpenAI | 触发 Batch 的最小 prompt 数 |

**环境变量自动解析**（`factory.py:56` `_kwargs_with_environment_defaults()`）：

| 环境变量 | 用途 |
|----------|------|
| `LANGEXTRACT_API_KEY` | Gemini / OpenAI 通用后备密钥 |
| `GEMINI_API_KEY` | Gemini API 优先密钥 |
| `OPENAI_API_KEY` | OpenAI API 密钥 |
| `OLLAMA_BASE_URL` | Ollama 服务 URL（默认 http://localhost:11434） |

---

## 3. Pipeline 输出数据格式规范

### 3.1 输出数据结构总览

LangExtract Pipeline 的输出经过三个层次：

```
LLM 原始输出（字符串）           ← Provider.infer() 返回
  → Resolver.resolve()           ← 解析 JSON/YAML 为结构化字典
  → Resolver.align()             ← 对齐回源文本位置
  → AnnotatedDocument            ← 最终输出对象
```

### 3.2 AnnotatedDocument

**定义位置**: `langextract/core/data.py:206`

```python
@dataclasses.dataclass
class AnnotatedDocument:
    """标注文档：一个文档及其所有提取结果的容器。"""
    
    extractions: list[Extraction] | None = None   # 该文档中提取的所有实体
    text: str | None = None                       # 原始文本（可能为 None）
    _document_id: str | None = None               # 文档唯一标识
    _tokenized_text: TokenizedText | None = None  # 缓存的分词结果
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `document_id` | `str` | 唯一标识符，格式 `doc_xxxxxxxx`（8 位 hex）或用户指定 |
| `text` | `str \| None` | 文档的原始完整文本 |
| `extractions` | `list[Extraction] \| None` | 提取结果列表，每个包含实体、位置、属性等信息 |
| `tokenized_text` | `TokenizedText \| None` | 缓存的分词结果（内部使用，序列化时忽略） |

### 3.3 Extraction（核心提取单元）

**定义位置**: `langextract/core/data.py:64`

```python
@dataclasses.dataclass(init=False)
class Extraction:
    """代表从文本中提取的一个结构化信息单元。"""
    
    extraction_class: str                                  # 提取类别（如 "character", "medication", "symptom"）
    extraction_text: str                                   # 提取的原文文本（verbatim）
    char_interval: CharInterval | None = None              # 在原文中的字符位置区间
    alignment_status: AlignmentStatus | None = None         # 对齐状态
    extraction_index: int | None = None                    # 提取序号（用于排序）
    group_index: int | None = None                         # 分组序号（来自不同分块）
    description: str | None = None                         # 可选描述
    attributes: dict[str, str | list[str]] | None = None   # 属性字典
    _token_interval: TokenInterval | None = None            # Token 级别的间隔（内部使用）
```

**字段详细说明**:

| 字段 | 类型 | 始终存在 | 说明 |
|------|------|----------|------|
| `extraction_class` | `str` | ✅ | 提取类别标签，由用户定义的 prompt/examples 决定。例如 `"character"`, `"medication"`, `"symptom"` |
| `extraction_text` | `str` | ✅ | LLM 从原文中提取的逐字文本片段。理想情况下与原文完全匹配 |
| `char_interval` | `CharInterval \| None` | ⚠️ | 提取文本在原始文档中的精确字符位置。**为 None 表示 LLM 生成了原文中没有的内容（幻觉），应过滤** |
| `alignment_status` | `AlignmentStatus \| None` | ⚠️ | 对齐到原文的成功程度。None 表示对齐失败 |
| `extraction_index` | `int \| None` | ✅ | 提取实体的排序索引（在输出顺序中的位置） |
| `group_index` | `int \| None` | ✅ | 所属的分组索引（来自同一个分块/批次的提取归为一组） |
| `description` | `str \| None` | 否 | 可选的文本描述 |
| `attributes` | `dict \| None` | 否 | 属性字典。Key 为属性名，Value 为字符串或字符串列表。例如 `{"dosage": "10mg", "route": "oral"}` |
| `token_interval` | `TokenInterval \| None` | 内部 | Token 级位置信息，用于精确对齐计算（序列化时忽略） |

### 3.4 CharInterval（字符级定位）

**定义位置**: `langextract/core/data.py:51`

```python
@dataclasses.dataclass
class CharInterval:
    """表示原始文本中一个字符区间。"""
    
    start_pos: int | None = None    # 起始位置（包含）
    end_pos: int | None = None     # 结束位置（不包含）
```

- 使用 **Unicode 字符偏移**（非字节偏移）
- `start_pos` 指向提取文本的第一个字符（包含）
- `end_pos` 指向提取文本最后一个字符的下一个位置（不包含）
- 区间长度 = `end_pos - start_pos` = `len(extraction_text)`

```
示例:
原文: "Lady Juliet gazed longingly at the stars"
                    ↑──────↑
               start=5  end=18

extraction_text = "Juliet gazed longingly"
char_interval = CharInterval(start_pos=5, end_pos=18)
```

### 3.5 AlignmentStatus（对齐状态）

**定义位置**: `langextract/core/data.py:43`

```python
class AlignmentStatus(enum.Enum):
    MATCH_EXACT = "match_exact"     # 完美精确匹配：提取文本与原文完全一致
    MATCH_GREATER = "match_greater" # 提取文本比匹配到的原文更长
    MATCH_LESSER = "match_lesser"   # 部分匹配：提取文本长于精确匹配到的片段（默认接受）
    MATCH_FUZZY = "match_fuzzy"     # 模糊匹配：通过 LCS 算法找到最佳近似位置（匹配度 ≥ 0.75）
```

| 状态 | 含义 | 对齐算法 |
|------|------|----------|
| `MATCH_EXACT` | 提取文本在原文中找到了完全相同的内容 | 精确 DP 匹配 |
| `MATCH_LESSER` | 提取文本的一部分在原文中找到了精确匹配（通常因 LLM 添加了额外修饰） | 部分精确匹配 |
| `MATCH_FUZZY` | 通过最长公共子序列（LCS）找到了相似度 ≥ 75% 的位置 | LCS 模糊匹配 |
| `None` | 完全无法在原文中定位。**说明 LLM 产生了幻觉或杜撰** | — |

> **最佳实践**: 过滤未对齐的提取结果：`[e for e in result.extractions if e.char_interval]`

### 3.6 序列化输出格式（JSONL）

Pipeline 生成的 `AnnotatedDocument` 可通过 `io.save_annotated_documents()` 持久化为 **JSONL** 格式。

**序列化函数**（`data_lib.py:57` `annotated_document_to_dict()`）：

```python
def annotated_document_to_dict(adoc: AnnotatedDocument) -> dict:
    """将 AnnotatedDocument 转为可序列化的 Python 字典。"""
    return dataclasses.asdict(adoc, dict_factory=enum_asdict_factory)
```

**最终 JSONL 文件格式**（每行一个 JSON 对象）：

```jsonl
{
  "document_id": "doc_a1b2c3d4",
  "text": "Lady Juliet gazed longingly at the stars, her heart aching for Romeo",
  "extractions": [
    {
      "extraction_class": "character",
      "extraction_text": "Juliet",
      "char_interval": {
        "start_pos": 5,
        "end_pos": 11
      },
      "alignment_status": "match_exact",
      "extraction_index": 1,
      "group_index": 0,
      "description": null,
      "attributes": {
        "emotional_state": "longing"
      }
    },
    {
      "extraction_class": "emotion",
      "extraction_text": "gazed longingly",
      "char_interval": {
        "start_pos": 12,
        "end_pos": 27
      },
      "alignment_status": "match_exact",
      "extraction_index": 2,
      "group_index": 0,
      "description": null,
      "attributes": {
        "feeling": "yearning"
      }
    }
  ]
}
```

**序列化规则**:
- 所有 `_` 开头的私有字段被跳过（如 `_token_interval`, `_tokenized_text`）
- Enum 字段转换为 `.value` 字符串（如 `AlignmentStatus.MATCH_EXACT` → `"match_exact"`）
- `None` 值保留为 `null`
- 每行一个完整的 `AnnotatedDocument` 对象

**反序列化函数**（`data_lib.py:85` `dict_to_annotated_document()`）：

```python
def dict_to_annotated_document(adoc_dic: dict) -> AnnotatedDocument:
    """从字典恢复 AnnotatedDocument。
    
    自动将 token_interval/char_interval 字段从字典重建为对象，
    将 alignment_status 字符串转回 AlignmentStatus 枚举。
    """
```

### 3.7 LLM 原始响应格式

Provider 的 `infer()` 方法返回 `Iterator[Sequence[ScoredOutput]]`：

```python
@dataclasses.dataclass(frozen=True)
class ScoredOutput:
    """LLM 推理的评分输出。"""
    
    score: float | None = None    # 置信度得分（当前始终为 1.0）
    output: str | None = None     # LLM 返回的原始文本
```

**带 Schema 约束时的典型原始输出（Gemini）**:

```json
{
  "extractions": [
    {"character": "Juliet", "character_attributes": {"emotional_state": "longing"}},
    {"emotion": "gazed longingly", "emotion_attributes": {"feeling": "yearning"}}
  ]
}
```

**无 Schema 约束时的典型原始输出（使用 fence）**:

```json
{
  "extractions": [
    {"character": "Juliet", "character_attributes": {"emotional_state": "longing"}},
    {"emotion": "gazed longingly", "emotion_attributes": {"feeling": "yearning"}}
  ]
}
```

**`FormatHandler` 解析管线**（`format_handler.py`）:

```
LLM 原始输出
  → 提取 fence 内容（```json ... ``` 或 ```yaml ... ```）
  → 去除 model reasoning 标签（<think>...</think>）
  → JSON / YAML 解析
  → 提取 wrapper key（默认 "extractions"）
  → 按 extraction_index_suffix 排序
  → 拆分为 Extraction 对象列表
```

### 3.8 可视化输出

Pipeline 还支持通过 `lx.visualize()` 生成交互式 HTML 可视化报告：

```python
html_content = lx.visualize("extraction_results.jsonl")
with open("visualization.html", "w") as f:
    f.write(html_content.data)
```

可视化 HTML 包含：
- 原文高亮（根据 `char_interval` 定位）
- 按 extraction_class 分类的实体导航
- 实体属性面板展示
- 交互式筛选和搜索

---

## 附录：完整 Pipeline 数据流图

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 输入层 (Input Layer)                                                    │
│                                                                         │
│  str ──┐                                                                │
│         ├──▶ text_or_documents ──▶ Document(text=...)                   │
│  URL ──┘                                    │                          │
│                                               │ fetch_urls=True         │
│  CSV ──▶ Dataset.load() ──▶ Iterator[Document]│                        │
│                                               ▼                          │
│  Iterable[Document] ───────────────────▶ annotate_documents()            │
└─────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 处理层 (Processing Layer)                                               │
│                                                                         │
│  ① 分词 (RegexTokenizer / UnicodeTokenizer)                            │
│      → TokenizedText (tokens[], text)                                  │
│                                                                         │
│  ② 分块 (ChunkIterator)                                                │
│      → TextChunk[] (每个 ≤ max_char_buffer 字符)                        │
│                                                                         │
│  ③ 构建 Prompt (QAPromptGenerator)                                     │
│      → prompt = description + examples + chunk_text + context           │
│                                                                         │
│  ④ LLM 推理 (Provider.infer())                                          │
│      → ScoredOutput(output="...JSON/YAML...")                           │
│                                                                         │
│  ⑤ 解析 (FormatHandler.parse_output())                                 │
│      → list[dict]                                                       │
│                                                                         │
│  ⑥ 对齐 (WordAligner.align_extractions())                               │
│      → char_interval, token_interval, alignment_status 填充             │
└─────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 输出层 (Output Layer)                                                   │
│                                                                         │
│  AnnotatedDocument {                                                    │
│    document_id: "doc_a1b2c3d4",                                        │
│    text: "原文内容...",                                                  │
│    extractions: [                                                       │
│      Extraction {                                                       │
│        extraction_class: "character",         ← 用户定义的类别           │
│        extraction_text: "Juliet",             ← 原文逐字提取            │
│        char_interval: {start: 5, end: 11},    ← 原文字符定位            │
│        alignment_status: "match_exact",        ← 对齐置信度             │
│        attributes: {"emotion": "longing"}      ← 用户定义的属性          │
│      },                                                                 │
│      ...                                                                │
│    ]                                                                     │
│  }                                                                       │
│                                                                         │
│  ▶ 序列化: JSONL (io.save_annotated_documents())                       │
│  ▶ 可视化: HTML (visualization.visualize())                             │
└─────────────────────────────────────────────────────────────────────────┘
```
