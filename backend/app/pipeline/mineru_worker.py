"""
mineru_worker.py — 被 app.py 通过 subprocess 调用（运行在 MinerU venv 下）
功能: 接收 PDF 文件路径，调用 MinerU SDK 解析，输出 content_list.json

使用方式（由 pipeline_runner.py 跨环境调用）:
  mineru_mvp_test/.venv/Scripts/python.exe mineru_worker.py --pdf ./xxx.pdf --out ./output/
"""

import json
import os
import sys
import argparse
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", required=True, help="PDF 文件路径")
    parser.add_argument("--out", required=True, help="输出目录")
    args = parser.parse_args()

    pdf_path = Path(args.pdf)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    if not pdf_path.exists():
        print(f"[worker] 错误: PDF 不存在 -> {pdf_path}")
        sys.exit(1)

    # 加载环境变量（backend/.env）
    from dotenv import load_dotenv
    env_path = Path(__file__).parent.parent.parent / ".env"
    if env_path.exists():
        load_dotenv(env_path)
        print(f"[worker] 加载 .env: {env_path}")
    else:
        print(f"[worker] 未找到 .env: {env_path}")

    import os as os_module
    token = os_module.environ.get("MINERU_TOKEN", "")
    if not token:
        print("[worker] 错误: MINERU_TOKEN 未设置")
        sys.exit(1)

    from mineru import MinerU

    print(f"[worker] MinerU 开始解析: {pdf_path.name}")
    client = MinerU(token)
    result = client.extract(
        source=str(pdf_path),
        model="vlm",
        ocr=True,
        formula=True,
        table=True,
        language="ch",
        timeout=300,
    )

    # 输出 content_list.json
    if result.content_list:
        cl_path = out_dir / "content_list.json"
        with open(cl_path, "w", encoding="utf-8") as f:
            json.dump(result.content_list, f, ensure_ascii=False, indent=2)
        print(f"[worker] content_list.json 已保存 ({len(result.content_list)} 块)")

    # 输出 markdown
    if hasattr(result, "markdown") and result.markdown:
        md_path = out_dir / "full.md"
        md_path.write_text(result.markdown, encoding="utf-8")
        print(f"[worker] full.md 已保存 ({len(result.markdown)} 字符)")

    print(f"[worker] MinerU 解析完成")
    print(f"[worker] RESULT_CONTENT_LIST={cl_path}")


if __name__ == "__main__":
    main()
