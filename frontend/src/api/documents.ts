/** 文档索引 API — 对应后端 /api/v1/documents */

import { request, uploadFile } from './client'

export interface DocumentRecord {
  doc_id: string
  filename: string
  file_size: number
  file_type: string
  status: 'pending' | 'running' | 'done' | 'failed'
  progress: number
  error: string | null
  created_at: string
  updated_at: string
  kg_stats?: {
    total_nodes: number
    total_relationships: number
    node_types: Record<string, number>
    relationship_types: Record<string, number>
  }
}

interface DocumentListResponse {
  total: number
  page: number
  page_size: number
  items: DocumentRecord[]
}

/** 上传文件 */
export async function uploadDocument(
  file: File,
  params?: { ocr?: boolean; language?: string; model?: string }
): Promise<DocumentRecord> {
  const form = new FormData()
  form.append('file', file)
  if (params?.ocr !== undefined) form.append('ocr', String(params.ocr))
  if (params?.language) form.append('language', params.language)
  if (params?.model) form.append('model', params.model)
  return uploadFile<DocumentRecord>('/documents/upload', form)
}

/** 文档列表 */
export async function listDocuments(page = 1, pageSize = 20, status?: string): Promise<DocumentListResponse> {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
  if (status) params.set('status', status)
  return request<DocumentListResponse>(`/documents?${params}`)
}

/** 文档详情 */
export async function getDocument(docId: string): Promise<DocumentRecord> {
  return request<DocumentRecord>(`/documents/${docId}`)
}

/** 删除文档 */
export async function deleteDocument(docId: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/documents/${docId}`, { method: 'DELETE' })
}
