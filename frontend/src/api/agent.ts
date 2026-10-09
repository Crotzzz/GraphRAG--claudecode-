/** Agent 问答 API — 对应后端 /api/v1/agent */

import { request } from './client'

const API_BASE = 'http://localhost:8765/api/v1'

export interface SourceInfo {
  type: 'entity' | 'relationship'
  label: string
  name: string
  confidence?: string
  document_id?: string
}

export interface AgentResponse {
  answer: string
  sources?: SourceInfo[]
  tool_calls?: string[]
  latency_ms: number
  thread_id: string
}

export interface ThreadRecord {
  thread_id: string
  doc_id: string | null
  title: string
  message_count: number
  created_at: string
  updated_at: string
}

export interface ChatMessageData {
  role: 'user' | 'assistant'
  content: string
  tool_calls?: string[]
  sources?: SourceInfo[]
  latency_ms?: number
  created_at: string
}

/** SSE 流式回调 */
export interface StreamCallbacks {
  onStatus?: (stage: string, message: string) => void
  onToolCall?: (tool: string, args: Record<string, unknown>) => void
  onToken?: (token: string) => void
  onDone?: (latencyMs: number, sources: SourceInfo[], threadId: string) => void
  onError?: (message: string) => void
}

/** 同步问答 */
export async function queryAgent(docId: string, question: string, threadId?: string): Promise<AgentResponse> {
  return request<AgentResponse>('/agent/query', {
    method: 'POST',
    body: JSON.stringify({ doc_id: docId, question, thread_id: threadId || null }),
  })
}

/** 多轮对话 */
export async function chatAgent(docId: string, question: string, threadId: string): Promise<AgentResponse> {
  return request<AgentResponse>('/agent/chat', {
    method: 'POST',
    body: JSON.stringify({ doc_id: docId, question, thread_id: threadId }),
  })
}

/** SSE 流式问答（使用 POST + ReadableStream） */
export function streamAgentAnswer(
  docId: string,
  question: string,
  callbacks: StreamCallbacks
): AbortController {
  const controller = new AbortController()

  fetch(`${API_BASE}/agent/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ doc_id: docId, question }),
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        const body = await response.text().catch(() => '')
        callbacks.onError?.(`HTTP ${response.status}: ${body.slice(0, 200)}`)
        return
      }
      if (!response.body) {
        callbacks.onError?.('响应体为空')
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue
          try {
            const event = JSON.parse(trimmed.slice(6))
            switch (event.type) {
              case 'status':
                callbacks.onStatus?.(event.stage || '', event.message || '')
                break
              case 'tool_call':
                callbacks.onToolCall?.(event.tool || 'unknown', event.args || {})
                break
              case 'token':
                if (event.content) callbacks.onToken?.(event.content)
                break
              case 'done':
                callbacks.onDone?.(event.latency_ms || 0, event.sources || [], event.thread_id || '')
                break
              case 'error':
                callbacks.onError?.(event.message || '未知错误')
                break
            }
          } catch {
            // 跳过解析失败的 SSE 行
          }
        }
      }
    })
    .catch((err) => {
      // AbortError 是用户取消，不视为错误
      if (err && err.name === 'AbortError') return
      callbacks.onError?.(err?.message || '网络请求失败')
    })

  return controller
}

/** 获取对话线程列表 */
export async function listThreads(page = 1, pageSize = 20) {
  return request<{ total: number; threads: ThreadRecord[] }>(`/agent/threads?page=${page}&page_size=${pageSize}`)
}

/** 获取对话历史 */
export async function getThread(threadId: string) {
  return request<{ thread_id: string; doc_id: string | null; messages: ChatMessageData[] }>(
    `/agent/threads/${threadId}`
  )
}

/** 删除对话 */
export async function deleteThread(threadId: string): Promise<void> {
  return request<void>(`/agent/threads/${threadId}`, { method: 'DELETE' })
}
