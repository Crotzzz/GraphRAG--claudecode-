from dataclasses import dataclass, asdict
from typing import Optional


@dataclass
class AgentQueryRequest:
    doc_id: str
    question: str
    thread_id: Optional[str] = None


@dataclass
class SourceInfo:
    type: str
    label: str
    name: str
    confidence: Optional[str] = None
    document_id: Optional[str] = None
    relation: Optional[str] = None

    def to_dict(self) -> dict:
        return {k: v for k, v in asdict(self).items() if v is not None}


@dataclass
class ToolCallDetail:
    tool: str
    args: dict
    result_summary: str
    latency_ms: int = 0

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class AgentQueryResponse:
    answer: str
    sources: Optional[list] = None
    tool_calls: Optional[list] = None
    tool_call_details: Optional[list] = None
    latency_ms: int = 0
    thread_id: Optional[str] = None

    def to_dict(self) -> dict:
        return {k: v for k, v in asdict(self).items() if v is not None}
