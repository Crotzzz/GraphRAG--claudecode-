/** 系统管理 API — 对应后端 /api/v1/system */

import { request } from './client'

export interface SystemConfig {
  llm_provider: string
  llm_model: string
  llm_base_url: string
  mineru_model: string
  mineru_language: string
  concurrent_tasks: number
}

export interface HealthResponse {
  status: string
  version: string
  uptime_seconds: number
  docs_count: number
  threads_count: number
  deepseek_api: string
  disk_usage_percent: number
}

/** 健康检查 */
export async function healthCheck(): Promise<HealthResponse> {
  return request<HealthResponse>('/system/health')
}

/** 获取配置 */
export async function getConfig(): Promise<SystemConfig> {
  return request<SystemConfig>('/system/config')
}

/** 更新配置 */
export async function updateConfig(updates: Partial<SystemConfig>): Promise<SystemConfig> {
  return request<SystemConfig>('/system/config', {
    method: 'PUT',
    body: JSON.stringify(updates),
  })
}
