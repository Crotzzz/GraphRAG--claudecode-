# GraphRAG 前端系统架构规范文档 v1.0

> **文档版本**: v1.0  
> **最后更新**: 2026-07-17  
> **对应后端**: `backend-service-architecture-v1.0.md`（18 个 API 端点）  
> **技术栈**: Vue 3 + TypeScript + Vite + TailwindCSS + D3.js v7 + Pinia  

---

## 目录

- [1. 系统概述](#1-系统概述)
- [2. 整体架构](#2-整体架构)
- [3. 技术栈选型](#3-技术栈选型)
- [4. 页面清单与路由设计](#4-页面清单与路由设计)
- [5. 组件树设计](#5-组件树设计)
- [6. API 对接层规范](#6-api-对接层规范)
  - [6.1 API 模块结构](#61-api-模块结构)
  - [6.2 SSE 流式接入实现](#62-sse-流式接入实现)
- [7. 数据结构定义](#7-数据结构定义)
  - [7.1 文档类型](#71-文档类型)
  - [7.2 知识图谱类型](#72-知识图谱类型)
  - [7.3 Agent 问答类型](#73-agent-问答类型)
- [8. 状态管理设计（Pinia Store）](#8-状态管理设计pinia-store)
- [9. 主工作台交互逻辑](#9-主工作台交互逻辑)
  - [9.1 完整交互流程](#91-完整交互流程)
  - [9.2 SSE 流式状态机](#92-sse-流式状态机)
- [10. 响应式布局策略](#10-响应式布局策略)
- [11. UI 视觉规范](#11-ui-视觉规范)
  - [11.1 节点颜色映射](#111-节点颜色映射)
  - [11.2 字体与主题](#112-字体与主题)
- [12. 目录结构](#12-目录结构)
- [13. 实施步骤](#13-实施步骤)
- [14. 验证方式](#14-验证方式)

---

## 1. 系统概述

GraphRAG 前端是一个单页应用（SPA），为用户提供从文档上传、知识图谱可视化到 AI 智能问答的完整交互体验。

### 1.1 设计目标

| 目标 | 说明 |
|------|------|
| **全流程可视化** | 文档上传→索引→图谱渲染→问答，一站式可视化 |
| **AI 推理透明化** | SSE 流式推送 Agent 思考过程（工具调用→搜索→推理→回答） |
| **图谱-问答联动** | Agent 回答结果自动高亮知识图谱中的对应实体 |
| **多轮对话记忆** | 对话历史持久化，刷新不丢失 |
| **响应式适配** | 桌面三栏→平板两栏→手机单栏，全设备覆盖 |
| **暗色模式** | 一键切换，图谱颜色自适应 |

### 1.2 与后端的关系

```
┌─────────────────────────────────────────────────────────────────┐
│  前端 (Port 5173)               后端 FastAPI (Port 8765)          │
│                                                                 │
│  Vue 3 SPA ─── HTTP / SSE ───▶  /api/v1/documents/*            │
│      │                          /api/v1/kg/*                    │
│      │                          /api/v1/agent/*                 │
│      │                          /api/v1/system/*                │
│      │                                                          │
│      └─────────────────────── 18 个 RESTful + SSE 端点          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. 整体架构

系统采用 **四层架构**：API 对接层 → 状态管理层 → 路由层 → 视图组件层。

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        前端 SPA (Single Page App)                          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────── API 层 (api/) ──────────────────────────────────────────┐  │
│  │  client.ts (HTTP + SSE) | document.ts | kg.ts | agent.ts | system.ts │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                   │                                       │
│  ┌────────── Pinia Store 层 (stores/) ───────────────────────────────┐  │
│  │  document (文档/轮询) | kg (图谱/筛选) | chat (对话/SSE) | app (全局) │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                   │                                       │
│  ┌────────── Vue Router ──────────────────────────────────────────────┐  │
│  │  /workspace | /documents | /chat | /chat/:id | /graph/:id | /settings │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                   │                                       │
│  ┌────────── Vue Components (components/) ───────────────────────────┐  │
│  │  layout/ | document/ | graph/ | chat/ | common/                    │  │
│  │  └── App.vue → views/ (5 个页面)                                  │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 2.1 关键交互流程

```
用户操作                   前端行为                                API 调用
─────────                 ──────                                 ──────

① 拖拽 PDF 到上传区   ──▶  显示上传进度, 添加 task 到列表        POST /documents/upload
                              │
                          轮询 task 状态 ◀────────── 每 2s ──  GET /documents/{id}
                              │
                          进度: 5% → 30% → 50% → 80% → 100%
                              │
                         100% 完成 ──▶ 自动选中新文档

② 知识图谱自动渲染    ──▶  D3 力导向图加载                     GET /kg/{doc_id}
                              │
                          节点按 label 着色
                          边按 type 标注
                          统计面板更新                          GET /kg/{doc_id}/stats

③ 用户输入问题        ──▶  Chat 面板添加 user 消息               POST /agent/stream
                              │
                          显示 🔍「正在搜索...」        ← SSE tool_call
                          显示 🔗「正在查询关系...」    ← SSE tool_call
                          流式输出回答（打字机效果）      ← SSE token
                          回答完成，显示来源引用          ← SSE done
                          图谱高亮对应实体节点

④ 点击图谱节点        ──▶  右侧浮动面板显示实体详情              GET /kg/{doc_id}/entities/{id}
                              │
                          显示属性、关联关系
                          来源上下文文本

⑤ 追问问题           ──▶  保持 thread_id，Agent 感知上下文       POST /agent/chat
```

---

## 3. 技术栈选型

| 层 | 技术 | 版本 | 说明 |
|----|------|:----:|------|
| **框架** | Vue 3 | 3.4+ | Composition API + TypeScript 原生支持 |
| **构建** | Vite | 5+ | 快速 HMR，ESM 原生支持 |
| **语言** | TypeScript | 5+ | 类型安全，与后端 API 模型对齐 |
| **状态管理** | Pinia | 2+ | Vue 3 官方状态管理，轻量 |
| **路由** | Vue Router | 4+ | SPA 路由 |
| **样式** | TailwindCSS | 3+ | 原子化 CSS，响应式设计 |
| **图谱可视化** | D3.js | 7+ | 力导向图，高可定制性 |
| **Markdown 渲染** | marked + highlight.js | — | Agent 回答渲染（表格/代码） |
| **HTTP 客户端** | fetch (原生) | — | 无额外依赖，SSE 原生支持 |

---

## 4. 页面清单与路由设计

| # | 路由 | 页面 | 优先级 | 核心功能 |
|:-:|:----:|------|:------:|----------|
| 1 | `/` 重定向到 `/workspace` | — | — | 根路径自动跳转 |
| 2 | `/workspace` | **主工作台** | ⭐⭐⭐ | 三栏布局：文档侧栏 + 图谱画布 + 聊天面板，全流程入口 |
| 3 | `/workspace?doc={id}` | **主工作台（指定文档）** | ⭐⭐⭐ | 带文档 ID 参数，直接定位到指定文档 |
| 4 | `/documents` | **文档管理** | ⭐⭐ | 上传列表、状态跟踪、删除操作 |
| 5 | `/chat` | **智能问答** | ⭐⭐ | 对话线程列表、新建对话 |
| 6 | `/chat/:threadId` | **对话详情** | ⭐⭐ | 特定对话的完整历史消息 |
| 7 | `/graph/:docId` | **全屏知识图谱** | ⭐ | 全屏图谱浏览、搜索实体、过滤类型 |
| 8 | `/settings` | **系统设置** | ⭐ | API Key 配置、模型选择、系统信息 |

### 4.1 路由配置

```typescript
// src/router/index.ts
const routes = [
  { path: '/', redirect: '/workspace' },
  { path: '/workspace',  name: 'Workbench',  component: () => import('@/views/Workbench.vue') },
  { path: '/documents',  name: 'Documents',  component: () => import('@/views/Documents.vue') },
  { path: '/chat',       name: 'Chat',       component: () => import('@/views/ChatView.vue') },
  { path: '/chat/:threadId', name: 'ChatDetail', component: () => import('@/views/ChatView.vue') },
  { path: '/graph/:docId',   name: 'Graph',      component: () => import('@/views/GraphView.vue') },
  { path: '/settings',  name: 'Settings',   component: () => import('@/views/Settings.vue') },
]
```

---

## 5. 组件树设计

```
App.vue
│
├── AppHeader.vue                       # 顶部导航栏
│   ├── Logo + 应用标题
│   ├── 导航链接 (Workbench / Documents / Chat / Settings)
│   └── 暗色模式切换 + 状态指示器
│
├── <router-view>
│   │
│   ├── Workbench.vue                   # ★ 主工作台（三栏布局）
│   │   ├── AppSidebar.vue              # 左侧面板容器
│   │   │   ├── UploadZone.vue          #   拖拽/点击上传区域
│   │   │   │   └── 进度指示
│   │   │   ├── TaskList.vue            #   任务列表
│   │   │   │   └── TaskItem.vue        #     单个任务卡片（状态/进度/操作）
│   │   │   └── EntityFilter.vue        #   实体类型过滤（复选框）
│   │   │
│   │   ├── GraphCanvas.vue             # 中间 D3 力导向图
│   │   │   ├── 节点渲染 (颜色 = label)
│   │   │   ├── 边渲染 (标签 = type)
│   │   │   ├── 悬停 tooltip (节点详情)
│   │   │   ├── 点击高亮 (一度关系)
│   │   │   ├── 拖拽自由布局
│   │   │   └── 滚轮缩放
│   │   │
│   │   └── ChatPanel.vue               # 右侧聊天面板
│   │       ├── ChatMessage.vue         #   消息气泡（Markdown 渲染）
│   │       ├── ToolCallStatus.vue      #   工具调用状态（搜索中…）
│   │       ├── SourceCitation.vue      #   来源引用
│   │       └── ChatInput.vue           #   输入框 + 发送按钮
│   │
│   ├── Documents.vue                   # 文档管理页面
│   │   ├── UploadZone.vue
│   │   └── TaskList.vue (带分页)
│   │
│   ├── ChatView.vue                    # 智能问答页面
│   │   ├── ThreadList.vue              #   对话线程侧栏
│   │   └── ChatPanel.vue
│   │
│   ├── GraphView.vue                   # 全屏图谱页面
│   │   ├── GraphCanvas.vue
│   │   ├── EntityFilter.vue
│   │   └── NodeDetail.vue              #   节点详情浮动面板
│   │
│   └── Settings.vue                    # 系统设置页面
│       ├── APIConfig.vue               #   API Key 配置
│       ├── ModelConfig.vue             #   模型选择
│       └── SystemInfo.vue              #   系统信息
│
└── StatusBar.vue                       # 底部状态栏（文档数/模型/状态）
```

---

## 6. API 对接层规范

### 6.1 API 模块结构

```
src/api/
├── client.ts              # 通用 HTTP 客户端 (baseURL, headers, error handler)
├── document.ts            # 文档索引 API
├── kg.ts                  # 知识图谱 API
├── agent.ts               # Agent 问答 API (含 SSE 流式)
└── system.ts              # 系统管理 API
```

#### `src/api/client.ts`

```typescript
const API_BASE = 'http://localhost:8765/api/v1'

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new ApiError(res.status, err.detail?.error || 'UNKNOWN', err.detail?.message || res.statusText)
  }
  return res.json()
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message)
  }
}
```

#### `src/api/document.ts`

```typescript
// 对应后端 POST /api/v1/documents/upload
export async function uploadDocument(file: File, params?: {
  ocr?: boolean; language?: string; pages?: string; model?: string
}): Promise<DocumentRecord> {
  const form = new FormData()
  form.append('file', file)
  if (params?.ocr !== undefined) form.append('ocr', String(params.ocr))
  if (params?.language) form.append('language', params.language)
  if (params?.pages) form.append('pages', params.pages)
  if (params?.model) form.append('model', params.model)

  const res = await fetch(`${API_BASE}/documents/upload`, { method: 'POST', body: form })
  if (!res.ok) throw await parseError(res)
  return res.json()
}

// 对应 GET /api/v1/documents
export async function listDocuments(page = 1, pageSize = 20, status?: string): Promise<DocumentListResponse> {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
  if (status) params.set('status', status)
  return request(`/documents?${params}`)
}

// 对应 GET /api/v1/documents/{doc_id}
export async function getDocument(docId: string): Promise<DocumentRecord> {
  return request(`/documents/${docId}`)
}

// 对应 DELETE /api/v1/documents/{doc_id}
export async function deleteDocument(docId: string): Promise<{ message: string }> {
  return request(`/documents/${docId}`, { method: 'DELETE' })
}
```

#### `src/api/kg.ts`

```typescript
// 对应 GET /api/v1/kg/{doc_id}
export async function getFullKG(docId: string): Promise<KGData> {
  return request(`/kg/${docId}`)
}

// 对应 GET /api/v1/kg/{doc_id}/stats
export async function getKGStats(docId: string): Promise<KGStats> {
  return request(`/kg/${docId}/stats`)
}

// 对应 GET /api/v1/kg/{doc_id}/search?q=xxx
export async function searchKG(docId: string, query: string, label?: string): Promise<KGSearchResponse> {
  const params = new URLSearchParams({ q: query })
  if (label) params.set('label', label)
  return request(`/kg/${docId}/search?${params}`)
}

// 对应 GET /api/v1/kg/{doc_id}/entities/{entity_id}
export async function getEntityDetail(docId: string, entityId: string): Promise<EntityDetailResponse> {
  return request(`/kg/${docId}/entities/${entityId}`)
}
```

#### `src/api/agent.ts`

```typescript
// 对应 POST /api/v1/agent/query
export async function queryAgent(docId: string, question: string, threadId?: string): Promise<AgentResponse> {
  return request('/agent/query', {
    method: 'POST',
    body: JSON.stringify({ doc_id: docId, question, thread_id: threadId || null }),
  })
}

// 对应 POST /api/v1/agent/chat（多轮对话）
export async function chatAgent(docId: string, question: string, threadId: string): Promise<AgentResponse> {
  return request('/agent/chat', {
    method: 'POST',
    body: JSON.stringify({ doc_id: docId, question, thread_id: threadId }),
  })
}

// SSE 流式问答 — 对应 POST /api/v1/agent/stream
export function streamAgentAnswer(docId: string, question: string, callbacks: StreamCallbacks): AbortController {
  const controller = new AbortController()

  fetch(`${API_BASE}/agent/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ doc_id: docId, question }),
    signal: controller.signal,
  }).then(async (response) => {
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const event = JSON.parse(line.slice(6))
        switch (event.type) {
          case 'status':      callbacks.onStatus?.(event.stage, event.message); break
          case 'tool_call':   callbacks.onToolCall?.(event.tool, event.args); break
          case 'tool_result': callbacks.onToolResult?.(event.tool, event.content); break
          case 'token':       callbacks.onToken?.(event.content); break
          case 'done':        callbacks.onDone?.(event.latency_ms, event.sources); break
          case 'error':       callbacks.onError?.(event.message); break
        }
      }
    }
  }).catch(err => {
    if (err.name !== 'AbortError') callbacks.onError?.(err.message)
  })

  return controller
}

// SSE 回调接口
export interface StreamCallbacks {
  onStatus?: (stage: string, message: string) => void
  onToolCall?: (tool: string, args: Record<string, unknown>) => void
  onToolResult?: (tool: string, content: string) => void
  onToken?: (token: string) => void
  onDone?: (latencyMs: number, sources: SourceInfo[]) => void
  onError?: (message: string) => void
}

// 对应 GET /api/v1/agent/threads
export async function listThreads(): Promise<ThreadListResponse> {
  return request('/agent/threads')
}

// 对应 GET /api/v1/agent/threads/{thread_id}
export async function getThread(threadId: string): Promise<ThreadDetailResponse> {
  return request(`/agent/threads/${threadId}`)
}

// 对应 DELETE /api/v1/agent/threads/{thread_id}
export async function deleteThread(threadId: string): Promise<void> {
  return request(`/agent/threads/${threadId}`, { method: 'DELETE' })
}
```

#### `src/api/system.ts`

```typescript
export async function healthCheck(): Promise<HealthResponse> {
  return request('/system/health')
}

export async function getConfig(): Promise<SystemConfig> {
  return request('/system/config')
}

export async function updateConfig(updates: Partial<SystemConfig>): Promise<SystemConfig> {
  return request('/system/config', { method: 'PUT', body: JSON.stringify(updates) })
}
```

### 6.2 SSE 流式接入实现

前端通过 `fetch` + `ReadableStream` 实现 SSE 流式接入，不使用 `EventSource` API（因为需要 POST 方法发送请求体）。

```
POST /api/v1/agent/stream (SSE)
↓
Fetch API → ReadableStream → TextDecoder → 逐行解析
                                      │
                                      ├── type=status    → 更新状态指示器
                                      ├── type=tool_call → 显示「🔍 正在搜索...」
                                      ├── type=tool_result → 工具结果摘要
                                      ├── type=token     → 追加到回答（打字机效果）
                                      ├── type=done      → 来源引用 + 图谱联动
                                      └── type=error     → 显示错误提示
```

---

## 7. 数据结构定义

### 7.1 文档类型

```typescript
// 对齐后端 DocumentRecord (app/models/document.py)
interface DocumentRecord {
  doc_id: string
  filename: string
  file_size: number
  file_type: string        // pdf | image | doc | ppt | xls | html
  status: 'pending' | 'running' | 'done' | 'failed'
  progress: number         // 0-100
  error: string | null
  created_at: string       // ISO 8601
  updated_at: string
  kg_stats?: KGStats       // status=done 时附加
}

interface DocumentListResponse {
  total: number
  page: number
  page_size: number
  items: DocumentRecord[]
}
```

### 7.2 知识图谱类型

```typescript
// 对齐后端 KG API 输出
interface KGNode {
  id: string
  label: string                  // patient | disease | medication | symptom | vital_sign | lab_result
  name: string
  properties: Record<string, string>
  source: {
    document_id: string
    char_interval: { start_pos: number; end_pos: number }
    alignment_status: 'match_exact' | 'match_fuzzy' | 'match_lesser'
    context: string
  }
}

interface KGRelationship {
  id: string
  type: string                   // has_symptom | has_disease | has_medication | ...
  source_id: string
  source_label: string
  target_id: string
  target_label: string
  target_name: string
}

interface KGData {
  metadata: {
    total_nodes: number
    total_relationships: number
    node_types: Record<string, number>
    relationship_types: Record<string, number>
    built_at: string
  }
  nodes: KGNode[]
  relationships: KGRelationship[]
}

interface KGStats {
  total_nodes: number
  total_relationships: number
  node_types: Record<string, number>
  relationship_types: Record<string, number>
  node_counts_by_label: Record<string, Array<{ name: string; property_keys: string[] }>>
}

interface KGSearchResponse {
  query: string
  total: number
  results: Array<{
    id: string
    label: string
    name: string
    properties: Record<string, string>
    source: { char_interval: object; alignment_status: string }
    related_count: number
  }>
}

interface EntityDetailResponse {
  entity: KGNode
  outgoing_relations: KGRelationship[]
  incoming_relations: KGRelationship[]
}
```

### 7.3 Agent 问答类型

```typescript
// 对齐 AgentQueryResponse (app/models/agent.py)
interface AgentResponse {
  answer: string                    // Markdown 格式回答
  sources?: SourceInfo[]            // 来源引用
  tool_calls?: string[]             // 调用的工具名称列表
  tool_call_details?: ToolCallDetail[]  // 工具调用详情
  latency_ms: number                // 响应延迟（毫秒）
  thread_id: string                 // 对话线程 ID
}

interface SourceInfo {
  type: 'entity' | 'relationship'   // 引用类型
  label: string                     // 实体类型或关系类型
  name: string                      // 实体名称
  confidence?: 'match_exact' | 'match_fuzzy' | 'match_lesser'
  document_id?: string
  relation?: string                 // 关系类型（type=relationship 时）
}

interface ToolCallDetail {
  tool: string                      // 工具名称
  args: Record<string, unknown>     // 调用参数
  result_summary: string            // 结果摘要
  latency_ms: number                // 调用耗时
}

// 对话线程
interface ThreadRecord {
  thread_id: string
  doc_id: string | null
  title: string
  message_count: number
  created_at: string
  updated_at: string
}

interface ThreadListResponse {
  total: number
  threads: ThreadRecord[]
}

interface ThreadDetailResponse {
  thread_id: string
  doc_id: string | null
  messages: ChatMessage[]
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  tool_calls?: string[]
  sources?: SourceInfo[]
  latency_ms?: number
  created_at: string
}

// 系统配置
interface SystemConfig {
  llm_provider: string
  llm_model: string
  llm_base_url: string
  mineru_model: string
  mineru_language: string
  concurrent_tasks: number
}

interface HealthResponse {
  status: string
  version: string
  uptime_seconds: number
  docs_count: number
  threads_count: number
  deepseek_api: string
  disk_usage_percent: number
}
```

---

## 8. 状态管理设计（Pinia Store）

### 8.1 Store 结构

```
src/stores/
├── document.ts          # 文档状态管理
├── kg.ts                # 知识图谱状态管理
├── chat.ts              # 对话状态管理
└── app.ts               # 全局状态管理
```

### 8.2 各 Store 职责

| Store | 状态 | Actions | 用途 |
|-------|------|---------|------|
| **document** | `docs[]`, `currentDocId`, `pollingTimer` | `upload()`, `refresh()`, `pollStatus()`, `selectDocument()`, `removeDocument()` | 文档列表、上传、轮询、选择 |
| **kg** | `nodes[]`, `rels[]`, `stats`, `selectedNodeId`, `filters{}` | `loadGraph()`, `search()`, `selectNode()`, `setFilter()`, `highlightBySources()` | 图谱数据、筛选、高亮联动 |
| **chat** | `messages[]`, `currentlyStreaming`, `threadId`, `threads[]` | `sendMessage()`, `streamMessage()`, `loadHistory()`, `newThread()`, `stopStreaming()` | 对话消息、SSE 流式、历史 |
| **app** | `darkMode`, `config`, `healthStatus` | `toggleDarkMode()`, `loadConfig()`, `updateConfig()`, `checkHealth()` | 全局主题、配置 |

### 8.3 chat store 核心实现（SSE 流式）

```typescript
// src/stores/chat.ts — 核心逻辑
export const useChatStore = defineStore('chat', () => {
  const messages = ref<ChatMessage[]>([])
  const isStreaming = ref(false)
  const currentThreadId = ref<string | null>(null)
  const abortController = ref<AbortController | null>(null)

  async function streamMessage(docId: string, question: string) {
    isStreaming.value = true

    // 添加用户消息
    const userMsg: ChatMessage = {
      role: 'user', content: question,
      created_at: new Date().toISOString(),
    }
    messages.value.push(userMsg)

    // 创建占位的 assistant 消息
    const assistantMsg: ChatMessage = {
      role: 'assistant', content: '',
      created_at: new Date().toISOString(),
    }
    messages.value.push(assistantMsg)

    // SSE 回调
    const callbacks: StreamCallbacks = {
      onToolCall(tool, args) {
        // 追加工具调用记录到 assistant 消息
        assistantMsg.tool_calls = [...(assistantMsg.tool_calls || []), tool]
      },
      onToken(token) {
        assistantMsg.content += token  // 打字机追加
      },
      onDone(latencyMs, sources) {
        assistantMsg.latency_ms = latencyMs
        assistantMsg.sources = sources
        currentThreadId.value = /* thread_id from done event */
        isStreaming.value = false
        // 触发图谱高亮联动
        kgHighlightBySources(sources)
      },
      onError(message) {
        assistantMsg.content += `\n\n[错误] ${message}`
        isStreaming.value = false
      },
    }

    abortController.value = streamAgentAnswer(docId, question, callbacks)
  }

  function stopStreaming() {
    abortController.value?.abort()
    isStreaming.value = false
  }

  return { messages, isStreaming, currentThreadId, streamMessage, stopStreaming }
})
```

### 8.4 图谱-问答联动逻辑

```typescript
// 当 Agent 回答完成时，高亮图谱中对应的实体节点
function kgHighlightBySources(sources: SourceInfo[] | undefined) {
  const kgStore = useKGStore()
  if (!sources?.length) return

  // 从 sources 中提取实体标签和名称
  const entityNames = sources
    .filter(s => s.type === 'entity')
    .map(s => s.name)

  // 在知识图谱中查找并高亮匹配节点
  kgStore.highlightNodesByName(entityNames)
}
```

---

## 9. 主工作台交互逻辑

### 9.1 完整交互流程

```
① 拖拽 PDF 到上传区
   │
   ▼
② POST /api/v1/documents/upload → 201 Created
   │
   ▼
③ 启动轮询：GET /api/v1/documents/{doc_id}（每 2 秒）
   │
   ├── progress=5%   → "MinerU 文档解析中"
   ├── progress=30%  → "内容提取中"
   ├── progress=50%  → "实体提取中（DeepSeek）"
   ├── progress=80%  → "知识图谱构建中"
   ├── progress=100% → "解析完成！"
   │
   ▼
④ 加载知识图谱：GET /api/v1/kg/{doc_id}
   │
   ▼
⑤ D3 力导向图渲染：
   │  ├── 节点按 label 着色（6 种颜色）
   │  ├── 边按 type 标注（6 种关系）
   │  ├── 统计面板更新（节点数/关系数/类型数）
   │  └── 图例展示
   │
   ▼
⑥ 用户输入问题 → 调用 POST /api/v1/agent/stream (SSE)
   │
   ├── SSE tool_call → Chat 显示 "🔍 正在搜索「诊断」..."
   ├── SSE token     → Chat 逐字渲染回答（打字机效果）
   ├── SSE done      → Chat 显示来源引用
   │                   图谱高亮对应实体节点（联动）
   └── SSE error     → Chat 显示错误提示
```

### 9.2 SSE 流式状态机

```
IDLE ──→ 用户发送问题
           │
           ▼
     CONNECTING ──→ SSE 连接建立
           │
           ▼
    TOOL_CALL ──→ 显示 "🔍 正在搜索「诊断」..."
           │
           ▼
    TOOL_RESULT ──→ 更新工具结果面板
           │
           ▼
     STREAMING ──→ 逐 token 渲染回答（打字机效果）
           │
      ┌────┴────┐
      │         │
   DONE ──→ 显示来源引用 + 图谱联动
      │
   ERROR ──→ 显示错误提示
```

---

## 10. 响应式布局策略

| 断点 | 屏幕宽度 | 布局模式 | Sidebar | 图谱 | 聊天面板 |
|:----:|:--------:|:--------:|:-------:|:----:|:--------:|
| `xl` | ≥1280px | **三栏** | 240px 展开 | flex: 1 | 380px |
| `lg` | 1024-1279px | **三栏（折叠侧栏）** | 图标折叠，hover 展开 | flex: 1 | 360px |
| `md` | 768-1023px | **两栏上下** | 隐藏（汉堡菜单） | 高度 50% | 高度 50%，底部 |
| `sm` | 640-767px | **单栏标签切换** | 隐藏 | Tab1: 图谱 | Tab2: 聊天 |
| `xs` | <640px | **单栏堆叠** | 隐藏 | 全屏 | 底部浮动输入 |

### 响应式断点配置（TailwindCSS）

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      screens: {
        '3xl': '1280px',  // 三栏
        '2xl': '1024px',  // 两栏
        'xl': '768px',    // 平板
        'lg': '640px',    // 手机横屏
        'md': '480px',    // 手机竖屏
      },
    },
  },
}
```

---

## 11. UI 视觉规范

### 11.1 节点颜色映射

与后端知识图谱的 6 种实体类型严格对应：

| 实体类型 | 颜色 | CSS Variable | Hex | 用途 |
|----------|:----:|-------------|:----:|------|
| `patient` | 红色 | `--color-patient` | `#e63946` | 患者信息 |
| `symptom` | 橙色 | `--color-symptom` | `#f4a261` | 症状表现 |
| `disease` | 青色 | `--color-disease` | `#2a9d8f` | 诊断疾病 |
| `medication` | 墨绿 | `--color-medication` | `#264653` | 用药方案 |
| `vital_sign` | 天蓝 | `--color-vital-sign` | `#8ecae6` | 生命体征 |
| `lab_result` | 紫色 | `--color-lab-result` | `#6a4c93` | 化验结果 |

### 11.2 字体与主题

| 规范项 | 规则 |
|--------|------|
| **英文数字字体** | `Inter` |
| **中文字体** | `Noto Sans SC` |
| **代码字体** | `JetBrains Mono` |
| **主色** | `#4361ee`（蓝色） |
| **背景** | Light: `#f0f2f5` / Dark: `#1a1a2e` |
| **卡片背景** | Light: `#ffffff` / Dark: `#16213e` |
| **卡片圆角** | `12px` |
| **阴影** | `box-shadow: 0 1px 3px rgba(0,0,0,.08)` |
| **暗色模式** | 通过 `class="dark"` 切换，持久化到 localStorage |

---

## 12. 目录结构

```
D:\vibe coding\GraphRAGAgent\graphrag_pipeline\web\
├── package.json
├── vite.config.ts                      # Vite 配置 + 代理到 :8765
├── tailwind.config.js                  # TailwindCSS 配置
├── tsconfig.json
├── index.html                          # HTML 入口
│
├── src/
│   ├── main.ts                         # Vue 应用入口
│   ├── App.vue                         # 根组件
│   │
│   ├── types/                          # TypeScript 类型定义
│   │   ├── document.ts                  # 文档类型（对齐后端 model）
│   │   ├── kg.ts                        # 知识图谱类型
│   │   └── agent.ts                     # Agent 问答类型
│   │
│   ├── api/                            # API 对接层
│   │   ├── client.ts                   # HTTP 客户端 + 错误处理
│   │   ├── document.ts                 # 文档索引 API
│   │   ├── kg.ts                       # 知识图谱 API
│   │   ├── agent.ts                    # Agent 问答 API (含 SSE)
│   │   └── system.ts                   # 系统管理 API
│   │
│   ├── stores/                         # Pinia 状态管理
│   │   ├── document.ts                 # 文档状态
│   │   ├── kg.ts                       # 知识图谱状态
│   │   ├── chat.ts                     # 对话状态
│   │   └── app.ts                      # 全局状态
│   │
│   ├── router/
│   │   └── index.ts                    # 路由配置
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppHeader.vue           # 顶部导航栏
│   │   │   ├── AppSidebar.vue          # 侧边栏容器
│   │   │   └── StatusBar.vue           # 底部状态栏
│   │   │
│   │   ├── document/
│   │   │   ├── UploadZone.vue          # 拖拽上传区域
│   │   │   ├── TaskList.vue            # 任务列表
│   │   │   └── TaskItem.vue            # 单个任务卡片
│   │   │
│   │   ├── graph/
│   │   │   ├── GraphCanvas.vue         # D3 力导向图
│   │   │   ├── EntityFilter.vue        # 实体过滤器
│   │   │   ├── NodeDetail.vue          # 节点详情浮动面板
│   │   │   └── GraphLegend.vue         # 图例
│   │   │
│   │   ├── chat/
│   │   │   ├── ChatPanel.vue           # 聊天面板容器
│   │   │   ├── ChatMessage.vue         # 消息气泡（Markdown 渲染）
│   │   │   ├── ChatInput.vue           # 输入框
│   │   │   ├── ToolCallStatus.vue      # 工具调用状态指示
│   │   │   └── SourceCitation.vue      # 来源引用
│   │   │
│   │   └── common/
│   │       ├── StatCard.vue            # 统计卡片
│   │       ├── LoadingSpinner.vue      # 加载动画
│   │       └── EntityBadge.vue         # 实体标签（颜色 badge）
│   │
│   ├── views/
│   │   ├── Workbench.vue              # ★ 主工作台
│   │   ├── Documents.vue              # 文档管理
│   │   ├── ChatView.vue               # 对话列表+详情
│   │   ├── GraphView.vue              # 全屏图谱
│   │   └── Settings.vue               # 系统设置
│   │
│   ├── composables/                   # 可复用组合式函数
│   │   ├── usePolling.ts              # 轮询工具
│   │   ├── useSSE.ts                  # SSE 流式工具
│   │   └── useD3Graph.ts              # D3 图封装
│   │
│   └── styles/
│       ├── main.css                    # Tailwind 入口 + 自定义主题
│       └── graph.css                   # D3 图谱样式
│
└── public/
    └── favicon.svg
```

---

## 13. 实施步骤

### Phase 1: 项目脚手架（2 小时）

| Step | 内容 | 产出 |
|:----:|------|------|
| 1.1 | `npm create vite@latest web -- --template vue-ts` | Vite 项目骨架 |
| 1.2 | 安装依赖：tailwindcss, d3, marked, vue-router, pinia, highlight.js | `package.json` |
| 1.3 | 配置 TailwindCSS + 响应式断点 + 暗色模式 | `tailwind.config.js` |
| 1.4 | 配置 Vite 代理到后端 :8765 | `vite.config.ts` |
| 1.5 | 实现 `types/` 类型定义 + `api/client.ts` HTTP 客户端 | 基础类型 + 请求封装 |

### Phase 2: 文档管理模块（1.5 小时）

| Step | 内容 | 产出 |
|:----:|------|------|
| 2.1 | UploadZone 组件（拖拽/点击上传 + 文件类型校验） | 上传交互 |
| 2.2 | TaskList + TaskItem 组件（状态/进度/操作按钮） | 任务列表 |
| 2.3 | document store（轮询/选中/删除） | 状态管理 |
| 2.4 | Documents.vue 页面 | 完整文档管理页面 |

### Phase 3: 知识图谱可视化（2.5 小时）

| Step | 内容 | 产出 |
|:----:|------|------|
| 3.1 | `useD3Graph` composable（force simulation 核心封装） | D3 逻辑 |
| 3.2 | GraphCanvas 组件（节点/边/颜色/标签渲染） | 图谱渲染 |
| 3.3 | 悬停 tooltip + 点击高亮一度关系 | 图谱交互 |
| 3.4 | EntityFilter + GraphLegend | 过滤 + 图例 |
| 3.5 | NodeDetail 浮动面板（调用 `GET /kg/{id}/entities/{eid}`） | 节点详情 |

### Phase 4: AI 聊天面板（2.5 小时）

| Step | 内容 | 产出 |
|:----:|------|------|
| 4.1 | ChatPanel + ChatMessage 组件（Markdown 渲染） | 基础对话 |
| 4.2 | `useSSE` composable + `agent.ts` stream 方法 | SSE 流式接入 |
| 4.3 | ToolCallStatus 组件（搜索/查询状态可视化） | 推理过程透明 |
| 4.4 | SourceCitation 组件 + 图谱联动逻辑 | 来源闭环 |
| 4.5 | chat store（消息/SSE/thread/历史） | 状态管理 |

### Phase 5: 主工作台集成（1.5 小时）

| Step | 内容 | 产出 |
|:----:|------|------|
| 5.1 | AppHeader + AppSidebar + StatusBar 布局组件 | 布局框架 |
| 5.2 | Workbench.vue 三栏集成 | 主工作台 |
| 5.3 | ChatView.vue（thread 列表 + 对话详情） | 对话页面 |
| 5.4 | Settings.vue（配置读写） | 设置页面 |

### Phase 6: 响应式 + 暗色模式（1 小时）

| Step | 内容 | 产出 |
|:----:|------|------|
| 6.1 | 三栏/两栏/单栏响应式适配 | 响应式布局 |
| 6.2 | 暗色模式切换 + localStorage 持久化 | 暗色模式 |
| 6.3 | 移动端底部 Tab 切换 | 移动端适配 |

### Phase 7: 联调测试（1 小时）

| Step | 内容 | 产出 |
|:----:|------|------|
| 7.1 | 前端 `localhost:5173` + 后端 `localhost:8765` | 跨域联调 |
| 7.2 | 上传 PDF → 图谱渲染 → 问答测试 | 端到端验证 |
| 7.3 | SSE 流式 + 多轮对话测试 | 流式验证 |

---

## 14. 验证方式

| # | 测试场景 | 操作步骤 | 预期结果 |
|:-:|----------|----------|----------|
| 1 | **文档上传** | 拖拽 `medical_record.pdf` 到上传区域 | 进度条从 0%→100%，图谱自动渲染 |
| 2 | **图谱交互** | 点击任意节点 | 高亮一度关系，右侧显示详情面板 |
| 3 | **实体搜索** | 在图谱搜索框输入"胰腺炎" | 图谱定位到对应节点并高亮 |
| 4 | **同步问答** | 输入"患者有哪些诊断？"并发送 | Agent 返回结构化表格回答，显示来源引用 |
| 5 | **SSE 流式** | 输入"总结患者情况" | 先显示工具调用状态，再打字机输出回答 |
| 6 | **多轮对话** | 先问"诊断" → 再问"用了什么药"（同一 thread） | 第二次回答基于前文上下文 |
| 7 | **图谱联动** | Agent 回答完成后 | 图谱中对应诊断节点高亮闪烁 |
| 8 | **对话历史** | 刷新页面 → 进入 Chat 页面 | 历史对话可查看和恢复 |
| 9 | **响应式布局** | 调整浏览器窗口宽度 | 三栏→两栏→单栏流畅切换 |
| 10 | **暗色模式** | 点击 Header 暗色切换按钮 | 界面颜色切换，图谱颜色自适应 |
| 11 | **文档删除** | 在文档列表中点击删除 | 文档被移除，关联图谱不可用 |
| 12 | **设置页面** | 修改模型配置并保存 | 配置持久化，下次打开保持不变 |
