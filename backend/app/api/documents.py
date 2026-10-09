import threading
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Query

from app.db.document_repo import DocumentRepository
from app.models.document import DocumentRecord, SUPPORTED_FILE_TYPES
from app.services.kg_service import KGService
from app.pipeline import run_pipeline

router = APIRouter(prefix="/api/v1/documents", tags=["Documents"])
repo = DocumentRepository()
DATA_DIR = Path(__file__).parent.parent.parent / "data" / "uploads"


@router.post("/upload", status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    ocr: bool = Form(True),
    language: str = Form("ch"),
    pages: str = Form(None),
    model: str = Form("vlm"),
):
    if not file.filename:
        raise HTTPException(400, "文件名不能为空")
    ext = Path(file.filename).suffix.lower()
    file_type = SUPPORTED_FILE_TYPES.get(ext)
    if not file_type:
        raise HTTPException(400, detail={
            "error": "UNSUPPORTED_FILE_TYPE",
            "message": f"不支持的文件格式: {ext}",
        })
    content = await file.read()
    if len(content) == 0:
        raise HTTPException(400, "文件内容为空")

    doc_id = f"doc_{uuid.uuid4().hex[:8]}"
    now = datetime.now().isoformat()
    output_dir = DATA_DIR / doc_id
    output_dir.mkdir(parents=True, exist_ok=True)

    # 创建文档记录（初始状态 pending）
    doc = DocumentRecord(
        doc_id=doc_id, filename=file.filename, file_size=len(content),
        file_type=file_type, status="pending", progress=0,
        created_at=now, updated_at=now, output_path=str(output_dir),
    )
    repo.insert(doc)

    # 保存文件
    file_path = output_dir / file.filename
    file_path.write_bytes(content)

    # 后台启动索引管线
    thread = threading.Thread(
        target=run_pipeline,
        args=(doc_id, file_path, output_dir),
        daemon=True,
    )
    thread.start()

    return doc.to_api()


@router.get("")
async def list_documents(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100), status: str = Query(None)):
    docs, total = repo.list_all(page, page_size, status)
    items = []
    for d in docs:
        item = d.to_api()
        if d.status == "done" and d.kg_path:
            try:
                kg = KGService().load(d.kg_path)
                item["kg_stats"] = KGService().get_stats(kg)
            except Exception:
                pass
        items.append(item)
    return {"total": total, "page": page, "page_size": page_size, "items": items}


@router.get("/{doc_id}")
async def get_document(doc_id: str):
    doc = repo.get(doc_id)
    if not doc:
        raise HTTPException(404, "文档不存在")
    item = doc.to_api()
    if doc.status == "done" and doc.kg_path:
        try:
            kg = KGService().load(doc.kg_path)
            item["kg_stats"] = KGService().get_stats(kg)
        except Exception:
            pass
    return item


@router.delete("/{doc_id}")
async def delete_document(doc_id: str):
    if not repo.delete(doc_id):
        raise HTTPException(404, "文档不存在")
    KGService().clear_cache()
    return {"message": "文档已删除", "doc_id": doc_id}
