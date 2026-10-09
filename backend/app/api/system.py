import time
from pathlib import Path
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from app.services.config_service import ConfigService
from app.db.document_repo import DocumentRepository
from app.db.thread_repo import ThreadRepository
import os

router = APIRouter(prefix="/api/v1/system", tags=["System"])
config_svc = ConfigService()
_start_time = time.time()


class ConfigBody(BaseModel):
    llm_model: Optional[str] = None
    llm_base_url: Optional[str] = None
    mineru_model: Optional[str] = None
    mineru_language: Optional[str] = None


@router.get("/health")
async def health_check():
    doc_repo = DocumentRepository()
    thread_repo = ThreadRepository()
    _, doc_count = doc_repo.list_all(page=1, page_size=1)
    _, thread_count = thread_repo.list_threads(page=1, page_size=1)
    deepseek_ok = bool(os.environ.get("DEEPSEEK_API_KEY", ""))
    return {
        "status": "healthy", "version": "1.0.0",
        "uptime_seconds": int(time.time() - _start_time),
        "docs_count": doc_count, "threads_count": thread_count,
        "deepseek_api": "connected" if deepseek_ok else "missing_key",
        "disk_usage_percent": 0,
    }


@router.get("/config")
async def get_config():
    return config_svc.get_all()


@router.put("/config")
async def update_config(body: ConfigBody):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if updates:
        config_svc.update(updates)
    return config_svc.get_all()
