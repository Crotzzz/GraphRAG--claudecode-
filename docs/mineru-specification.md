# MinerU 文档解析 API 规范文档

> **版本**: v4 (Precision API) / v1 (Agent API)  
> **官方文档**: https://mineru.net/apiManage/docs  
> **SDK**: `mineru-open-sdk` (PyPI)  
> **本文档基于**: 2026-07-14 官方文档及源码调研

---

## 目录

- [1. 支持的输入文件格式](#1-支持的输入文件格式)
- [2. 精准模式 API 输出格式规范](#2-精准模式-api-输出格式规范)
  - [2.1 输出 ZIP 包文件清单](#21-输出-zip-包文件清单)
  - [2.2 full.md — Markdown 输出格式](#22-fullmd--markdown-输出格式)
  - [2.3 content_list.json — 结构化内容列表](#23-content_listjson--结构化内容列表)
  - [2.4 model.json — 模型推理输出](#24-modeljson--模型推理输出)
  - [2.5 layout.json (middle.json) — 中间布局结果](#25-layoutjson-middlejson--中间布局结果)
  - [2.6 images/ — 提取图片目录](#26-images--提取图片目录)
  - [2.7 额外的 docx/html/latex 输出](#27-额外的-docxhtmllatex-输出)
- [3. 文档布局信息详解](#3-文档布局信息详解)
  - [3.1 坐标系统](#31-坐标系统)
  - [3.2 Block 层级体系](#32-block-层级体系)
  - [3.3 Type 类型大全](#33-type-类型大全)
  - [3.4 内容块之间的关系与导航](#34-内容块之间的关系与导航)
- [4. MVP 测试配置清单](#4-mvp-测试配置清单)
  - [4.1 必选字段](#41-必选字段)
  - [4.2 可选字段](#42-可选字段)
  - [4.3 环境配置](#43-环境配置)
  - [4.4 快速 MVP 脚本](#44-快速-mvp-脚本)
  - [4.5 常见问题](#45-常见问题)

---

## 1. 支持的输入文件格式

MinerU 精准解析 API（`/api/v4/extract/task`）支持以下原始文档格式直接输入：

### 1.1 完整格式列表

| 类别 | 格式 | 扩展名 | 精准 API | Agent 轻量 API |
|------|------|--------|:---------:|:--------------:|
| **PDF** | Adobe PDF | `.pdf` | ✅ | ✅ |
| **图片** | PNG | `.png` | ✅ | ✅ |
| | JPEG | `.jpg`, `.jpeg` | ✅ | ✅ |
| | JPEG 2000 | `.jp2` | ✅ | ✅ |
| | WebP | `.webp` | ✅ | ✅ |
| | GIF | `.gif` | ✅ | ✅ |
| | BMP | `.bmp` | ✅ | ✅ |
| **Word** | Word 文档 | `.doc`, `.docx` | ✅ | ✅ |
| **PowerPoint** | PPT 演示文稿 | `.ppt`, `.pptx` | ✅ | ✅ |
| **Excel** | 电子表格 | `.xls`, `.xlsx` | ✅ | ✅ |
| **HTML** | 网页 | `.html`, `.htm` | ✅（需 `model_version: "MinerU-HTML"`） | ❌ |

### 1.2 文件限制

| 限制项 | 精准 API | Agent 轻量 API |
|--------|:--------:|:--------------:|
| 单文件上限 | **≤ 200 MB** | ≤ 10 MB |
| 页数上限 | **≤ 600 页** | ≤ 20 页 |
| 批量数量 | **≤ 200 个文件** | 仅单文件 |

### 1.3 输入方式

#### 方式 A：URL 输入（推荐的标准化接入方式）

```python
import requests

# 提交任务
resp = requests.post(
    "https://mineru.net/api/v4/extract/task",
    headers={
        "Content-Type": "application/json",
        "Authorization": "Bearer YOUR_TOKEN"
    },
    json={
        "url": "https://example.com/document.pdf",   # ← 文件必须托管在公网可访问的 URL
        "model_version": "vlm",                        # 可选，默认 "pipeline"
        # ...其他参数
    }
)
task_id = resp.json()["data"]["task_id"]

# 轮询结果
result = requests.get(
    f"https://mineru.net/api/v4/extract/task/{task_id}",
    headers={"Authorization": "Bearer YOUR_TOKEN"}
)
```

#### 方式 B：SDK 快速接入（推荐 MVP）

```python
from mineru import MinerU

client = MinerU("your-api-token")

# URL 输入
result = client.extract("https://example.com/document.pdf")

# 本地文件自动上传
result = client.extract("./local_document.pdf")
```

---

## 2. 精准模式 API 输出格式规范

### 2.1 输出 ZIP 包文件清单

当任务完成后，`full_zip_url` 指向一个 ZIP 压缩包。解压后包含以下文件：

```
{original_filename}.zip
├── full.md                          # Markdown 最终输出（核心可读输出）
├── {filename}_content_list.json     # 结构化内容列表（按阅读顺序）
├── {filename}_model.json            # 模型推理原始输出
├── {filename}_layout.json           # 中间布局处理结果（= middle.json）
├── images/                          # 提取的图片目录
│   ├── page0_img0.jpg
│   ├── page0_img1.jpg
│   ├── page1_img0.jpg
│   └── ...
├── {filename}.docx                  # [可选] 额外导出的 Word 格式
├── {filename}.html                  # [可选] 额外导出的 HTML 格式
└── {filename}.tex                   # [可选] 额外导出的 LaTeX 格式
```

> **文件命名说明**: `{filename}` 为源文件的文件名（不含扩展名）。例如源文件 `report.pdf`，则对应 `report_content_list.json`、`report_model.json`、`report_layout.json`。

| 文件 | 始终存在 | 来源 | 用途 |
|------|:--------:|------|------|
| `full.md` | ✅ | 管线生成 | 人类可读的 Markdown 文档，可直接阅读或输入到 LLM |
| `*_content_list.json` | ✅ | 管线生成 | **结构化内容列表**，按阅读顺序排列，适合程序化处理 |
| `*_model.json` | ✅ | 模型推理 | 模型原始推理结果，含置信度和检测类别 |
| `*_layout.json` | ✅ | 中间处理 | 页面布局信息，含完整的块/行/跨度的层级结构 |
| `images/` | ⚠️ | 管线生成 | 文档中提取的图片（仅当文档含图片时存在） |
| `*.docx/html/tex` | ❌ | 额外格式 | 通过 `extra_formats` 参数指定 |

### 2.2 `full.md` — Markdown 输出格式

`full.md` 是最终的可读输出，以 Markdown 语法呈现。各内容类型在 Markdown 中的表示：

| 内容类型 | Markdown 呈现 | 示例 |
|----------|---------------|------|
| **标题** | `#` 层级标记 | `# 一级标题` → `## 二级标题` |
| **段落** | 普通文本 | `这是一个段落。` |
| **表格** | Markdown 表格 | `\| 列1 \| 列2 \|` |
| **公式** | LaTeX 语法 | 行内 `$E=mc^2$` / 块级 `$$\int dx$$` |
| **图片** | 标准图片引用 | `![图注](images/page0_img0.jpg)` |
| **列表** | Markdown 列表 | `- 项1` / `1. 项1` |
| **页眉/页脚/页码** | **自动去除** | 不出现在 Markdown 输出中 |
| **代码块** | 围栏代码块 | ` ```python` … ```` ``` |

**示例 `full.md`**:

```markdown
# 第一章 绪论

## 1.1 研究背景

近年来，人工智能技术取得了飞速发展。

如图1所示，模型准确率逐年提升。

![图1: 模型准确率趋势](images/page1_img0.jpg)

公式示例:

$$
L(\theta) = -\frac{1}{N}\sum_{i=1}^{N} \log p(y_i|x_i;\theta)
$$

其中 $p(y|x)$ 为条件概率。

实验结果如表1所示:

| 模型 | 准确率 | 参数量 |
|------|--------|--------|
| BERT | 92.5% | 110M |
| GPT  | 89.3% | 175M |
```

> **注意**: `full.md` 中的表格可能以 HTML `<table>` 而非原生 Markdown 表格呈现，以适应复杂表格（合并单元格等）。

### 2.3 `content_list.json` — 结构化内容列表

**核心文件**。这是一个扁平的 JSON 数组，按人类阅读顺序排列文档中的每个内容块。这是程序化处理文档的最重要输出。

#### 顶层结构

```json
[
  {
    "type": "<内容类型>",
    "text": "<纯文本内容>",
    "text_level": <标题层级>,
    "bbox": [x0, y0, x1, y1],
    "page_idx": <页码>,
    // 以下是按 type 出现的选择性字段
  },
  ...
]
```

#### 通用字段

| 字段 | 类型 | 始终存在 | 说明 |
|------|------|:--------:|------|
| `type` | `string` | ✅ | 内容块类型（详见 3.3 节 Type 类型大全） |
| `page_idx` | `int` | ✅ | 零基页码（从 0 开始） |
| `bbox` | `list[int]` | ✅ | 归一化包围盒 `[x0, y0, x1, y1]`，坐标系 0–1000 |
| `text` | `string` | ⚠️ | 纯文本内容。对 `table`/`image` 等类型可能缺失 |
| `text_level` | `int` | ❌ | **标题层级**。`1`=一级标题，`2`=二级标题…；`0` 或缺失 = 正文 |

#### 按 type 分类的选择性字段

##### text（正文/标题）

```json
{
  "type": "text",
  "text": "本合同由以下双方共同签署：",
  "text_level": 0,
  "bbox": [120, 100, 480, 130],
  "page_idx": 0
}
```

| 字段 | 存在条件 | 说明 |
|------|----------|------|
| `text` | ✅ 总是 | 文本内容 |
| `text_level` | ⚠️ 标题时 | `0`(正文) / `1`(h1) / `2`(h2) / … |

##### table（表格）

```json
{
  "type": "table",
  "table_body": "<table><tr><td>...</td></tr></table>",
  "table_caption": ["表1: 实验数据对比"],
  "table_footnote": ["注: 数据来源自..."],
  "img_path": "images/page2_table0.jpg",
  "bbox": [50, 200, 950, 500],
  "page_idx": 2
}
```

| 字段 | 存在条件 | 说明 |
|------|----------|------|
| `table_body` | ✅ 总是 | 表格的 HTML `<table>` 完整结构 |
| `table_caption` | ❌ 有标题时 | 表格题注列表（字符串数组） |
| `table_footnote` | ❌ 有脚注时 | 表格脚注列表（字符串数组） |
| `img_path` | ❌ 可用时 | 表格区域截图路径 |

##### image / figure（图片）

```json
{
  "type": "figure",
  "text": "公司组织结构图",
  "img_path": "images/page0_img0.jpg",
  "bbox": [100, 450, 500, 650],
  "page_idx": 0
}
```

| 字段 | 存在条件 | 说明 |
|------|----------|------|
| `text` | ⚠️ VLM 时有 | VLM 模型生成的图片语义描述 |
| `img_path` | ✅ 总是 | 图片相对路径（指向 `images/` 目录） |
| `image_caption` | ❌ 有图注时 | 图片题注列表（字符串数组） |
| `image_footnote` | ❌ 有脚注时 | 图片脚注列表（字符串数组） |

##### equation（公式）

```json
{
  "type": "equation",
  "text": "E = mc^2",
  "text_format": "latex",
  "img_path": "images/page3_eq0.jpg",
  "bbox": [200, 600, 800, 650],
  "page_idx": 3
}
```

| 字段 | 存在条件 | 说明 |
|------|----------|------|
| `text` | ✅ 总是 | LaTeX 公式内容 |
| `text_format` | ✅ 总是 | 固定为 `"latex"` |
| `img_path` | ❌ 可用时 | 公式区域截图路径 |

##### list（列表）

```json
{
  "type": "list",
  "list_items": ["第一条 定义", "第二条 权利义务", "第三条 违约责任"],
  "bbox": [120, 700, 480, 780],
  "page_idx": 0
}
```

| 字段 | 存在条件 | 说明 |
|------|----------|------|
| `list_items` | ✅ 总是 | 列表项字符串数组 |
| `text` | ❌ | 可能不存在（改用 `list_items`） |
| `sub_type` | ❌ | 可选子类型，如 `"reference"` 表示参考文献列表 |

##### code（代码块）

```json
{
  "type": "code",
  "code_body": "def hello():\n    print('hello')",
  "text": "def hello():\n    print('hello')",
  "sub_type": "code",
  "bbox": [100, 300, 900, 500],
  "page_idx": 5
}
```

| 字段 | 存在条件 | 说明 |
|------|----------|------|
| `code_body` | ✅ 总是 | 代码内容 |
| `text` | ⚠️ 可能有 | 与 `code_body` 内容相同 |
| `sub_type` | ✅ 总是 | `"code"` 或 `"algorithm"` |

##### header / footer（页眉页脚）

```json
{
  "type": "header",
  "text": "第1章 引言",
  "bbox": [100, 0, 900, 40],
  "page_idx": 0
}
```

> **注意**：pipeline 模式下 header/footer 通常被丢弃（归入 `discarded_blocks`），不出现在 `content_list.json` 中；VLM模式下可能保留在 `content_list.json` 中。

#### 完整示例

```json
[
  {"type": "text", "text": "第一章 总则", "text_level": 1, "bbox": [120, 50, 480, 80], "page_idx": 0},
  {"type": "text", "text": "本合同由以下双方于2024年5月18日共同签署：", "bbox": [120, 100, 480, 130], "page_idx": 0},
  {"type": "table", "table_caption": ["表1: 合同信息"], "table_body": "<table><tr><td>甲方</td><td>乙方</td></tr></table>", "bbox": [80, 200, 520, 400], "page_idx": 0},
  {"type": "figure", "text": "公司组织结构图", "img_path": "images/page0_img0.jpg", "bbox": [100, 450, 500, 650], "page_idx": 0},
  {"type": "list", "list_items": ["第一条 定义", "第二条 权利义务"], "bbox": [120, 700, 480, 780], "page_idx": 0},
  {"type": "equation", "text": "E = mc^2", "text_format": "latex", "bbox": [200, 800, 400, 840], "page_idx": 0},
  {"type": "text", "text": "实验结果如表2所示。", "bbox": [120, 850, 500, 880], "page_idx": 0}
]
```

### 2.4 `model.json` — 模型推理输出

**Pipeline 后端的原始输出**，按页组织的检测结果列表。

```json
[
  {   // 第 0 页的所有检测块
    "cls_id": 0,
    "label": "title",
    "score": 0.98,
    "bbox": [x0_px, y0_px, x1_px, y1_px],    // 像素坐标
    "index": 0
  },
  { "cls_id": 1, "label": "plain_text", "score": 0.95, "bbox": [...], "index": 1 },
  { "cls_id": 5, "label": "table", "score": 0.92, "bbox": [...], "index": 2 },
  ...
]
```

#### CategoryType 枚举（Pipeline 后端）

| ID | Label | 说明 |
|:--:|-------|------|
| 0 | `title` | 标题 |
| 1 | `plain_text` | 正文文本 |
| 2 | `abandon` | 需丢弃的内容（页眉、页脚、页码、页面注释） |
| 3 | `figure` | 图片/插图 |
| 4 | `figure_caption` | 图片描述/图注 |
| 5 | `table` | 表格 |
| 6 | `table_caption` | 表格标题 |
| 7 | `table_footnote` | 表格脚注 |
| 8 | `isolate_formula` | 块级公式 |
| 9 | `formula_caption` | 公式编号/标签 |
| 13 | `embedding` | 行内公式 |
| 14 | `isolated` | 隔离公式（部分版本） |
| 15 | `text` | OCR 识别结果 |

#### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `cls_id` | `int` | 类别 ID（对应上表枚举值） |
| `label` | `string` | 人类可读的类别名称 |
| `score` | `float` | 模型置信度（0–1），越高越可信 |
| `bbox` | `list[float]` | **像素坐标** `[x0, y0, x1, y1]`（非归一化），需要结合页面尺寸换算 |
| `index` | `int` | 检测索引（页内顺序） |

### 2.5 `layout.json` (middle.json) — 中间布局结果

此文件包含完整的页面布局层级结构，是 `content_list.json` 的**超集**，包含所有中间处理信息。

#### 顶层结构

```json
{
  "pdf_info": [
    { /* 第 0 页 */ },
    { /* 第 1 页 */ },
    ...
  ],
  "_backend": "pipeline",          // 或 "vlm"
  "_parse_type": "ocr",            // 或 "txt"
  "_version_name": "2.1.11"        // MinerU 版本号
}
```

#### 页面信息结构（`pdf_info[]` 中的每个元素）

```json
{
  "page_idx": 0,
  "page_size": [595, 842],             // 页面宽高（像素/点）
  "preproc_blocks": [...],              // 预处理后的未分割块
  "para_blocks": [...],                 // 段落级内容块（核心）
  "images": [...],                      // 图片块列表
  "tables": [...],                      // 表格块列表
  "interline_equations": [...],         // 行间公式块列表
  "discarded_blocks": [...]             // 被丢弃的块（页眉页脚等）
}
```

| 字段 | 说明 |
|------|------|
| `page_size` | 页面原始尺寸 `[width, height]`，用于将像素坐标转换为归一化坐标 |
| `preproc_blocks` | PDF 预处理后的未分割检测块 |
| `para_blocks` | **段落分割后的内容块**，包含完整的块→行→跨度层级 |
| `images` | 图片块信息（独立列出方便索引） |
| `tables` | 表格块信息（含 HTML 结构） |
| `interline_equations` | 行间公式信息 |
| `discarded_blocks` | 被丢弃的块（页眉、页脚、页码、页边注释等） |

#### Block 层级体系（`para_blocks` 的核心结构）

```
para_blocks[]
├── Level 1 Block (type: table / image / chart)
│   └── blocks[]
│       └── Level 2 Block (type: table_body / table_caption / image_body / image_caption / ...)
│           └── lines[]
│               └── spans[]
│                   ├── type: "text" → { content: "文本" }
│                   ├── type: "inline_equation" → { content: "LaTeX公式" }
│                   └── type: "image" → { image_path: "images/..." }
│
└── Level 2 Block (type: text / title / list / interline_equation / ...)
    └── lines[]
        └── spans[]
            └── (同上)
```

#### Level 1 Block（顶级容器块）

```json
{
  "type": "table",              // table | image | chart
  "bbox": [x0, y0, x1, y1],    // 包围盒
  "blocks": [                    // 子块列表（Level 2）
    { /* Level 2 Block */ }
  ]
}
```

#### Level 2 Block（内容块）

```json
{
  "type": "table_body",          // 块类型
  "bbox": [x0, y0, x1, y1],
  "lines": [                     // 行列表
    {
      "bbox": [x0, y0, x1, y1],
      "spans": [                 // 跨度列表（最小文本单元）
        {
          "type": "text",        // text | inline_equation | image
          "bbox": [x0, y0, x1, y1],
          "content": "文本内容"   // 文本内容
        }
      ]
    }
  ]
}
```

#### Level 2 Block 类型

| 类型 | 所属顶级块 | 说明 |
|------|-----------|------|
| `text` | — | 普通文本段落 |
| `title` | — | 标题 |
| `list` | — | 列表 |
| `index` | — | 索引/目录 |
| `interline_equation` | — | 行间公式 |
| `table_body` | table | 表格主体 |
| `table_caption` | table | 表格标题 |
| `table_footnote` | table | 表格脚注 |
| `image_body` | image | 图片本身 |
| `image_caption` | image | 图片标题 |
| `image_footnote` | image | 图片脚注 |
| `chart_body` | chart | 图表主体 |
| `chart_caption` | chart | 图表标题 |
| `chart_footnote` | chart | 图表脚注 |

#### Span 类型

| 类型 | 说明 | 有效字段 |
|------|------|----------|
| `text` | 文本跨度 | `content`（文本内容） |
| `inline_equation` | 行内公式 | `content`（LaTeX 公式文本） |
| `image` | 图片 | `image_path`（指向 `images/` 的相对路径） |
| `table` | 表格 | `content`（HTML 表格） |

### 2.6 `images/` — 提取图片目录

存放从文档中提取的所有图片和图表截图，以 `page{页码}_{类型}{序号}` 格式命名。

```bash
images/
├── page0_img0.jpg       # 第 1 页的第 1 张图片
├── page0_img1.jpg       # 第 1 页的第 2 张图片
├── page1_img0.jpg       # 第 2 页的第 1 张图片
├── page1_table0.jpg     # 第 2 页的第 1 个表格截图
├── page2_eq0.jpg        # 第 3 页的第 1 个公式截图
└── ...
```

> `content_list.json` 中 `type: "figure"` 或 `type: "table"` 块的 `img_path` 字段引用这些文件。

### 2.7 额外的 docx/html/latex 输出

当请求时指定 `extra_formats: ["docx", "html", "latex"]`，ZIP 包中额外包含同名但不同扩展名的文件，内容与 `full.md` 等价但格式不同。

---

## 3. 文档布局信息详解

### 3.1 坐标系统

MinerU 使用两种坐标系：

#### 归一化坐标（`content_list.json` 中的 `bbox`）

```
bbox = [x0_norm, y0_norm, x1_norm, y1_norm]

计算方式:
x0_norm = int(x0_px * 1000 / page_width)
y0_norm = int(y0_px * 1000 / page_height)
x1_norm = int(x1_px * 1000 / page_width)
y1_norm = int(y1_px * 1000 / page_height)
```

- 坐标系范围：**0–1000**（独立于原始页面尺寸）
- 原点：页面**左上角**
- x 轴向右增长，y 轴向下增长
- 此归一化使不同尺寸页面的坐标可直接比较

#### 像素坐标（`model.json` 和 `layout.json` 中的 `bbox`）

```
bbox = [x0_px, y0_px, x1_px, y1_px]
```

- 单位为**像素/点**（原始 PDF 页面尺寸）
- 通过 `layout.json` 中的 `page_size` 字段获取页面尺寸进行换算

#### 坐标换算公式

```python
# 像素 → 归一化
x_norm = int(x_px * 1000 / page_width)
y_norm = int(y_px * 1000 / page_height)

# 归一化 → 像素
x_px = int(x_norm * page_width / 1000)
y_px = int(y_norm * page_height / 1000)
```

### 3.2 Block 层级体系

```
文档
└── 页面 (page_idx: int)
    ├── 块 (Block) — 三种 Level 1 容器
    │   ├── table: 表格（含 body + caption + footnote）
    │   ├── image/chart: 图片/图表（含 body + caption + footnote）
    │   └── (隐式) 文本/标题/公式等直接为 Level 2 Block
    │
    ├── Level 2 Block — 内容类型
    │   ├── text / title / list / index
    │   ├── interline_equation
    │   ├── table_body / table_caption / table_footnote
    │   ├── image_body / image_caption / image_footnote
    │   └── ...
    │
    ├── 行 (Line)
    │   └── bbox: 行的包围盒坐标
    │
    └── 跨度 (Span) — 最小语义单元
        ├── type: "text" → content: str
        ├── type: "inline_equation" → content: str (LaTeX)
        └── type: "image" → image_path: str
```

### 3.3 Type 类型大全

以下表格汇总了 `content_list.json` 中所有可能的 `type` 值及其含义：

| type 值 | 类别 | 属于阅读内容 | 说明 |
|---------|------|:----------:|------|
| `text` | 文本 | ✅ | 普通正文段落或标题（通过 `text_level` 区分层级） |
| `title` | 文本 | ✅ | 标题（部分版本使用，与 `text`+`text_level` 互斥） |
| `table` | 表格 | ✅ | 表格（含 HTML 主体的完整表示） |
| `table_caption` | 表格 | ✅ | 表格标题（若独立成块则此类型） |
| `figure` / `image` | 图片 | ✅ | 图片/插图 |
| `list` | 列表 | ✅ | 列表（有序/无序/参考文献） |
| `equation` | 公式 | ✅ | 块级公式（LaTeX 表示） |
| `code` | 代码 | ✅ | 代码块/算法块 |
| `header` | 辅助 | ❌ | 页眉（VLM 模式下可能保留） |
| `footer` | 辅助 | ❌ | 页脚（VLM 模式下可能保留） |
| `page_number` | 辅助 | ❌ | 页码 |
| `discarded` | 辅助 | ❌ | 被丢弃的块（VLM 模式下保留但标记） |

### 3.4 内容块之间的关系与导航

#### 阅读顺序

`content_list.json` 中的数组顺序 = 人类阅读顺序 = 文档的自然流式顺序。

```python
# 按阅读顺序遍历
for block in content_list:
    print(f"  [{block['type']}] {block.get('text', '')[:50]}")
```

#### 按页面分组

```python
from collections import defaultdict

pages = defaultdict(list)
for block in content_list:
    pages[block["page_idx"]].append(block)
```

#### 提取标题层级结构

```python
# 提取文档大纲
headings = []
for block in content_list:
    level = block.get("text_level", 0)
    if level > 0:
        headings.append({
            "level": level,
            "text": block["text"],
            "page": block["page_idx"]
        })
```

#### 定位某个页面区域的所有块

```python
def get_blocks_in_region(content_list, page_idx, x0, y0, x1, y1):
    """获取指定页面区域内（归一化坐标）的所有块"""
    result = []
    for block in content_list:
        if block["page_idx"] != page_idx:
            continue
        bx0, by0, bx1, by1 = block["bbox"]
        # 检查是否与目标区域重叠
        if bx0 < x1 and bx1 > x0 and by0 < y1 and by1 > y0:
            result.append(block)
    return result
```

#### 提取所有表格数据

```python
tables = [b for b in content_list if b["type"] == "table"]
for t in tables:
    html = t.get("table_body", "")
    caption = t.get("table_caption", [])
    # html 可直接解析或输入到 LLM
```

---

## 4. MVP 测试配置清单

### 4.1 必选字段

精准模式 API 调用时必须提供的字段：

| 参数 | 类型 | 必填 | 说明 | MVP 建议值 |
|------|------|:----:|------|:----------:|
| `url` | `string` | **是** | 文档的公网可访问 URL | 使用官方测试 PDF |
| `Authorization` | `string` | **是** | `Bearer <token>` | 从 [mineru.net](https://mineru.net) 申请 |
| 请求获取 task_id | — | **是** | `POST` → 获得 `task_id` | — |
| 轮询结果 | — | **是** | `GET /task/{task_id}` → 等待 `state=done` | — |
| 下载 ZIP | — | **是** | 下载 `full_zip_url` → 解压 → 读取文件 | — |

**最低可行请求**:

```bash
# 提交任务（仅 2 个必填项：url + token）
curl -s -X POST "https://mineru.net/api/v4/extract/task" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"url": "https://cdn-mineru.openxlab.org.cn/demo/example.pdf"}'

# 轮询结果（1 个必填项：token）
curl -s "https://mineru.net/api/v4/extract/task/YOUR_TASK_ID" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 4.2 可选字段

| 参数 | 类型 | 默认值 | 建议 | 说明 |
|------|------|:------:|:----:|------|
| `model_version` | `string` | `"pipeline"` | `"vlm"` | **推荐 VLM**，精度更高。Pipeline 更快 |
| `is_ocr` | `bool` | `false` | `true`（扫描件） | 纯文本 PDF 可关闭 |
| `enable_formula` | `bool` | `true` | `true` | 有公式的文档保持开启 |
| `enable_table` | `bool` | `true` | `true` | 有表格的文档保持开启 |
| `language` | `string` | `"ch"` | `"ch"` 或 `"en"` | 根据文档语言设置 |
| `page_ranges` | `string` | 全部 | MVP 可省略 | 如 `"1-10"` 限制解析页数 |
| `data_id` | `string` | — | MVP 可省略 | 自定义业务标识 |
| `extra_formats` | `[string]` | — | MVP 可省略 | 额外导出 `["docx"]` 等 |
| `callback` | `string` | — | MVP 无需 | 生产环境结果回调 |
| `no_cache` | `bool` | `false` | MVP 可省略 | 强制重新解析 |

### 4.3 环境配置

#### Python SDK 安装

```bash
pip install mineru-open-sdk
```

#### Token 配置（二选一）

```bash
# 方式 A：环境变量（推荐）
export MINERU_TOKEN="your_api_token_here"

# 方式 B：代码中传入
from mineru import MinerU
client = MinerU("your_api_token_here")
```

#### Token 申请

1. 访问 https://mineru.net
2. 注册/登录账号
3. 进入控制台 → API Token 管理 → 申请新 Token
4. 复制 Token 到环境变量 `MINERU_TOKEN`

#### 网络要求

- 必须能访问 `mineru.net`（域名解析正常）
- 输入文件的 URL 必须公网可访问（或通过 SDK 上传本地文件）
- 建议配置 `timeout` 参数（默认 300s，大文件建议 600s+）

### 4.4 快速 MVP 脚本

创建一个完整的 MVP 测试脚本 `mvp_test_mineru.py`：

```python
"""
MinerU 精准解析 API — MVP 测试脚本
运行方式: python mvp_test_mineru.py
"""

import json
import os
import zipfile
import tempfile
from mineru import MinerU


def main():
    # ===== 配置区 =====
    # 方式一：环境变量 MINERU_TOKEN
    # 方式二：直接填写
    token = os.environ.get("MINERU_TOKEN", "your_token_here")
    
    # 测试文件（使用 MinerU 官方示例 PDF）
    test_url = "https://cdn-mineru.openxlab.org.cn/demo/example.pdf"
    # 或使用本地文件
    # test_file = "./sample.pdf"
    # ==================
    
    client = MinerU(token)
    
    print("=" * 60)
    print("MinerU 精准解析 MVP 测试")
    print("=" * 60)
    
    # 步骤 1：提交解析任务
    print(f"\n[1/4] 提交解析任务...")
    print(f"    文件: {test_url}")
    print(f"    模型: vlm (推荐)")
    
    result = client.extract(
        source=test_url,
        model="vlm",            # 推荐使用 VLM 模型
        # model="pipeline",     # 速度更快但精度略低
        ocr=True,               # 扫描件建议开启
        formula=True,           # 公式识别
        table=True,             # 表格识别
        language="ch",          # 文档语言
        # pages="1-5",          # 可选：限制页数节省时间
    )
    
    print(f"    任务 ID: {result.task_id}")
    print(f"    状态: {result.state}")
    
    # 步骤 2：查看 Markdown 输出
    print(f"\n[2/4] Markdown 输出预览:")
    print("—" * 40)
    print(result.markdown[:1500])  # 打印前 1500 字符
    if len(result.markdown) > 1500:
        print("... (内容已截断)")
    print("—" * 40)
    print(f"    Markdown 总长度: {len(result.markdown)} 字符")
    
    # 步骤 3：查看 content_list 结构化输出
    print(f"\n[3/4] 结构化内容列表 (content_list):")
    print(f"    共 {len(result.content_list)} 个内容块")
    
    # 按类型统计
    type_counts = {}
    for block in result.content_list:
        bt = block.get("type", "unknown")
        type_counts[bt] = type_counts.get(bt, 0) + 1
    
    print(f"    内容块类型分布:")
    for t, c in sorted(type_counts.items(), key=lambda x: -x[1]):
        print(f"      - {t}: {c} 个")
    
    # 显示前 5 个块
    print(f"\n    前 5 个内容块预览:")
    for i, block in enumerate(result.content_list[:5]):
        text = block.get("text", block.get("table_body", ""))[:80]
        print(f"      [{i}] type={block['type']}, page={block['page_idx']}, text={text}...")
    
    # 步骤 4：保存结果到本地
    print(f"\n[4/4] 保存结果...")
    
    output_dir = tempfile.mkdtemp(prefix="mineru_mvp_")
    result.save_all(output_dir)
    print(f"    保存到: {output_dir}")
    print(f"    文件列表: {os.listdir(output_dir)}")
    
    # 如果包含图片
    if result.images:
        print(f"    提取图片: {len(result.images)} 张")
        for img in result.images[:3]:
            print(f"      - {img.filename} ({len(img.data)} bytes)")
    
    print("\n" + "=" * 60)
    print("MVP 测试完成！")
    print("=" * 60)


if __name__ == "__main__":
    main()
```

### 4.5 常见问题

#### Q: 文件上传方式如何操作？

精准 API 的 `POST /api/v4/file-urls/batch` 支持直接上传文件（不依赖公网 URL）。SDK 的 `extract()` 方法传入本地路径会自动触发此流程。

```python
# SDK 自动处理上传
result = client.extract("./local_document.pdf")
```

#### Q: Flash 模式和 Precision 模式选哪个？

| 场景 | 推荐模式 |
|------|----------|
| 快速验证能否解析 | Flash（无需 Token） |
| 测试结构化 JSON 输出 | Precision 精准模式 |
| 测试多模态 RAG 全流程 | Precision 精准模式 |
| 大文件（>10MB） | Precision 精准模式 |
| 生产环境 | Precision 精准模式 |

#### Q: 如何获得 `content_list.json` 和 `layout.json`？

精准模式下，SDK 自动在 `result.content_list` 属性中返回结构化列表。如果需要原始文件，从下载的 ZIP 包中直接获取 `*_content_list.json` 和 `*_layout.json`。

---

### 附录：输出文件间的关系

```
原始文档 (PDF/DOCX/图片)
    │
    ▼
┌──────────────────────────────────────────────────────┐
│                 MinerU 解析管线                        │
│                                                      │
│  模型推理 (model.json)                                │
│    ↓                                                 │
│  布局分析 (layout.json / middle.json)                  │
│    ↓                                                 │
│  内容提取 + 结构化                                    │
│    ├── content_list.json  ← 程序化处理首选             │
│    └── full.md              ← 人类/LLM 阅读首选        │
└──────────────────────────────────────────────────────┘
    │
    ▼
输出到下游系统 (LangExtract / RAG / 知识图谱)
```

| 文件 | 程序化处理的推荐度 | LLM 输入的推荐度 | 说明 |
|------|:-----------------:|:----------------:|------|
| `full.md` | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 最适合直接输入到 LLM，保留了结构 |
| `content_list.json` | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 适合程序精确提取特定类型内容（表格、标题等） |
| `layout.json` | ⭐⭐⭐ | ⭐⭐ | 需要页面级位置信息时使用 |
| `model.json` | ⭐⭐ | ⭐ | 调试/分析模型精度时使用 |
