"""
content_list_loader.py — MinerU content_list → 纯文本提取
============================================================
功能: 读取 MinerU 解析输出的 content_list.json，按阅读顺序提取纯文本
      过滤页眉/页脚/页码等辅助块，保留正文/表格/公式/代码内容

输入: MinerU MVP 输出的 content_list.json
输出: 纯文本文件 input_text.txt（作为 LangExtract 的输入）

使用方式:
  python content_list_loader.py --input ../mineru_mvp_test/output/{ts}/content_list.json
  python content_list_loader.py --input ../mineru_mvp_test/output/{ts}/content_list.json --output ./output/custom.txt
"""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path


# 需要过滤的辅助块类型
SKIP_TYPES = frozenset({
    "header",        # 页眉
    "footer",        # 页脚
    "page_number",   # 页码
    "discarded",     # 被丢弃的块
    "seal",          # 印章
})


def extract_text_from_content_list(content_list: list[dict]) -> str:
    """从 MinerU content_list 中提取可读文本，保留阅读顺序。

    Args:
        content_list: content_list.json 的 Python 对象（JSON 数组）

    Returns:
        拼接后的纯文本字符串，块之间以换行分隔
    """
    text_parts = []

    for block in content_list:
        block_type = block.get("type", "")

        # 跳过辅助块（页眉/页脚/页码等）
        if block_type in SKIP_TYPES:
            continue

        # 按类型提取文本内容
        if block_type == "text":
            text = block.get("text", "")
            if text:
                text_parts.append(text)

        elif block_type == "table":
            # 优先取 HTML 表格结构，保留完整表格数据
            table_body = block.get("table_body", "")
            if table_body:
                text_parts.append(f"[表格]\n{table_body}")
            else:
                # 降级：取 table_caption 或截图路径
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
            if caption:
                text_parts.append(f"[图片: {caption}]")
            elif img_path:
                text_parts.append(f"[图片: {img_path}]")

        elif block_type == "list":
            # 列表项可能以 list_items 或 text 形式存在
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
            # 未知类型：尝试提取 text 字段
            text = block.get("text", "")
            if text:
                text_parts.append(f"[{block_type}] {text}")

    return "\n".join(text_parts)


def load_content_list(file_path: str) -> list[dict]:
    """加载 content_list.json 文件。

    Args:
        file_path: content_list.json 的路径

    Returns:
        解析后的 JSON 数组
    """
    path = Path(file_path)
    if not path.exists():
        print(f"  [错误] 文件不存在: {path}")
        sys.exit(1)

    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if not isinstance(data, list):
        print(f"  [错误] content_list.json 应为 JSON 数组，实际类型: {type(data).__name__}")
        sys.exit(1)

    return data


def main():
    parser = argparse.ArgumentParser(
        description="从 MinerU content_list.json 提取纯文本"
    )
    parser.add_argument(
        "--input", "-i",
        required=True,
        help="MinerU 输出的 content_list.json 路径"
    )
    parser.add_argument(
        "--output", "-o",
        default=None,
        help="输出文本文件路径（默认自动生成）"
    )
    parser.add_argument(
        "--stats", action="store_true",
        default=True,
        help="显示统计信息"
    )

    args = parser.parse_args()

    input_path = Path(args.input)

    # 加载
    print(f"\n  [加载] content_list.json: {input_path}")
    content_list = load_content_list(str(input_path))

    # 统计
    type_counts = {}
    for block in content_list:
        bt = block.get("type", "unknown")
        type_counts[bt] = type_counts.get(bt, 0) + 1

    if args.stats:
        print(f"  [统计] 总内容块数: {len(content_list)}")
        print(f"  [统计] 类型分布:")
        for t, c in sorted(type_counts.items(), key=lambda x: -x[1]):
            filter_tag = " (已过滤)" if t in SKIP_TYPES else ""
            print(f"         - {t}: {c} 个{filter_tag}")

    # 提取文本
    full_text = extract_text_from_content_list(content_list)

    # 确定输出路径
    if args.output:
        output_path = Path(args.output)
    else:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_dir = Path(__file__).parent / "output" / ts
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = output_dir / "input_text.txt"

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(full_text, encoding="utf-8")

    print(f"  [输出] 文本已保存: {output_path}")
    print(f"  [输出] 文本长度: {len(full_text)} 字符")
    print(f"  [输出] 文本行数: {full_text.count(chr(10)) + 1} 行")

    # 打印预览
    preview_lines = full_text.split("\n")[:8]
    print(f"\n  [预览] 前 8 行:")
    for line in preview_lines:
        if line:
            print(f"    {line[:100]}")


if __name__ == "__main__":
    main()
