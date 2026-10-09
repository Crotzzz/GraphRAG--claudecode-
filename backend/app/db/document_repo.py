from typing import Optional
from app.db.database import get_db, now_iso
from app.models.document import DocumentRecord


class DocumentRepository:

    def insert(self, doc: DocumentRecord):
        conn = get_db()
        try:
            conn.execute(
                """INSERT INTO documents
                   (doc_id, filename, file_size, file_type, status, progress,
                    error, created_at, updated_at, output_path,
                    markdown_path, content_list_path, kg_path)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (doc.doc_id, doc.filename, doc.file_size, doc.file_type,
                 doc.status, doc.progress, doc.error,
                 doc.created_at, doc.updated_at, doc.output_path,
                 doc.markdown_path, doc.content_list_path, doc.kg_path)
            )
            conn.commit()
        finally:
            conn.close()

    def update(self, doc_id: str, **kwargs):
        fields = [f"{k} = ?" for k in kwargs]
        values = list(kwargs.values())
        conn = get_db()
        try:
            conn.execute(
                f"UPDATE documents SET {', '.join(fields)}, updated_at = ? WHERE doc_id = ?",
                [*values, now_iso(), doc_id]
            )
            conn.commit()
        finally:
            conn.close()

    def get(self, doc_id: str) -> Optional[DocumentRecord]:
        conn = get_db()
        try:
            row = conn.execute("SELECT * FROM documents WHERE doc_id = ?", (doc_id,)).fetchone()
            return DocumentRecord(**dict(row)) if row else None
        finally:
            conn.close()

    def list_all(self, page: int = 1, page_size: int = 20, status: Optional[str] = None):
        conn = get_db()
        try:
            where = ""
            params = []
            if status:
                where = "WHERE status = ?"
                params.append(status)
            total = conn.execute(f"SELECT COUNT(*) FROM documents {where}", params).fetchone()[0]
            params.extend([page_size, (page - 1) * page_size])
            rows = conn.execute(
                f"SELECT * FROM documents {where} ORDER BY created_at DESC LIMIT ? OFFSET ?", params
            ).fetchall()
            return [DocumentRecord(**dict(r)) for r in rows], total
        finally:
            conn.close()

    def delete(self, doc_id: str) -> bool:
        conn = get_db()
        try:
            cur = conn.execute("DELETE FROM documents WHERE doc_id = ?", (doc_id,))
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()
