# GraphRAG 项目规范

## 目录结构

```
├── frontend/          # 前端代码（React SPA）
├── backend/           # 后端代码（FastAPI + LangChain）
├── docs/              # 规范文档
└── .env               # API Key 等敏感配置（已 gitignore）
```

## 环境规范

- 后端使用 `backend/.venv` 虚拟环境（Python 3.10）
- 所有 API Key 配置在 `backend/.env` 文件中管理
- `backend/.gitignore` 已忽略 `.venv`、`data/`、`*.sqlite`
