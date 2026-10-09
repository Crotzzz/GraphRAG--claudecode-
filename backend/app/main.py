"""
GraphRAG Backend — FastAPI 应用入口

运行方式:
  cd D:\vibe coding\GraphRAGAgent\backend
  .venv\Scripts\python -m app.main

  访问 http://localhost:8765
  Swagger UI http://localhost:8765/docs
"""

import os
import sys
from pathlib import Path

# 确保项目根路径在 Python path 中
sys.path.insert(0, str(Path(__file__).parent.parent))

os.environ["PYTHONIOENCODING"] = "utf-8"

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# 加载 .env（从 backend/ 根目录）
env_path = Path(__file__).parent.parent / ".env"
if env_path.exists():
    load_dotenv(env_path)

from app.db.database import init_db
init_db()

from app.api.documents import router as documents_router
from app.api.knowledge_graph import router as kg_router
from app.api.agent import router as agent_router
from app.api.system import router as system_router

app = FastAPI(title="GraphRAG Backend Service", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

app.include_router(documents_router)
app.include_router(kg_router)
app.include_router(agent_router)
app.include_router(system_router)


@app.get("/")
async def root():
    return {"service": "GraphRAG Backend Service", "version": "1.0.0"}


if __name__ == "__main__":
    import uvicorn
    print(f"DeepSeek API: {'OK' if os.environ.get('DEEPSEEK_API_KEY') else 'MISSING'}")
    uvicorn.run(app, host="0.0.0.0", port=8765)
