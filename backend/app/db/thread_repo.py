import json
from typing import Optional
from app.db.database import get_db, now_iso
from app.models.thread import ThreadRecord, MessageRecord


class ThreadRepository:

    def insert_thread(self, thread: ThreadRecord):
        conn = get_db()
        try:
            conn.execute(
                """INSERT INTO threads (thread_id, doc_id, title, message_count, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (thread.thread_id, thread.doc_id, thread.title,
                 thread.message_count, thread.created_at, thread.updated_at)
            )
            conn.commit()
        finally:
            conn.close()

    def update_thread(self, thread_id: str, **kwargs):
        fields = [f"{k} = ?" for k in kwargs]
        values = list(kwargs.values())
        conn = get_db()
        try:
            conn.execute(
                f"UPDATE threads SET {', '.join(fields)}, updated_at = ? WHERE thread_id = ?",
                [*values, now_iso(), thread_id]
            )
            conn.commit()
        finally:
            conn.close()

    def get_thread(self, thread_id: str) -> Optional[ThreadRecord]:
        conn = get_db()
        try:
            row = conn.execute("SELECT * FROM threads WHERE thread_id = ?", (thread_id,)).fetchone()
            return ThreadRecord(**dict(row)) if row else None
        finally:
            conn.close()

    def list_threads(self, page: int = 1, page_size: int = 20):
        conn = get_db()
        try:
            total = conn.execute("SELECT COUNT(*) FROM threads").fetchone()[0]
            rows = conn.execute(
                "SELECT * FROM threads ORDER BY updated_at DESC LIMIT ? OFFSET ?",
                (page_size, (page - 1) * page_size)
            ).fetchall()
            return [ThreadRecord(**dict(r)) for r in rows], total
        finally:
            conn.close()

    def delete_thread(self, thread_id: str) -> bool:
        conn = get_db()
        try:
            conn.execute("DELETE FROM messages WHERE thread_id = ?", (thread_id,))
            cur = conn.execute("DELETE FROM threads WHERE thread_id = ?", (thread_id,))
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()

    def insert_message(self, msg: MessageRecord):
        conn = get_db()
        try:
            tc = json.dumps(msg.tool_calls, ensure_ascii=False) if msg.tool_calls else None
            sc = json.dumps(msg.sources, ensure_ascii=False) if msg.sources else None
            conn.execute(
                """INSERT INTO messages (message_id, thread_id, role, content, tool_calls, sources, latency_ms, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (msg.message_id, msg.thread_id, msg.role, msg.content, tc, sc, msg.latency_ms, msg.created_at)
            )
            conn.execute("UPDATE threads SET message_count = message_count + 1, updated_at = ? WHERE thread_id = ?",
                         (now_iso(), msg.thread_id))
            conn.commit()
        finally:
            conn.close()

    def get_messages(self, thread_id: str) -> list[MessageRecord]:
        conn = get_db()
        try:
            rows = conn.execute(
                "SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at ASC", (thread_id,)
            ).fetchall()
            result = []
            for r in rows:
                d = dict(r)
                if d.get("tool_calls"): d["tool_calls"] = json.loads(d["tool_calls"])
                if d.get("sources"): d["sources"] = json.loads(d["sources"])
                result.append(MessageRecord(**d))
            return result
        finally:
            conn.close()
