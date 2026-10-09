import json
import os
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Generator

from dotenv import load_dotenv

from app.models.agent import AgentQueryRequest, AgentQueryResponse, SourceInfo, ToolCallDetail
from app.models.thread import ThreadRecord, MessageRecord
from app.db.thread_repo import ThreadRepository
from app.db.document_repo import DocumentRepository

# 加载 .env (backend/.env)
env_path = Path(__file__).parent.parent.parent / ".env"
if env_path.exists():
    load_dotenv(env_path)

DEEPSEEK_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-v4-flash")

KG_SYSTEM_PROMPT = """你是医疗知识图谱分析助手。你拥有一个完整的医疗病历知识图谱，
包含患者信息、症状、诊断、用药、生命体征和化验结果等实体，以及它们之间的关系。

## 可用的工具
1. **retrieve_kg(keyword)** — 搜索与关键词相关的实体信息
2. **query_graph(entity_name, relation_type?)** — 查询实体的关联关系
3. **list_entities(entity_type?)** — 浏览实体类型和清单

## 回答规则
1. 用户提问后，必须先分析问题需要哪些信息
2. 使用工具获取相关信息，不要凭空编造
3. 如果第一次检索结果不充分，可以多尝试不同关键词
4. 回答时引用知识图谱中的具体信息，说明实体之间的关系
5. 如果知识图谱中没有相关信息，如实告知用户
6. 回答要结构清晰、易于理解"""


class AgentService:

    def __init__(self):
        self.thread_repo = ThreadRepository()
        self._cache: dict[str, object] = {}

    def _get_kg_path(self, doc_id: str) -> str:
        repo = DocumentRepository()
        doc = repo.get(doc_id)
        if not doc or not doc.kg_path:
            raise ValueError(f"文档知识图谱未就绪: {doc_id}")
        return doc.kg_path

    def _load_kg(self, doc_id: str):
        from app.services.kg_service import KGService
        kg_path = self._get_kg_path(doc_id)
        return KGService().load(kg_path)

    def _create_agent(self, doc_id: str):
        from langchain.chat_models import init_chat_model
        from langchain.agents import create_agent
        from langchain.tools import tool as langchain_tool
        from app.services.kg_service import KGService

        kg_svc = KGService()
        # 预先加载指定文档的 KG（而非取最新文档）
        kg_path = self._get_kg_path(doc_id)
        kg = kg_svc.load(kg_path)

        @langchain_tool
        def retrieve_kg(keyword: str) -> str:
            """从知识图谱中搜索与关键词相关的实体信息。"""
            try:
                nodes = kg_svc.search_nodes(kg, keyword)
                if not nodes:
                    return f"未找到与「{keyword}」相关的实体。"
                lines = [f"找到 {len(nodes)} 个相关实体:"]
                for n in nodes[:10]:
                    props = n.get("properties", {})
                    ps = " | ".join(f"{k}: {v}" for k, v in props.items() if v)
                    line = f"[{n['label']}] {n['name'][:60]}"
                    if ps: line += f" ({ps})"
                    lines.append(line)
                return "\n".join(lines)
            except Exception as e:
                return f"检索失败: {e}"

        @langchain_tool
        def query_graph(entity_name: str, relation_type: str = "") -> str:
            """查询知识图谱中指定实体的关联关系和邻居节点。"""
            try:
                nodes = kg_svc.search_nodes(kg, entity_name)
                if not nodes:
                    return f"未找到与「{entity_name}」相关的实体。"
                results = []
                for n in nodes[:3]:
                    results.append(f"\n=== {n['label']}: {n['name'][:50]} ===")
                    for rel in kg.get("_rels_by_source", {}).get(n["id"], []):
                        if relation_type and rel["type"] != relation_type: continue
                        tgt = kg.get("_node_by_id", {}).get(rel["target_id"])
                        if tgt:
                            results.append(f"  --[{rel['type']}]--> [{tgt['label']}] {tgt['name'][:40]}")
                    for rel in kg.get("_rels_by_target", {}).get(n["id"], []):
                        if relation_type and rel["type"] != relation_type: continue
                        src = kg.get("_node_by_id", {}).get(rel["source_id"])
                        if src:
                            results.append(f"  <--[{rel['type']}]-- [{src['label']}] {src['name'][:40]}")
                return "\n".join(results)
            except Exception as e:
                return f"查询失败: {e}"

        @langchain_tool
        def list_entities(entity_type: str = "") -> str:
            """列出知识图谱中的所有实体类型，或指定类型的所有实体。"""
            try:
                if not entity_type:
                    labels = list(kg.get("_nodes_by_label", {}).keys())
                    total = len(kg.get("nodes", []))
                    rels = len(kg.get("relationships", []))
                    lines = [f"知识图谱共 {total} 个实体，{rels} 条关系", "实体类型:"]
                    for lbl in sorted(labels):
                        cnt = len(kg.get("_nodes_by_label", {}).get(lbl, []))
                        lines.append(f"  - {lbl}: {cnt} 个")
                    return "\n".join(lines)
                nodes = kg.get("_nodes_by_label", {}).get(entity_type, [])
                if not nodes:
                    avail = ", ".join(kg.get("_nodes_by_label", {}).keys())
                    return f"无「{entity_type}」类型实体。可用类型: {avail}"
                lines = [f"{entity_type} ({len(nodes)} 个):"]
                for n in nodes[:15]:
                    props = n.get("properties", {})
                    ps = ""
                    if props:
                        p = " | ".join(f"{k}: {v}" for k, v in props.items() if v)
                        if p: ps = f" ({p})"
                    lines.append(f"  - {n['name'][:50]}{ps}")
                if len(nodes) > 15:
                    lines.append(f"  ... 还有 {len(nodes) - 15} 个")
                return "\n".join(lines)
            except Exception as e:
                return f"查询失败: {e}"

        model = init_chat_model(
            DEEPSEEK_MODEL, model_provider="openai",
            api_key=DEEPSEEK_KEY, base_url=DEEPSEEK_BASE,
            temperature=0.0,
        )
        agent = create_agent(
            model=model,
            tools=[retrieve_kg, query_graph, list_entities],
            system_prompt=KG_SYSTEM_PROMPT,
            name="GraphRAG_Agent",
        )
        return agent

    def query(self, req: AgentQueryRequest) -> AgentQueryResponse:
        from langchain.messages import HumanMessage
        start = time.time()
        agent = self._create_agent(req.doc_id)
        thread_id = req.thread_id or f"thread_{uuid.uuid4().hex[:8]}"
        self._ensure_thread(thread_id, req.doc_id)
        self._save_user_message(thread_id, req.question)
        messages = self._build_messages(thread_id, req.question)
        response = agent.invoke({"messages": messages})
        answer = response["messages"][-1].content
        kg = self._load_kg(req.doc_id)
        sources = self._extract_sources(answer, kg)
        latency = int((time.time() - start) * 1000)
        self._save_assistant_message(thread_id, answer, sources, latency)
        return AgentQueryResponse(
            answer=answer, sources=[s.to_dict() for s in sources] if sources else None,
            latency_ms=latency, thread_id=thread_id,
        )

    def stream(self, req: AgentQueryRequest) -> Generator:
        from langchain.messages import HumanMessage
        yield {"type": "status", "stage": "ready", "message": "Agent 已就绪"}
        start = time.time()
        agent = self._create_agent(req.doc_id)
        thread_id = req.thread_id or f"thread_{uuid.uuid4().hex[:8]}"
        self._ensure_thread(thread_id, req.doc_id)
        self._save_user_message(thread_id, req.question)
        messages = self._build_messages(thread_id, req.question)

        # create_agent().stream() 在 DeepSeek 下不产生 token 级流式输出
        # 因此使用 invoke() 获取完整内容再拆分
        response = agent.invoke({"messages": messages})
        full_answer = response["messages"][-1].content

        # 模拟 token 级输出（按字符拆分）
        # 先发送工具调用状态
        for msg in response["messages"]:
            if hasattr(msg, "tool_calls") and msg.tool_calls:
                for tc in msg.tool_calls:
                    if isinstance(tc, dict):
                        yield {"type": "tool_call", "tool": tc.get("name", "unknown"), "args": tc.get("args", {})}
                    else:
                        yield {"type": "tool_call", "tool": getattr(tc, "name", "unknown"), "args": getattr(tc, "args", {})}

        # 作为单个 token 发送完整内容（前端打字机效果需要后端流式 token，且 DeepSeek 不支持流式）
        if full_answer:
            yield {"type": "token", "content": full_answer}

        latency = int((time.time() - start) * 1000)
        kg = self._load_kg(req.doc_id)
        sources = self._extract_sources(full_answer, kg)
        self._save_assistant_message(thread_id, full_answer, sources, latency)
        yield {"type": "done", "latency_ms": latency,
               "sources": [s.to_dict() for s in sources] if sources else [],
               "thread_id": thread_id}

    def _ensure_thread(self, thread_id: str, doc_id: str):
        existing = self.thread_repo.get_thread(thread_id)
        if not existing:
            now = datetime.now().isoformat()
            self.thread_repo.insert_thread(ThreadRecord(
                thread_id=thread_id, doc_id=doc_id, title="医疗知识图谱问答",
                created_at=now, updated_at=now,
            ))

    def _save_user_message(self, thread_id: str, content: str):
        self.thread_repo.insert_message(MessageRecord(
            message_id=f"msg_{uuid.uuid4().hex[:8]}", thread_id=thread_id,
            role="user", content=content, created_at=datetime.now().isoformat(),
        ))

    def _save_assistant_message(self, thread_id: str, content: str, sources: list, latency: int):
        self.thread_repo.insert_message(MessageRecord(
            message_id=f"msg_{uuid.uuid4().hex[:8]}", thread_id=thread_id,
            role="assistant", content=content,
            sources=[s.to_dict() for s in sources] if sources else None,
            latency_ms=latency, created_at=datetime.now().isoformat(),
        ))

    def _build_messages(self, thread_id: str, new_question: str) -> list:
        from langchain.messages import HumanMessage, AIMessage
        messages = []
        for msg in self.thread_repo.get_messages(thread_id):
            if msg.role == "user":
                messages.append(HumanMessage(content=msg.content))
            elif msg.role == "assistant":
                messages.append(AIMessage(content=msg.content))
        if not messages or messages[-1].content != new_question:
            messages.append(HumanMessage(content=new_question))
        return messages

    def _extract_sources(self, answer: str, kg: dict) -> list[SourceInfo]:
        sources = []
        for node in kg.get("nodes", []):
            name = node.get("name", "")
            if name and name[:30] in answer:
                sources.append(SourceInfo(
                    type="entity", label=node.get("label", ""), name=name[:60],
                    confidence=node.get("source", {}).get("alignment_status"),
                    document_id=node.get("source", {}).get("document_id"),
                ))
        seen = set()
        unique = []
        for s in sources:
            key = f"{s.label}:{s.name[:40]}"
            if key not in seen:
                seen.add(key)
                unique.append(s)
        return unique[:10]

    def get_thread_history(self, thread_id: str) -> list:
        return self.thread_repo.get_messages(thread_id)

    def get_threads(self, page=1, page_size=20):
        return self.thread_repo.list_threads(page, page_size)

    def delete_thread(self, thread_id: str) -> bool:
        return self.thread_repo.delete_thread(thread_id)
