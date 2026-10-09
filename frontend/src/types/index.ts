// ============================================================
// GraphRAG 类型定义（对齐后端 API）
// ============================================================

// --- 文档/任务 ---
export type TaskStatus = 'pending' | 'running' | 'done' | 'failed'

export interface DocumentTask {
  doc_id: string
  filename: string
  file_size: number
  file_type: string
  status: TaskStatus
  progress: number
  error: string | null
  created_at: string
  updated_at: string
  nodeCount?: number
  edgeCount?: number
  statusText?: string
}

// --- 知识图谱 ---
export type EntityType =
  | 'patient'
  | 'symptom'
  | 'disease'
  | 'medication'
  | 'vital_sign'
  | 'lab_result'

export interface GraphNode {
  id: string
  name: string
  type: EntityType
  group: number
  properties?: Record<string, string>
}

export interface GraphEdge {
  source: string
  target: string
  label: string
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface GraphStats {
  nodeCount: number
  edgeCount: number
  typeCount: number
  alignmentRate: number
}

// --- 聊天 ---
export type MessageRole = 'user' | 'assistant' | 'system'
export type ToolCallStatusType = 'searching' | 'querying' | 'generating' | 'done' | 'error'

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  toolStatus?: ToolCallStatusType
  toolDetail?: string
  sources?: SourceEntity[]
  timestamp: string
}

export interface SourceEntity {
  name: string
  type: EntityType
  snippet?: string
}

// --- 设置 ---
export type LLMModel = 'deepseek-v4-flash' | 'deepseek-v4-pro'
export type MinerUVersion = 'vlm' | 'pipeline'
export type MinerULanguage = 'ch' | 'en'

// --- 实体类型配置 ---
export interface EntityTypeConfig {
  type: EntityType
  label: string
  color: string
  size: number
}

export const ENTITY_TYPES: EntityTypeConfig[] = [
  { type: 'patient',    label: '患者',     color: '#e63946', size: 20 },
  { type: 'symptom',    label: '症状',     color: '#f4a261', size: 16 },
  { type: 'disease',    label: '诊断',     color: '#2a9d8f', size: 22 },
  { type: 'medication', label: '用药',     color: '#264653', size: 16 },
  { type: 'vital_sign', label: '生命体征', color: '#8ecae6', size: 14 },
  { type: 'lab_result', label: '化验结果', color: '#6a4c93', size: 14 },
]

export const ENTITY_COLOR_MAP: Record<EntityType, string> = {
  patient:    '#e63946',
  symptom:    '#f4a261',
  disease:    '#2a9d8f',
  medication: '#264653',
  vital_sign: '#8ecae6',
  lab_result: '#6a4c93',
}
