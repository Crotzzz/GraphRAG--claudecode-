"""
graph_builder.py — LangExtract 提取结果 → 知识图谱
=====================================================
功能: 读取 extractions.jsonl，过滤幻觉，构建知识图谱节点和关系

核心处理流程:
  ① 加载 extractions.jsonl ← LangExtract Pipeline 输出
  ② 幻觉过滤: char_interval is None → 丢弃
  ③ 实体节点构建: extraction_class → label, attributes → properties
  ④ 关系构建: 根据 extraction_class 映射规则建立实体间关系
  ⑤ 输出 knowledge_graph.json

使用方式:
  python graph_builder.py --input ../langextract/mvp_test/output/{ts}/extractions.jsonl
  python graph_builder.py --input ../graphrag_pipeline/output/{ts}/extractions.jsonl
"""

import argparse
import json
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path


# ================================================================
#  关系构建规则配置
# ================================================================
# 定义哪些实体类型之间可以建立关系
# 格式: {关系类型: (源节点类型列表, 目标节点类型列表)}
# 规则: 同文档内，源节点类型列表中的第一个实体，与目标节点类型列表中的所有实体建立关系
RELATIONSHIP_RULES = {
    "has_symptom":        (["patient"],       ["symptom"]),
    "has_disease":        (["patient"],       ["disease"]),
    "has_medication":     (["patient"],       ["medication"]),
    "has_vital_sign":     (["patient"],       ["vital_sign"]),
    "has_lab_result":     (["patient"],       ["lab_result"]),
    "treated_with":       (["disease"],       ["medication"]),
}

# 不需要建立关系的实体类型（如辅助信息类型）
SKIP_RELATION_TYPES = frozenset()


def load_extractions(jsonl_path: str) -> list[dict]:
    """加载 extractions.jsonl 文件。

    Args:
        jsonl_path: extractions.jsonl 路径

    Returns:
        解析后的 AnnotatedDocument 字典列表
    """
    path = Path(jsonl_path)
    if not path.exists():
        print(f"  [错误] 文件不存在: {path}")
        sys.exit(1)

    docs = []
    with open(path, "r", encoding="utf-8") as f:
        for i, line in enumerate(f):
            line = line.strip()
            if not line:
                continue
            try:
                doc = json.loads(line)
                docs.append(doc)
            except json.JSONDecodeError as e:
                print(f"  [警告] 第 {i+1} 行 JSON 解析失败: {e}")
                continue

    if not docs:
        print(f"  [错误] 文件中没有有效的提取数据")
        sys.exit(1)

    return docs


def build_nodes(extractions: list[dict], document_id: str) -> list[dict]:
    """从提取结果构建知识图谱实体节点。

    Args:
        extractions: AnnotatedDocument 中的 extractions 列表
        document_id: 文档唯一标识

    Returns:
        节点列表
    """
    nodes = []
    seen_texts = set()  # 去重

    for i, ext in enumerate(extractions):
        # ── ① 幻觉过滤 ──
        char_interval = ext.get("char_interval")
        if char_interval is None:
            continue

        extraction_class = ext.get("extraction_class", "unknown")
        extraction_text = ext.get("extraction_text", "")

        # 去重（同一文档中相同类别+相同文本视为重复）
        dedup_key = f"{extraction_class}::{extraction_text}"
        if dedup_key in seen_texts:
            continue
        seen_texts.add(dedup_key)

        # ── ② 构建节点 ──
        node = {
            "id": f"entity_{document_id}_{i}",
            "label": extraction_class,
            "name": extraction_text,
            "properties": ext.get("attributes") or {},
            "source": {
                "document_id": document_id,
                "char_interval": char_interval,
                "alignment_status": ext.get("alignment_status"),
            },
        }
        nodes.append(node)

    return nodes


def build_relationships(nodes: list[dict], document_id: str) -> list[dict]:
    """根据关系规则在实体节点之间建立关系。

    策略:
      - 按 label 分组
      - 对每条规则，找到源节点和目标节点
      - 源节点中的第一个与所有目标节点建立关系

    Args:
        nodes: 节点列表
        document_id: 文档唯一标识

    Returns:
        关系列表
    """
    # 按 label 分组
    groups = defaultdict(list)
    for node in nodes:
        groups[node["label"]].append(node)

    relationships = []
    rel_index = 0

    for rel_type, (source_types, target_types) in RELATIONSHIP_RULES.items():
        for source_type in source_types:
            sources = groups.get(source_type, [])
            if not sources:
                continue

            for target_type in target_types:
                targets = groups.get(target_type, [])
                if not targets:
                    continue

                # 建立关系：第一个源节点 → 所有目标节点
                source_node = sources[0]
                for target_node in targets:
                    # 跳过自引用
                    if source_node["id"] == target_node["id"]:
                        continue

                    relationships.append({
                        "id": f"rel_{document_id}_{rel_index}",
                        "type": rel_type,
                        "source_id": source_node["id"],
                        "source_label": source_type,
                        "source_name": source_node["name"],
                        "target_id": target_node["id"],
                        "target_label": target_type,
                        "target_name": target_node["name"],
                        "properties": {},
                        "document_id": document_id,
                    })
                    rel_index += 1

    return relationships


def extract_text_snippet(text: str, char_interval: dict, context_chars: int = 30) -> str:
    """从原始文本中提取实体周围的上下文片段。

    Args:
        text: 原始文档文本
        char_interval: {"start_pos": int, "end_pos": int}
        context_chars: 上下文包含的字符数

    Returns:
        带上下文的文本片段
    """
    if not text or not char_interval:
        return ""

    start = char_interval.get("start_pos")
    end = char_interval.get("end_pos")
    if start is None or end is None:
        return ""

    ctx_start = max(0, start - context_chars)
    ctx_end = min(len(text), end + context_chars)

    prefix = "..." if ctx_start > 0 else ""
    suffix = "..." if ctx_end < len(text) else ""

    return f"{prefix}{text[ctx_start:ctx_end]}{suffix}"


def build_knowledge_graph(docs: list[dict]) -> dict:
    """构建完整的知识图谱。

    Args:
        docs: AnnotatedDocument 字典列表

    Returns:
        知识图谱数据: {nodes: [...], relationships: [...], metadata: {...}}
    """
    all_nodes = []
    all_relationships = []
    total_extractions = 0
    filtered_hallucinations = 0
    dedup_removed = 0

    for doc in docs:
        document_id = doc.get("document_id", "unknown")
        extractions = doc.get("extractions", [])
        text = doc.get("text", "")

        total_extractions += len(extractions)

        # 统计幻觉
        hallucination_count = sum(
            1 for e in extractions if e.get("char_interval") is None
        )
        filtered_hallucinations += hallucination_count

        # 构建节点（内部已做幻觉过滤 + 去重）
        nodes = build_nodes(extractions, document_id)

        # 统计去重移除数
        seen = set()
        for e in extractions:
            ci = e.get("char_interval")
            if ci is not None:
                key = f"{e.get('extraction_class','')}::{e.get('extraction_text','')}"
                seen.add(key)
        dedup_removed += (
            len(extractions)
            - hallucination_count
            - len(nodes)
        )

        # 构建关系
        relationships = build_relationships(nodes, document_id)

        # 添加上下文片段到节点
        for node in nodes:
            ci = node["source"]["char_interval"]
            node["source"]["context"] = extract_text_snippet(text, ci)

        all_nodes.extend(nodes)
        all_relationships.extend(relationships)

    # 构建metadata
    entity_types = defaultdict(int)
    for node in all_nodes:
        entity_types[node["label"]] += 1

    relation_types = defaultdict(int)
    for rel in all_relationships:
        relation_types[rel["type"]] += 1

    metadata = {
        "total_extractions_input": total_extractions,
        "hallucinations_filtered": filtered_hallucinations,
        "duplicates_removed": dedup_removed,
        "total_nodes": len(all_nodes),
        "total_relationships": len(all_relationships),
        "node_types": dict(entity_types),
        "relationship_types": dict(relation_types),
        "built_at": datetime.now().isoformat(),
    }

    return {
        "metadata": metadata,
        "nodes": all_nodes,
        "relationships": all_relationships,
    }


def main():
    parser = argparse.ArgumentParser(
        description="从 LangExtract 输出构建知识图谱"
    )
    parser.add_argument(
        "--input", "-i",
        required=True,
        help="extractions.jsonl 路径（LangExtract 输出）"
    )
    parser.add_argument(
        "--output", "-o",
        default=None,
        help="输出 knowledge_graph.json 路径（默认自动生成）"
    )

    args = parser.parse_args()

    input_path = Path(args.input)

    print()
    print("  " + "=" * 58)
    print("  知识图谱构建")
    print("  " + "=" * 58)

    # Step 1: 加载提取结果
    print(f"\n  [Step 1/3] 加载提取结果")
    print(f"     文件: {input_path}")
    docs = load_extractions(str(input_path))
    total_exts = sum(len(d.get("extractions", [])) for d in docs)
    print(f"     文档数: {len(docs)}")
    print(f"     提取总数: {total_exts} 个")

    # Step 2: 构建知识图谱
    print(f"\n  [Step 2/3] 构建知识图谱")
    kg = build_knowledge_graph(docs)
    meta = kg["metadata"]

    print(f"     幻觉过滤: {meta['hallucinations_filtered']} 个")
    print(f"     去重移除: {meta['duplicates_removed']} 个")
    print(f"     有效节点: {meta['total_nodes']} 个")
    print(f"     有效关系: {meta['total_relationships']} 个")

    if meta["node_types"]:
        print(f"     节点类型:")
        for t, c in sorted(meta["node_types"].items(), key=lambda x: -x[1]):
            print(f"       - {t}: {c} 个")

    if meta["relationship_types"]:
        print(f"     关系类型:")
        for t, c in sorted(meta["relationship_types"].items(), key=lambda x: -x[1]):
            print(f"       - {t}: {c} 条")

    # Step 3: 输出
    print(f"\n  [Step 3/3] 输出知识图谱")

    if args.output:
        output_path = Path(args.output)
    else:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_dir = Path(__file__).parent / "output" / ts
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = output_dir / "knowledge_graph.json"

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(kg, f, ensure_ascii=False, indent=2)

    print(f"     文件: {output_path}")
    print(f"     大小: {output_path.stat().st_size / 1024:.1f} KB")
    print(f"\n  [完成] 知识图谱构建结束\n")

    # 预览前几个节点和关系
    if kg["nodes"]:
        print(f"  [预览] 前 3 个节点:")
        for node in kg["nodes"][:3]:
            print(f"       [{node['label']}] {node['name'][:60]}")
            if node["properties"]:
                props = ", ".join(f"{k}={v}" for k, v in list(node["properties"].items())[:3])
                print(f"          属性: {props}")

    if kg["relationships"]:
        print(f"  [预览] 前 3 条关系:")
        for rel in kg["relationships"][:3]:
            print(f"       ({rel['source_label']}) --[{rel['type']}]--> ({rel['target_label']})")
            print(f"         {rel['source_name'][:40]} -> {rel['target_name'][:40]}")


if __name__ == "__main__":
    main()
