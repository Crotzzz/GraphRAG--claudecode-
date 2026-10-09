from dataclasses import dataclass, asdict
from typing import Optional
from pathlib import Path


@dataclass
class DocumentRecord:
    doc_id: str
    filename: str
    file_size: int
    file_type: str
    status: str = "pending"
    progress: int = 0
    error: Optional[str] = None
    created_at: str = ""
    updated_at: str = ""
    output_path: str = ""
    markdown_path: Optional[str] = None
    content_list_path: Optional[str] = None
    kg_path: Optional[str] = None

    def to_dict(self) -> dict:
        return {k: v for k, v in asdict(self).items() if not k.startswith("_")}

    def to_api(self) -> dict:
        return {
            "doc_id": self.doc_id,
            "filename": self.filename,
            "file_size": self.file_size,
            "file_type": self.file_type,
            "status": self.status,
            "progress": self.progress,
            "error": self.error,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


SUPPORTED_FILE_TYPES = {
    ".pdf": "pdf", ".png": "image", ".jpg": "image", ".jpeg": "image",
    ".webp": "image", ".bmp": "image", ".gif": "image",
    ".doc": "doc", ".docx": "doc",
    ".ppt": "ppt", ".pptx": "ppt",
    ".xls": "xls", ".xlsx": "xls",
    ".html": "html", ".htm": "html",
}
