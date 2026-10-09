# GraphRAG Backend 项目规范

## 启动方式

```bash
# 进入后端目录
cd D:\vibe coding\GraphRAGAgent\backend

# 激活虚拟环境
source .venv/Scripts/activate

# 启动后端服务（端口 8765）
python -m app.main
```

启动后访问：
- API 根路径：http://localhost:8765
- Swagger 文档：http://localhost:8765/docs
- 健康检查：http://localhost:8765/api/v1/system/health
