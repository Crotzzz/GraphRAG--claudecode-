from dataclasses import dataclass, asdict
from typing import Optional


@dataclass
class ThreadRecord:
    thread_id: str
    doc_id: Optional[str] = None
    title: str = ""
    message_count: int = 0
    created_at: str = ""
    updated_at: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class MessageRecord:
    message_id: str
    thread_id: str
    role: str
    content: str
    tool_calls: Optional[list] = None
    sources: Optional[list] = None
    latency_ms: Optional[int] = None
    created_at: str = ""

    def to_dict(self) -> dict:
        result = {"role": self.role, "content": self.content, "created_at": self.created_at}
        if self.tool_calls: result["tool_calls"] = self.tool_calls
        if self.sources: result["sources"] = self.sources
        if self.latency_ms is not None: result["latency_ms"] = self.latency_ms
        return result
