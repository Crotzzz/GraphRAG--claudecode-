import json
from pathlib import Path
from typing import Optional


class KGService:
    """知识图谱加载、缓存和检索服务。"""

    def __init__(self):
        self._cache: dict[str, dict] = {}

    def load(self, kg_path: str) -> dict:
        kg_path = str(kg_path)
        if kg_path in self._cache:
            return self._cache[kg_path]
        path = Path(kg_path)
        if not path.exists():
            raise FileNotFoundError(f"知识图谱文件不存在: {kg_path}")
        kg = json.loads(path.read_text(encoding="utf-8"))
        nodes = kg.get("nodes", [])
        rels = kg.get("relationships", [])
        kg["_node_by_id"] = {n["id"]: n for n in nodes}
        kg["_nodes_by_label"] = {}
        for n in nodes:
            kg["_nodes_by_label"].setdefault(n["label"], []).append(n)
        kg["_rels_by_source"] = {}
        kg["_rels_by_target"] = {}
        for r in rels:
            kg["_rels_by_source"].setdefault(r["source_id"], []).append(r)
            kg["_rels_by_target"].setdefault(r["target_id"], []).append(r)
        self._cache[kg_path] = kg
        return kg

    def clear_cache(self, kg_path: str = None):
        if kg_path:
            self._cache.pop(kg_path, None)
        else:
            self._cache.clear()

    def get_stats(self, kg: dict) -> dict:
        nodes = kg.get("nodes", [])
        rels = kg.get("relationships", [])
        node_types = {}
        for n in nodes:
            node_types[n["label"]] = node_types.get(n["label"], 0) + 1
        rel_types = {}
        for r in rels:
            rel_types[r["type"]] = rel_types.get(r["type"], 0) + 1
        node_counts = {}
        for n in nodes:
            lbl = n["label"]
            if lbl not in node_counts:
                node_counts[lbl] = []
            node_counts[lbl].append({
                "name": n.get("name", "")[:50],
                "property_keys": list(n.get("properties", {}).keys()),
            })
        return {
            "total_nodes": len(nodes), "total_relationships": len(rels),
            "node_types": node_types, "relationship_types": rel_types,
            "node_counts_by_label": node_counts,
        }

    def search_nodes(self, kg: dict, query: str, label: str = None, limit: int = 20) -> list:
        nodes = kg.get("nodes", [])
        results = []
        q = query.lower()
        for n in nodes:
            if label and n["label"] != label:
                continue
            if q in n.get("name", "").lower() or q in n.get("label", "").lower():
                results.append(n)
                continue
            for v in n.get("properties", {}).values():
                if isinstance(v, str) and q in v.lower():
                    results.append(n)
                    break
        for r in results:
            r["_related_count"] = len(kg.get("_rels_by_source", {}).get(r["id"], []))
        results.sort(key=lambda x: x.get("_related_count", 0), reverse=True)
        return results[:limit]

    def get_entity(self, kg: dict, entity_id: str) -> Optional[dict]:
        node = kg.get("_node_by_id", {}).get(entity_id)
        if not node:
            return None
        return {k: v for k, v in node.items() if not k.startswith("_")}

    def get_entity_relations(self, kg: dict, entity_id: str) -> dict:
        return {
            "outgoing": kg.get("_rels_by_source", {}).get(entity_id, []),
            "incoming": kg.get("_rels_by_target", {}).get(entity_id, []),
        }
