/** 知识图谱 API — 对应后端 /api/v1/kg */

import { request } from './client'

export interface KGNode {
  id: string
  label: string
  name: string
  properties: Record<string, string>
  source: {
    document_id: string
    char_interval: { start_pos: number; end_pos: number }
    alignment_status: string
    context: string
  }
}

export interface KGRelationship {
  id: string
  type: string
  source_id: string
  source_label: string
  target_id: string
  target_label: string
  target_name: string
}

export interface KGData {
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

export interface KGStats {
  total_nodes: number
  total_relationships: number
  node_types: Record<string, number>
  relationship_types: Record<string, number>
}

/** 获取完整知识图谱 */
export async function getFullKG(docId: string): Promise<KGData> {
  return request<KGData>(`/kg/${docId}`)
}

/** 获取知识图谱统计 */
export async function getKGStats(docId: string): Promise<KGStats> {
  return request<KGStats>(`/kg/${docId}/stats`)
}

/** 搜索实体 */
export async function searchKG(docId: string, query: string, label?: string) {
  const params = new URLSearchParams({ q: query })
  if (label) params.set('label', label)
  return request<{ query: string; total: number; results: any[] }>(`/kg/${docId}/search?${params}`)
}

/** 获取实体详情 */
export async function getEntityDetail(docId: string, entityId: string) {
  return request<{ entity: KGNode; outgoing_relations: KGRelationship[]; incoming_relations: KGRelationship[] }>(
    `/kg/${docId}/entities/${entityId}`
  )
}
