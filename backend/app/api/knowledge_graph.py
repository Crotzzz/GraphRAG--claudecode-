from fastapi import APIRouter, HTTPException, Query
from app.services.kg_service import KGService
from app.db.document_repo import DocumentRepository

router = APIRouter(prefix="/api/v1/kg", tags=["Knowledge Graph"])
kg_svc = KGService()
doc_repo = DocumentRepository()


def _get_kg(doc_id: str):
    doc = doc_repo.get(doc_id)
    if not doc or not doc.kg_path:
        raise HTTPException(404, detail={"error": "KG_NOT_FOUND", "message": "知识图谱未就绪"})
    return kg_svc.load(doc.kg_path)


@router.get("/{doc_id}")
async def get_full_kg(doc_id: str):
    kg = _get_kg(doc_id)
    result = {"metadata": kg.get("metadata", {}), "nodes": [], "relationships": kg.get("relationships", [])}
    for n in kg.get("nodes", []):
        result["nodes"].append({k: v for k, v in n.items() if not k.startswith("_")})
    return result


@router.get("/{doc_id}/stats")
async def get_kg_stats(doc_id: str):
    return kg_svc.get_stats(_get_kg(doc_id))


@router.get("/{doc_id}/search")
async def search_kg(doc_id: str, q: str = Query(..., min_length=1), label: str = Query(None), limit: int = Query(20, ge=1, le=100)):
    results = kg_svc.search_nodes(_get_kg(doc_id), q, label, limit)
    items = []
    for r in results:
        items.append({
            "id": r.get("id"), "label": r.get("label"), "name": r.get("name", "")[:80],
            "properties": r.get("properties", {}), "source": r.get("source", {}),
            "related_count": r.get("_related_count", 0),
        })
    return {"query": q, "total": len(items), "results": items}


@router.get("/{doc_id}/entities/{entity_id}")
async def get_entity_detail(doc_id: str, entity_id: str):
    kg = _get_kg(doc_id)
    entity = kg_svc.get_entity(kg, entity_id)
    if not entity:
        raise HTTPException(404, detail={"error": "ENTITY_NOT_FOUND", "message": f"实体不存在: {entity_id}"})
    rels = kg_svc.get_entity_relations(kg, entity_id)
    return {"entity": entity, "outgoing_relations": rels["outgoing"], "incoming_relations": rels["incoming"]}
