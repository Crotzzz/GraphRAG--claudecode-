/** GraphRAG API 客户端 */

const API_BASE = 'http://localhost:8765/api/v1'

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message)
  }
}

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const detail = body.detail || {}
    const code = typeof detail === 'string' ? detail : detail?.error || 'UNKNOWN'
    const msg = typeof detail === 'string' ? detail : detail?.message || res.statusText
    throw new ApiError(res.status, code, msg)
  }
  return res.json()
}

/** multipart/form-data 上传 */
export async function uploadFile<T>(path: string, formData: FormData): Promise<T> {
  const url = `${API_BASE}${path}`
  const res = await fetch(url, { method: 'POST', body: formData })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const detail = body.detail || {}
    const code = typeof detail === 'string' ? detail : detail?.error || 'UPLOAD_FAILED'
    const msg = typeof detail === 'string' ? detail : detail?.message || res.statusText
    throw new ApiError(res.status, code, msg)
  }
  return res.json()
}
