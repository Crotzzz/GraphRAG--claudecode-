# MinerU 文档解析 API 规范文档 v1.0

> **版本**: v1.0（基于实际 MVP 测试验证）
> **SDK 版本**: `mineru-open-sdk` (最新)
> **API 版本**: v4 (Precision) / v1 (Flash/Agent)
> **官方文档**: https://mineru.net/apiManage/docs
> **MVP 测试日期**: 2026-07-14
>
> **本文档说明**: 本文档结合官方 API 文档与实际 MVP 测试运行结果编写。所有与官方文档不一致之处，**以本地实际运行输出为准**。

---

## 目录

- [1. MinerU Pipeline 完整执行流程](#1-mineru-pipeline-完整执行流程)
  - [1.1 Pipeline 架构总览](#11-pipeline-架构总览)
  - [1.2 精准模式（Precision）执行步骤](#12-精准模式precision执行步骤)
  - [1.3 Flash 模式执行步骤](#13-flash-模式执行步骤)
  - [1.4 虚拟环境切换](#14-虚拟环境切换)
  - [1.5 MVP 测试脚本位置](#15-mvp-测试脚本位置)
- [2. 支持的输入文件格式](#2-支持的输入文件格式)
- [3. Pipeline 关键参数规范](#3-pipeline-关键参数规范)
  - [3.1 SDK 参数映射（重要）](#31-sdk-参数映射重要)
  - [3.2 精准模式关键参数](#32-精准模式关键参数)
  - [3.3 Flash 模式关键参数](#33-flash-模式关键参数)
  - [3.4 模型版本选择](#34-模型版本选择)
  - [3.5 环境变量配置](#35-环境变量配置)
- [4. 输出数据格式规范](#4-输出数据格式规范)
  - [4.1 SDK ExtractResult 对象](#41-sdk-extractresult-对象)
  - [4.2 Image 对象](#42-image-对象)
  - [4.3 full.md — Markdown 输出格式](#43-fullmd--markdown-输出格式)
  - [4.4 content_list.json — 结构化内容列表（核心）](#44-content_listjson--结构化内容列表核心)
  - [4.5 ZIP 包原始文件清单](#45-zip-包原始文件清单)
  - [4.6 实测文件与实际类型分布](#46-实测文件与实际类型分布)
- [5. 布局信息详解](#5-布局信息详解)
- [6. MVP 测试配置清单](#6-mvp-测试配置清单)

---

## 1. MinerU Pipeline 完整执行流程

### 1.1 Pipeline 架构总览

MinerU 文档解析管线采用 **异步提交 + 轮询结果** 架构：

```
┌─────────────────────────────────────────────────────────────┐
│                     MinerU Pipeline                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  用户端                               MinerU 云端              │
│  ──────                               ───────────              │
│                                                              │
│  ① 准备文件                                                    │
│     ├── 本地文件路径  ──▶  上传到预签名 URL (PUT)               │
│     └── 公网 URL     ──▶  直接提交 URL                          │
│                              │                                 │
│  ② 提交任务 ──────────────▶  POST /api/v4/extract/task/batch  │
│                              │   返回 batch_id                 │
│                              ▼                                 │
│  ③ 轮询结果 ◀──────────────  GET /extract-results/batch/{id}   │
│     每隔 2s~30s 指数退避       │   返回 state + zip_url          │
│                              ▼                                 │
│  ④ 下载 ZIP ◀──────────────  GET {full_zip_url}               │
│      │                                                         │
│      ▼                                                         │
│  ⑤ 解析 ZIP                                                    │
│     ├── full.md               → result.markdown                │
│     ├── *_content_list.json   → result.content_list             │
│     ├── images/*.jpg          → result.images[]                 │
│     ├── *.docx/*.html/*.tex   → result.docx/html/latex         │
│     └── *_model.json          → (zip 内保留)                    │
│                                                              │
│  ⑥ 保存到本地                                                   │
│     └── output/{timestamp}/                                    │
│         ├── full.md                                            │
│         ├── content_list.json                                  │
│         ├── summary.json                                       │
│         └── images/                                            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 精准模式（Precision）执行步骤

**步骤说明**（对应 SDK `client.extract()` 的内部流程）：

| 步骤 | 操作 | HTTP 调用 | 说明 |
|:----:|------|-----------|------|
| ① | **文件准备** | — | 判断输入是 URL 还是本地路径 |
| ②a | **URL 输入** | `POST /api/v4/extract/task/batch` | 直接提交 URL，SDK 将 URL 放入 `files[].url` |
| ②b | **本地文件上传** | `POST /api/v4/file-urls/batch` → 获得预签名上传 URL → `PUT {upload_url}` → 上传文件内容 | 先获取上传链接，再逐个上传文件 |
| ③ | **创建任务** | 上一步返回 `batch_id` | 一个 batch 可包含 1~200 个文件 |
| ④ | **轮询等待** | `GET /api/v4/extract-results/batch/{batch_id}` | 间隔 2s 起，指数退避至 30s，直到所有任务 `state` 为 `done` 或 `failed` |
| ⑤ | **下载结果** | `GET {full_zip_url}` | 下载 ZIP 包到内存 |
| ⑥ | **解析 ZIP** | — | 将 ZIP 内容解析为 `ExtractResult` 对象 |
| ⑦ | **返回结果** | — | 返回 `state=done` 的 `ExtractResult` |

### 1.3 Flash 模式执行步骤

与精准模式类似，但端点不同且返回更少字段：

```
本地文件 → POST /api/v1/agent/parse/file → 获取 task_id
URL 文件  → POST /api/v1/agent/parse/url  → 获取 task_id

轮询: GET /api/v1/agent/parse/{task_id}
完成: state=done, markdown_url → 下载 full.md 文本（无 JSON/无图片）
```

### 1.4 虚拟环境切换

MinerU 组件运行在独立的 **Python 虚拟环境** 中，与其他组件（如 LangExtract）进行环境隔离。

**虚拟环境信息**:

| 配置项 | 说明 |
|--------|------|
| 环境路径 | `D:\vibe coding\GraphRAGAgent\mineru_mvp_test\.venv` |
| Python 版本 | 3.10（`uv venv --python 3.10` 创建） |
| 包管理器 | **uv**（环境创建）+ pip（依赖安装，因 Windows trampoline 限制） |
| 已安装依赖 | `mineru-open-sdk`, `python-dotenv`, `fpdf2` |

**切换方式**:

```bash
# 方法一：手动激活（Git Bash，推荐）
cd D:\vibe coding\GraphRAGAgent\mineru_mvp_test
source .venv/Scripts/activate

# 方法二：手动激活（PowerShell）
cd D:\vibe coding\GraphRAGAgent\mineru_mvp_test
.venv\Scripts\Activate.ps1

# 方法三：指定绝对路径的 Python 直接运行（无需手动激活）
D:\vibe coding\GraphRAGAgent\mineru_mvp_test\.venv\Scripts\python run_mvp_pipeline.py
```

> ⚠️ **重要**: 
> 1. `.venv` 位于 `mineru_mvp_test/` 目录下，**不在项目根目录**
> 2. 执行任何 MinerU 相关代码前，必须确认已处于 `mineru_mvp_test/.venv` 环境中
> 3. 可通过 `which python` 检查路径是否指向 `mineru_mvp_test/.venv/Scripts/python`
> 4. 环境激活的完整规范说明见 `mineru_mvp_test/CLAUDE.md`

### 1.5 MVP 测试脚本位置

完整可运行的 MVP 测试管线位于：

```
D:\vibe coding\GraphRAGAgent\mineru_mvp_test/
├── .venv/                          # uv 管理的虚拟环境（Python 3.10）
├── CLAUDE.md                       # MinerU 组件规范（含环境激活说明）
├── .env                            # API Token + 模型配置
├── generate_sample_pdf.py          # 样本 PDF 生成器
├── sample_document.pdf             # 生成的测试 PDF（2 页英文）
├── run_mvp_pipeline.py             # 主管线脚本（5 步骤）
└── output/{timestamp}/             # 自动生成的输出目录
    ├── full.md                     # Markdown 结果
    ├── content_list.json           # 结构化内容列表
    ├── summary.json                # 处理摘要
    └── images/                     # 提取图片
```

**运行方式**（已通过实际测试验证）：

```bash
# 标准方式：进入 MinerU 目录并激活虚拟环境
cd D:\vibe coding\GraphRAGAgent\mineru_mvp_test
source .venv/Scripts/activate
PYTHONIOENCODING=utf-8 python run_mvp_pipeline.py

# 或直接指定 venv 的 Python（无需 cd）
D:\vibe coding\GraphRAGAgent\mineru_mvp_test\.venv\Scripts\python \
  D:\vibe coding\GraphRAGAgent\mineru_mvp_test\run_mvp_pipeline.py
```

---

## 2. 支持的输入文件格式

MinerU 精准解析 API 支持的原始文档格式（与官方一致，已验证 PDF 格式可正常解析）：

| 类别 | 格式 | 扩展名 | 精准 API | Flash API | MVP 已验证 |
|------|------|--------|:---------:|:---------:|:----------:|
| **PDF** | Adobe PDF | `.pdf` | ✅ | ✅ | ✅ 通过 |
| **图片** | PNG / JPEG / WebP / BMP / GIF | `.png .jpg .jpeg .webp .bmp .gif` | ✅ | ✅ | — |
| **Word** | Word 文档 | `.doc .docx` | ✅ | ✅ | — |
| **PowerPoint** | PPT 演示文稿 | `.ppt .pptx` | ✅ | ✅ | — |
| **Excel** | 电子表格 | `.xls .xlsx` | ✅ | ✅ | — |
| **HTML** | 网页 | `.html .htm` | ✅（自动切换 `MinerU-HTML`） | ❌ | — |

**文件限制**（已准确验证）：

| 限制项 | 精准 API | Flash API |
|--------|:--------:|:---------:|
| 单文件上限 | **≤ 200 MB** | ≤ 10 MB |
| 页数上限 | **≤ 600 页** | ≤ 20 页 |
| 批量数量 | **≤ 200 个文件** | 仅单文件 |

---

## 3. Pipeline 关键参数规范

### 3.1 SDK 参数映射（重要）

SDK 封装后的参数名与底层 API 的 JSON 字段名**不同**，以下是完整映射表：

| SDK 参数名 | API JSON 字段 | 类型 | 默认值 | 说明 |
|-----------|:-------------:|:----:|:------:|------|
| `source` | `url` / `name` | `str` | **必填** | 文件 URL 或本地路径 |
| `model` | `model_version` | `str \| None` | `"vlm"`（自动推断） | 见 3.4 节 |
| `ocr` | `is_ocr` | `bool \| None` | `None`（不发送） | 仅显式设置时发送 |
| `formula` | `enable_formula` | `bool \| None` | `None`（不发送） | API 默认 `true` |
| `table` | `enable_table` | `bool \| None` | `None`（不发送） | API 默认 `true` |
| `language` | `language` | `str \| None` | `None`（不发送） | API 默认 `"ch"` |
| `pages` | `page_ranges` | `str \| None` | `None` | 如 `"1-10,15"` |
| `extra_formats` | `extra_formats` | `list[str] \| None` | `None` | 可选值: `"docx"`, `"html"`, `"latex"` |
| `timeout` | — | `int` | `300` | 轮询超时秒数 |
| `file_params` | — | `dict[str, FileParam]` | `None` | 按文件覆盖参数 |

> ⚠️ **重要**: SDK 参数名与 API 字段名不同。在查阅官方 API 文档时请注意此映射。

### 3.2 精准模式关键参数

SDK 中 `client.extract()` 的完整签名（来源: `client.py:213-226`）：

```python
def extract(
    self,
    source: str,                           # URL 或本地文件路径（必填）
    *,
    model: str | None = None,              # "vlm" | "pipeline" | "html"
    ocr: bool | None = None,               # OCR 开关（仅显式设置时发送）
    formula: object = _SENTINEL,           # 公式识别（不传则不覆盖 API 默认）
    table: object = _SENTINEL,             # 表格识别（不传则不覆盖 API 默认）
    language: object = _SENTINEL,          # 文档语言（不传则不覆盖 API 默认）
    pages: str | None = None,              # 页码范围 "1-10,15"
    extra_formats: list[str] | None = None, # ["docx", "html", "latex"]
    file_params: dict[str, FileParam] | None = None,  # 按文件覆盖
    timeout: int = 300,                    # 轮询超时秒数
) -> ExtractResult
```

**FileParam 字段**（用于批量处理时按文件单独控制，来源 `client.py:61-78`）：

```python
@dataclass
class FileParam:
    pages: str = ""          # 页码范围（覆盖全局 pages）
    ocr: bool | None = None  # OCR 开关（覆盖全局 ocr）
    data_id: str = ""        # 自定义业务标识
```

### 3.3 Flash 模式关键参数

```python
def flash_extract(
    self,
    source: str,                            # URL 或本地文件路径（必填）
    *,
    language: str = "ch",                   # 文档语言（默认 "ch"）
    page_range: str | None = None,          # 页码范围
    is_ocr: bool | None = None,             # OCR 开关
    enable_formula: bool | None = None,     # 公式识别
    enable_table: bool | None = None,       # 表格识别
    timeout: int = 300,                     # 轮询超时秒数
) -> ExtractResult
```

> **注意**: Flash 模式只返回 `result.markdown` 字段，**不含** `content_list`、`images`、`docx`、`html`、`latex`。

### 3.4 模型版本选择

SDK 内部模型名到 API 模型名的映射（来源 `client.py:27-31`）：

```python
_MODEL_MAP = {
    "pipeline": "pipeline",    # 传统管线模型：速度更快，适合简单版式
    "vlm": "vlm",              # 视觉语言模型：精度更高，推荐用于复杂版式
    "html": "MinerU-HTML",     # HTML 专用模型：处理 .html 文件时必须使用
}
```

**自动推断规则**（来源 `client.py:47-48`）：

```python
def _infer_model(source: str) -> str:
    return "MinerU-HTML" if 扩展名 in (".html", ".htm") else "vlm"
```

| 模型 | SDK 参数值 | API 字段值 | 适用场景 | MVP 推荐 |
|------|:----------:|:----------:|----------|:--------:|
| **VLM** | `"vlm"` | `"vlm"` | **复杂版面**、多栏布局、扫描件、图文混排 | ⭐ 推荐 |
| **Pipeline** | `"pipeline"` | `"pipeline"` | 简单版式、追求速度、无幻觉风险 | |
| **MinerU-HTML** | `"html"` | `"MinerU-HTML"` | HTML 文件解析（自动切换） | |

### 3.5 环境变量配置

| 环境变量 | 用途 | SDK 默认值 |
|----------|------|:----------:|
| `MINERU_TOKEN` | API Token | `None`（Flash-only 模式） |
| `MINERU_BASE_URL` | 精准 API 基础地址 | `https://mineru.net/api/v4` |
| `MINERU_FLASH_BASE_URL` | Flash API 基础地址 | SDK 内置默认值 |

---

## 4. 输出数据格式规范

### 4.1 SDK ExtractResult 对象

**定义位置**: `mineru/models.py:42-68`

```python
@dataclass
class ExtractResult:
    task_id: str                             # 任务唯一标识
    state: str                               # "done" | "failed" | "pending" | "running" | "converting"
    filename: str | None = None              # 源文件名
    err_code: str = ""                        # 错误码
    error: str | None = None                 # 错误消息（state=failed 时有效）
    zip_url: str | None = None               # ZIP 下载 URL

    progress: Progress | None = None          # 处理进度（state=running 时有效）

    markdown: str | None = None               # full.md 内容（核心文本输出）
    content_list: list[dict] | None = None    # *_content_list.json 解析结果
    images: list[Image] = field(default_factory=list)  # 提取的图片列表

    docx: bytes | None = None                 # DOCX 二进制（extra_formats 请求时）
    html: str | None = None                   # HTML 内容（extra_formats 请求时）
    latex: str | None = None                  # LaTeX 内容（extra_formats 请求时）
```

**state 取值**:

| 值 | 说明 |
|------|------|
| `"done"` | 解析完成，内容字段可用 |
| `"failed"` | 解析失败，查看 `error` 字段 |
| `"pending"` | 排队中 |
| `"running"` | 解析中，查看 `progress` 字段 |
| `"converting"` | 格式转换中 |

### 4.2 Image 对象

**定义位置**: `mineru/models.py:8-15`

```python
@dataclass
class Image:
    name: str       # 文件名（如 "229a...f3.jpg"）
    data: bytes     # 图片二进制数据
    path: str       # ZIP 内相对路径（如 "images/229a...f3.jpg"）

    def save(self, filepath: str) -> Path:
        """保存图片到本地文件系统"""
```

> ⚠️ **与官方文档不一致**: 实际 SDK 中 `Image` 的字段为 `name`、`data`、`path`，**不是** `filename`。图片文件名是 **SHA-256 哈希值** 格式（如 `229a233cbd21c97534936d6c06acb4d525b3d8154887dc17c4cb05b28f34a7f3.jpg`），**不是** `page0_img0.jpg` 格式。

### 4.3 `full.md` — Markdown 输出格式

**实际测试验证通过**。`full.md` 以 Markdown 语法呈现文档内容。各内容类型的实际呈现方式：

| 内容类型 | Markdown 呈现 | 实测确认 |
|----------|---------------|:--------:|
| **标题** | `#` 层级标记（`# → ##`） | ✅ |
| **段落** | 普通文本 | ✅ |
| **表格** | **HTML `<table>` 格式** | ✅ 实测为 HTML 格式 |
| **公式** | 块级 `$$...$$`（LaTeX 语法） | ✅ |
| **图片引用** | `![描述](images/xxx.jpg)` | ✅ |
| **列表** | `\- ` 前缀转义行 | ✅ 实测为转义格式 |
| **代码块** | ` ```python` … ```` ``` 围栏 | ✅ |
| **页眉/页脚/页码** | **自动去除** | ✅ |

**实测输出示例**（`full.md` 片段）：

```markdown
# Sample Document for MinerU Test

## 1. Introduction

This is a sample document created for testing the MinerU document parsing API. ...

## 1.2 Performance Comparison

<table><tr><td>Model Version</td><td>Speed</td>...

## 1.3 Key Features

\- Support for 10+ document formats including PDF, DOCX, PPTX, images

\- High-precision layout analysis with VLM model

...

## 1.4 Formula Examples

$$
L (\text { theta }) = - 1 / N * \text { sum } (\log (p (y _ {i} | x _ {i}; \text { theta }))
$$

## 2.1 Python SDK Example

from mineru import MinerU

```python
client = MinerU("your-api-token")
...
```
```

> ⚠️ **与官方差异**: 表格以 HTML `<table>` 格式输出（非原生 Markdown 表格），适用于含合并单元格等复杂表格。

### 4.4 `content_list.json` — 结构化内容列表（核心）

**实测输出结构**。JSON 数组，按阅读顺序排列每个内容块。

#### 通用字段

| 字段 | 类型 | 始终存在 | 说明 |
|------|------|:--------:|------|
| `type` | `string` | ✅ | 内容块类型 |
| `page_idx` | `int` | ✅ | 零基页码（从 0 开始） |
| `bbox` | `list[int]` | ✅ | **整数**归一化包围盒 `[x0, y0, x1, y1]`，坐标系 0–1000 |
| `text` | `string` | ⚠️ | 纯文本内容（text/equation 类型有，table 类型无此字段） |
| `text_level` | `int` | ❌ | 标题层级：`1`(H1)、`2`(H2)…；**缺失或 `0` = 正文** |

> ⚠️ **与官方差异**: 实测中 `bbox` 值为整数（非浮点数），所有坐标范围为 0–1000。

#### 实测出现的 type 及其专属字段

##### text（正文/标题）— 实测最多

```json
{
  "type": "text",
  "text": "1. Introduction",
  "text_level": 2,
  "bbox": [48, 109, 282, 130],
  "page_idx": 0
}
```

| 字段 | 实测行为 |
|------|----------|
| `text` | ✅ 始终存在 |
| `text_level` | 标题时存在；**正文段落不包含此字段**（非 `0`） |
| `bbox` | ✅ 始终存在，整数 |

##### table（表格）— 实测验证

```json
{
  "type": "table",
  "img_path": "images/229a233cbd21c97534936d6c06acb4d525b3d8154887dc17c4cb05b28f34a7f3.jpg",
  "table_caption": [],
  "table_footnote": [],
  "table_body": "<table><tr><td>Model Version</td><td>Speed</td>...</table>",
  "bbox": [45, 448, 951, 557],
  "page_idx": 0
}
```

| 字段 | 存在条件 | 实测行为 |
|------|----------|----------|
| `table_body` | ✅ 总是 | HTML `<table>` 字符串 |
| `img_path` | ✅ 总是 | 指向 `images/` 目录的哈希名截图 |
| `table_caption` | ✅ 总是 | **空数组 `[]`** 当无标题时 |
| `table_footnote` | ✅ 总是 | **空数组 `[]`** 当无脚注时 |
| `text` | ❌ 不存在 | table 块无此字段 |

> ⚠️ **与官方差异**: `table_caption` 和 `table_footnote` 在无值时是**空数组 `[]` **，不是 `null` 也不是缺失。

##### equation（公式）— 实测验证

```json
{
  "type": "equation",
  "text": "$$\nL (\\text { theta }) = - 1 / N * \\text { sum } (\\log (p (y _ {i} | x _ {i}; \\text { theta }))\n$$",
  "text_format": "latex",
  "bbox": [80, 901, 495, 917],
  "page_idx": 0
}
```

| 字段 | 实测行为 |
|------|----------|
| `text` | ✅ LaTeX 公式内容（含 `$$` 围栏） |
| `text_format` | ✅ 固定值 `"latex"` |
| `img_path` | ❌ 实测中未出现 |

##### code（代码块）— 实测验证

```json
{
  "type": "code",
  "sub_type": "code",
  "code_caption": [],
  "code_body": "```python\nclient = MinerU(\"your-api-token\")\nresult = client.extract(\n    source=\"document.pdf\",\n    model=\"vlm\",\n    ...\n)\n```",
  "bbox": [45, 168, 354, 370],
  "page_idx": 1
}
```

| 字段 | 实测行为 |
|------|----------|
| `sub_type` | ✅ `"code"` 或 `"algorithm"` |
| `code_body` | ✅ 代码内容（含语言标记围栏） |
| `code_caption` | ✅ **空数组 `[]`** 当无标题时 |
| `text` | ⚠️ 部分版本可能有（本实测未出现） |

#### 类型枚举（实测 + 官方综合）

| type 值 | MVP 实测 | 属于阅读内容 | 说明 |
|---------|:--------:|:----------:|------|
| `text` | ✅ 出现 | ✅ | 正文、标题、列表项（通过 `text_level` 区分层级） |
| `table` | ✅ 出现 | ✅ | 表格（`table_body` 为 HTML，`img_path` 指向截图） |
| `equation` | ✅ 出现 | ✅ | 块级公式（`text_format: "latex"`，含 `$$` 围栏） |
| `code` | ✅ 出现 | ✅ | 代码块（`code_body` 含语言标记围栏） |
| `figure`/`image` | ❌ 未出现 | ✅ | 图片（文档无内嵌图片时不会出现） |
| `list` | ❌ 未出现 | ✅ | 列表（实测中列表项被解析为单个 `text` 块） |
| `title` | ❌ 未出现 | ✅ | 标题（部分版本使用；实测中用 `text`+`text_level`） |
| `header`/`footer` | ❌ 未出现 | ❌ | 页眉/页脚（VLM 模式下可能保留） |
| `discarded` | ❌ 未出现 | ❌ | 被丢弃的块 |

> ⚠️ **重要差异**: 实测中列表项被解析为 **单个 `text` 块**（以 `\\- ` 前缀标记），**不是** `list` 类型 + `list_items` 数组格式。官方文档所述的 `list` 类型 + `list_items` 字段在本实测中未出现。

### 4.5 ZIP 包原始文件清单

> 本实测中通过 SDK `client.extract()` 获取结果，ZIP 由 SDK 自动解析。以下 ZIP 内容基于 SDK 源码 `_zip.py` 的解析逻辑推导。

| ZIP 内文件 | SDK 映射字段 | 说明 |
|-----------|:-----------:|------|
| `full.md` | `result.markdown` | Markdown 最终输出 |
| `{filename}_content_list.json` | `result.content_list` | 结构化内容列表 |
| `{filename}_model.json` | **SDK 未映射** | 模型推理原始输出（通过 `save_all()` 可获取） |
| `{filename}_layout.json` | **SDK 未映射** | 中间布局处理结果（通过 `save_all()` 可获取） |
| `images/*.jpg` | `result.images[]` | 提取的图片（**哈希命名**，非 page 命名） |
| `{filename}.docx` | `result.docx` | [可选] DOCX 格式 |
| `{filename}.html` | `result.html` | [可选] HTML 格式 |
| `{filename}.tex` | `result.latex` | [可选] LaTeX 格式 |

> ⚠️ **与官方差异**: 
> 1. `layout.json` 和 `model.json` **不直接出现在 SDK 的 `ExtractResult` 属性中**，需通过 `result.save_all(dir)` 解压 ZIP 获取。
> 2. 图片命名格式为 **SHA-256 哈希值**（如 `229a233cbd21c97534936d6c06acb4d525b3d8154887dc17c4cb05b28f34a7f3.jpg`），**不是** `page0_img0.jpg` 格式。

### 4.6 实测文件与实际类型分布

**测试文件**: `sample_document.pdf`（2 页，14.9 KB，英文）
**模型**: VLM（视觉语言模型）
**解析耗时**: 10.6 秒

**输出文件清单**（实际生成）:

```
output/20260714_181413/
├── full.md                 (3.2 KB)  → Markdown 全文
├── content_list.json       (8.4 KB)  → 35 个内容块
├── summary.json            (0.5 KB)  → 处理摘要（自定义生成）
└── images/
    ├── 229a233c...a7f3.jpg  (38.6 KB) → 表格截图 #1
    ├── 1c448a99...ca5.jpg   (48.8 KB) → 表格截图 #2
    └── 0c8c6830...e4a.jpg   (6.9 KB)  → 公式截图
```

**内容块类型分布**:

| 类型 | 数量 |
|------|:----:|
| `text` | 31 个 |
| `table` | 2 个 |
| `equation` | 1 个 |
| `code` | 1 个 |
| **合计** | **35 个** |

**标题层级结构**（实测提取）:

```
H1: Sample Document for MinerU Test
  H2: 1. Introduction
  H2: 1.1 Supported File Formats
  H2: 1.2 Performance Comparison
  H2: 1.3 Key Features
  H2: 1.4 Formula Examples
  H2: 2. API Usage Examples
  H2: 2.1 Python SDK Example
  H2: 2.2 Output Files
  H2: 2.3 Data Extraction Results
  H2: 3. Conclusion
```

> `text_level: 1` = H1 一级标题，`text_level: 2` = H2 二级标题。正文段落**不包含** `text_level` 字段。

---

## 5. 布局信息详解

### 5.1 坐标系统

`content_list.json` 中的 `bbox` 采用 **0–1000 归一化坐标**：

```
bbox = [x0, y0, x1, y1]   // 所有值均为整数，范围 0–1000

原点: 页面左上角
x 轴: 向右增长
y 轴: 向下增长
```

### 5.2 布局定位代码

```python
# 按页面分组
from collections import defaultdict
pages = defaultdict(list)
for block in content_list:
    pages[block["page_idx"]].append(block)

# 获取某个区域的所有块
def get_blocks_in_region(cl, page_idx, x0, y0, x1, y1):
    result = []
    for block in cl:
        if block["page_idx"] != page_idx:
            continue
        bx0, by0, bx1, by1 = block["bbox"]
        if bx0 < x1 and bx1 > x0 and by0 < y1 and by1 > y0:
            result.append(block)
    return result

# 提取文档大纲
headings = []
for block in content_list:
    level = block.get("text_level", 0)
    if level > 0:
        headings.append(f"{'  '*(level-1)}H{level}: {block['text']}")

# 提取所有表格
tables = [b for b in content_list if b["type"] == "table"]
```

---

## 6. MVP 测试配置清单

### 6.1 必选配置

| 配置项 | 必填 | 说明 | MVP 值 |
|--------|:----:|------|--------|
| `MINERU_TOKEN` | ✅ | API Token | 从 https://mineru.net 申请 |
| `source` | ✅ | 文件 URL 或本地路径 | 本地 `sample_document.pdf` |
| 网络连接 | ✅ | 需访问 `mineru.net` | 确保公网可达 |

### 6.2 推荐 MVP 参数

```python
from mineru import MinerU

client = MinerU("your_api_token_here")
result = client.extract(
    source="./sample_document.pdf",
    model="vlm",        # 推荐 VLM，精度更高
    # ocr=True,         # 扫描件建议开启
    # pages="1-5",      # 可选：限制页数节省时间
    timeout=300,
)
```

### 6.3 输出读取

```python
# Markdown
print(result.markdown)

# 结构化内容列表
for block in result.content_list:
    print(f"[{block['type']}] {block.get('text', '')[:50]}")

# 图片
for img in result.images:
    img.save(f"./output/{img.name}")

# 保存所有文件
result.save_all("./output/")
```

### 6.4 虚拟环境配置

MinerU 组件使用 **uv 管理的独立虚拟环境** 进行环境隔离，路径为 `mineru_mvp_test/.venv`。

**环境创建命令**：

```bash
cd D:\vibe coding\GraphRAGAgent\mineru_mvp_test
UV_LINK_MODE=copy uv venv --python 3.10 --seed .venv
```

> **注意**: 
> - 使用 `UV_LINK_MODE=copy` 避免 uv trampoline 的 Windows 文件锁定问题
> - `--seed` 参数会在环境中同时安装 pip，用于后续依赖安装
> - `uv pip install` 在 Windows 上可能因安全软件拦截 trampoline 写入而失败，此时使用 venv 内的 pip 替代

**依赖安装**：

```bash
# 进入 MinerU 目录并通过 pip 安装依赖（uv 创建环境后，pip 由 --seed 自动包含）
cd D:\vibe coding\GraphRAGAgent\mineru_mvp_test
.venv\Scripts\pip install mineru-open-sdk python-dotenv fpdf2
```

**运行 Pipeline**：

```bash
# 方式一：激活后运行（推荐）
cd D:\vibe coding\GraphRAGAgent\mineru_mvp_test
source .venv/Scripts/activate
PYTHONIOENCODING=utf-8 python run_mvp_pipeline.py

# 方式二：直接用 venv 的 Python 运行（无需 cd）
D:\vibe coding\GraphRAGAgent\mineru_mvp_test\.venv\Scripts\python \
  D:\vibe coding\GraphRAGAgent\mineru_mvp_test\run_mvp_pipeline.py
```

> **环境隔离原则**: **LangExtract 组件与 MinerU 组件不应共享同一虚拟环境**，避免依赖冲突。切换组件时，须退出当前环境的虚拟环境，再激活目标组件的环境。
>
> **路径注意**: MinerU 的虚拟环境位于 `mineru_mvp_test/.venv/`，**并非项目根目录的 `.venv/`**。从项目根目录无法直接通过 `source .venv/Scripts/activate` 激活，必须先 `cd` 到 `mineru_mvp_test/` 目录，或使用绝对路径指定 Python 解释器。

> **Windows 兼容性说明**: `uv pip install` 在 Windows 上可能因安全软件拦截 uv trampoline 写入而失败（`Failed to update Windows PE resources`）。此问题为 Windows + 安全软件的已知兼容问题，不影响 uv 创建的虚拟环境本身。解决方案：使用 `.venv\Scripts\pip install` 代替 `uv pip install`，环境仍由 uv 管理。
