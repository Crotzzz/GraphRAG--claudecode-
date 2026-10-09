"""
pipeline — 完整索引管线（MinerU → LangExtract → 知识图谱）
"""

import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

from app.db.database import now_iso
from app.db.document_repo import DocumentRepository

MINERU_WORKER = Path(__file__).parent / "mineru_worker.py"


def run_pipeline(doc_id: str, pdf_path: Path, output_dir: Path):
    """在后台线程中执行完整索引管线。"""
    repo = DocumentRepository()

    def _update(progress: int, status: str = "running", error: str = ""):
        if error:
            repo.update(doc_id, progress=progress, status=status, error=error)
        else:
            repo.update(doc_id, progress=progress, status=status)

    _update(5)
    cl_path = None
    full_text = None

    try:
        # ── Step 1: MinerU 解析 ──
        _update(10)
        if _check_mineru_token():
            mineru_out = output_dir / "mineru_raw"
            mineru_out.mkdir(parents=True, exist_ok=True)
            env = os.environ.copy()
            env["PYTHONIOENCODING"] = "utf-8"
            result = subprocess.run(
                [sys.executable, str(MINERU_WORKER),
                 "--pdf", str(pdf_path), "--out", str(mineru_out)],
                env=env, capture_output=True, timeout=600,
            )
            stdout = result.stdout.decode("utf-8", errors="replace")
            stderr = result.stderr.decode("utf-8", errors="replace")
            if result.returncode == 0:
                cl = mineru_out / "content_list.json"
                if cl.exists():
                    cl_path = cl
                    md = mineru_out / "full.md"
                    if md.exists():
                        repo.update(doc_id, markdown_path=str(md))
                    _update(35)
                else:
                    print(f"[pipeline] MinerU 未生成 content_list.json")
            else:
                print(f"[pipeline] MinerU 失败: {stderr[:200]}")
        else:
            print(f"[pipeline] MinerU 不可用（无 Token），跳过 MinerU")

        # ── Step 2: 提取纯文本 ──
        _update(40)
        if cl_path and cl_path.exists():
            from .content_list_loader import extract_text_from_content_list
            content_list = json.loads(cl_path.read_text(encoding="utf-8"))
            full_text = extract_text_from_content_list(content_list)
            repo.update(doc_id, content_list_path=str(cl_path))
        else:
            full_text = f"文档: {pdf_path.name}\n文件大小: {pdf_path.stat().st_size} 字节\n"
            try:
                import PyPDF2
                with open(pdf_path, "rb") as f:
                    reader = PyPDF2.PdfReader(f)
                    for page in reader.pages:
                        full_text += f"\n{page.extract_text()}"
                print(f"[pipeline] PyPDF2 提取文本: {len(full_text)} 字符")
            except Exception:
                pass

        if not full_text:
            full_text = f"文档: {pdf_path.name}"

        input_text_path = output_dir / "input_text.txt"
        input_text_path.write_text(full_text, encoding="utf-8")

        # ── Step 3: LangExtract 实体提取 ──
        _update(60)
        extractions_path = _run_langextract(full_text, output_dir)
        if not extractions_path:
            print("[pipeline] LangExtract 提取失败，跳过")
            _update(90, status="done", error="LangExtract 提取失败")
            return

        # ── Step 4: 知识图谱构建 ──
        _update(80)
        kg_path = _run_graph_builder(extractions_path, output_dir)
        if kg_path:
            repo.update(doc_id, kg_path=str(kg_path))
            _update(100, status="done")
            print(f"[pipeline] 完成! KG: {kg_path}")
        else:
            _update(95, status="done", error="知识图谱构建失败")

    except Exception as e:
        import traceback
        traceback.print_exc()
        repo.update(doc_id, status="failed", progress=0, error=str(e)[:200])


def _check_mineru_token() -> bool:
    """检查 MinerU Token 是否可用。"""
    load_dotenv(Path(__file__).parent.parent.parent / ".env")
    token = os.environ.get("MINERU_TOKEN", "")
    return bool(token)


def _run_langextract(text: str, output_dir: Path) -> Path | None:
    """调用 LangExtract + DeepSeek 提取实体。"""
    try:
        load_dotenv(Path(__file__).parent.parent.parent / ".env")
        api_key = os.environ.get("DEEPSEEK_API_KEY", "")

        if not api_key:
            print("[pipeline] DEEPSEEK_API_KEY 未配置")
            return None

        import langextract as lx
        from langextract.factory import ModelConfig

        prompt = """你是一个信息提取助手。请从以下文档内容中提取结构化信息。

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
- 输出必须为 JSON 格式"""

        example = lx.data.ExampleData(
            text="患者男性，65岁，因咳嗽咳痰3天就诊。T 38.5℃，BP 130/80mmHg。"
                 "诊断: 社区获得性肺炎。处方: 阿莫西林克拉维酸钾625mg tid",
            extractions=[
                lx.data.Extraction("patient", "患者男性，65岁",
                    attributes={"name": "未知", "age": "65岁", "gender": "男性"}),
                lx.data.Extraction("symptom", "咳嗽咳痰3天", attributes={"duration": "3天"}),
                lx.data.Extraction("vital_sign", "T 38.5℃", attributes={"value": "38.5", "unit": "℃"}),
                lx.data.Extraction("vital_sign", "BP 130/80mmHg", attributes={"value": "130/80", "unit": "mmHg"}),
                lx.data.Extraction("disease", "社区获得性肺炎", attributes={"classification": "社区获得性"}),
                lx.data.Extraction("medication", "阿莫西林克拉维酸钾625mg tid",
                    attributes={"dosage": "625mg", "frequency": "tid"}),
            ],
        )

        config = ModelConfig(
            model_id=os.environ.get("DEEPSEEK_MODEL", "deepseek-v4-flash"),
            provider="openai",
            provider_kwargs={
                "api_key": api_key,
                "base_url": os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
            },
        )

        result = lx.extract(
            text_or_documents=text,
            prompt_description=prompt,
            examples=[example],
            config=config,
            use_schema_constraints=False,
            format_type=lx.data.FormatType.JSON,
            max_char_buffer=2000,
            debug=False,
            show_progress=False,
        )

        ex_path = output_dir / "extractions.jsonl"
        lx.io.save_annotated_documents(
            [result], output_dir=str(output_dir),
            output_name="extractions.jsonl", show_progress=False,
        )

        extraction_count = len(result.extractions) if result.extractions else 0
        print(f"[pipeline] LangExtract 提取完成: {extraction_count} 个实体")
        return ex_path

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[pipeline] LangExtract 失败: {e}")
        return None


def _run_graph_builder(extractions_path: Path, output_dir: Path) -> Path | None:
    """从 extractions 构建知识图谱。"""
    try:
        from .graph_builder import build_nodes, build_relationships

        docs = []
        with open(extractions_path, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    docs.append(json.loads(line))

        all_nodes = []
        all_relationships = []
        for doc in docs:
            document_id = doc.get("document_id", "unknown")
            extractions = doc.get("extractions", [])
            nodes = build_nodes(extractions, document_id)
            text = doc.get("text", "")
            for node in nodes:
                ci = node["source"].get("char_interval")
                if ci and text:
                    s = ci.get("start_pos", 0)
                    e = ci.get("end_pos", 0)
                    if s is not None and e is not None:
                        ctx_s = max(0, s - 30)
                        ctx_e = min(len(text), e + 30)
                        pre = "..." if ctx_s > 0 else ""
                        suf = "..." if ctx_e < len(text) else ""
                        node["source"]["context"] = f"{pre}{text[ctx_s:ctx_e]}{suf}"
            relationships = build_relationships(nodes, document_id)
            all_nodes.extend(nodes)
            all_relationships.extend(relationships)

        node_types = {}
        for n in all_nodes:
            node_types[n["label"]] = node_types.get(n["label"], 0) + 1
        rel_types = {}
        for r in all_relationships:
            rel_types[r["type"]] = rel_types.get(r["type"], 0) + 1

        kg = {
            "metadata": {
                "total_extractions_input": sum(len(d.get("extractions", [])) for d in docs),
                "hallucinations_filtered": 0,
                "duplicates_removed": 0,
                "total_nodes": len(all_nodes),
                "total_relationships": len(all_relationships),
                "node_types": node_types,
                "relationship_types": rel_types,
                "built_at": datetime.now().isoformat(),
            },
            "nodes": all_nodes,
            "relationships": all_relationships,
        }

        kg_path = output_dir / "knowledge_graph.json"
        kg_path.write_text(json.dumps(kg, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[pipeline] 知识图谱构建完成: {len(all_nodes)} 节点, {len(all_relationships)} 关系")
        return kg_path

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[pipeline] 图构建失败: {e}")
        return None
