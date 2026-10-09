import json
from typing import Optional
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.services.agent_service import AgentService
from app.models.agent import AgentQueryRequest
from app.db.thread_repo import ThreadRepository

router = APIRouter(prefix="/api/v1/agent", tags=["Agent"])
agent_svc = AgentService()
thread_repo = ThreadRepository()


class QueryBody(BaseModel):
    doc_id: str
    question: str
    thread_id: Optional[str] = None


@router.post("/query")
async def agent_query(body: QueryBody):
    if not body.question.strip():
        raise HTTPException(400, "问题不能为空")
    try:
        req = AgentQueryRequest(doc_id=body.doc_id, question=body.question.strip(), thread_id=body.thread_id)
        resp = agent_svc.query(req)
        return resp.to_dict()
    except ValueError as e:
        raise HTTPException(404, detail={"error": "DOCUMENT_NOT_FOUND", "message": str(e)})
    except Exception as e:
        raise HTTPException(500, detail={"error": "AGENT_ERROR", "message": f"Agent 调用失败: {str(e)[:200]}"})


@router.post("/stream")
async def agent_stream(body: QueryBody):
    if not body.question.strip():
        raise HTTPException(400, "问题不能为空")
    req = AgentQueryRequest(doc_id=body.doc_id, question=body.question.strip(), thread_id=body.thread_id)

    async def event_gen():
        try:
            for event in agent_svc.stream(req):
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)[:200]}, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"})


@router.post("/chat")
async def agent_chat(body: QueryBody):
    if not body.question.strip():
        raise HTTPException(400, "问题不能为空")
    try:
        req = AgentQueryRequest(doc_id=body.doc_id, question=body.question.strip(), thread_id=body.thread_id)
        resp = agent_svc.query(req)
        return resp.to_dict()
    except ValueError as e:
        raise HTTPException(404, detail={"error": "DOCUMENT_NOT_FOUND", "message": str(e)})
    except Exception as e:
        raise HTTPException(500, detail={"error": "AGENT_ERROR", "message": f"Agent 调用失败: {str(e)[:200]}"})


@router.get("/threads")
async def list_threads(page: int = 1, page_size: int = 20):
    threads, total = agent_svc.get_threads(page, page_size)
    return {"total": total, "threads": [t.to_dict() for t in threads]}


@router.get("/threads/{thread_id}")
async def get_thread(thread_id: str):
    thread = thread_repo.get_thread(thread_id)
    if not thread:
        raise HTTPException(404, "对话线程不存在")
    messages = agent_svc.get_thread_history(thread_id)
    return {"thread_id": thread.thread_id, "doc_id": thread.doc_id, "messages": [m.to_dict() for m in messages]}


@router.delete("/threads/{thread_id}")
async def delete_thread(thread_id: str):
    if not agent_svc.delete_thread(thread_id):
        raise HTTPException(404, "对话线程不存在")
    return {"message": "对话已删除", "thread_id": thread_id}
