import { useState, useEffect, useCallback } from 'react'
import MainLayout from '../layouts/MainLayout'
import type { LLMModel, MinerUVersion, MinerULanguage } from '../types'
import { healthCheck, getConfig, updateConfig } from '../api/system'
import type { SystemConfig, HealthResponse } from '../api/system'

export default function Settings() {
  const [apiKey, setApiKey] = useState('')
  const [llmModel, setLlmModel] = useState<LLMModel>('deepseek-v4-flash')
  const [llmBaseUrl, setLlmBaseUrl] = useState('https://api.deepseek.com')
  const [minerUVersion, setMinerUVersion] = useState<MinerUVersion>('vlm')
  const [minerULanguage, setMinerULanguage] = useState<MinerULanguage>('ch')
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected'>('disconnected')
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)

  // 加载系统配置 + 健康检查
  const loadSystem = useCallback(async () => {
    try {
      const [cfg, h] = await Promise.all([getConfig(), healthCheck()])
      setLlmModel((cfg.llm_model as LLMModel) || 'deepseek-v4-flash')
      setLlmBaseUrl(cfg.llm_base_url || 'https://api.deepseek.com')
      setMinerUVersion((cfg.mineru_model as MinerUVersion) || 'vlm')
      setMinerULanguage((cfg.mineru_language as MinerULanguage) || 'ch')
      setConnectionStatus(h.deepseek_api === 'connected' ? 'connected' : 'disconnected')
      setHealth(h)
    } catch (e: any) {
      setLoadErr('加载配置失败: ' + (e.message || ''))
    }
  }, [])

  useEffect(() => { loadSystem() }, [loadSystem])

  const handleTestConnection = async () => {
    setTesting(true)
    try {
      const h = await healthCheck()
      setConnectionStatus(h.deepseek_api === 'connected' ? 'connected' : 'disconnected')
      setHealth(h)
    } catch {
      setConnectionStatus('disconnected')
    }
    setTesting(false)
  }

  const handleSave = async () => {
    try {
      await updateConfig({
        llm_model: llmModel,
        llm_base_url: llmBaseUrl,
        mineru_model: minerUVersion,
        mineru_language: minerULanguage,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e: any) {
      setLoadErr('保存失败: ' + (e.message || ''))
    }
  }

  const SectionCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="card" style={{ marginBottom: 16, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-color)', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
      <div style={{ padding: '16px 20px' }}>{children}</div>
    </div>
  )

  const FormRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 14 }}>
      <div style={{ width: 140, flexShrink: 0, fontSize: 13, color: 'var(--text-secondary)', paddingTop: 6 }}>{label}</div>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  )

  return (
    <MainLayout documentName="" status="idle">
      <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>⚙️ 系统设置</h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 20px' }}>管理 API 配置、模型选择和系统信息</p>

        {loadErr && (
          <div style={{ padding: '8px 14px', marginBottom: 16, backgroundColor: 'rgba(230,57,70,0.1)', color: '#e63946', borderRadius: 8, fontSize: 12 }}>❌ {loadErr}</div>
        )}

        {/* API Key 配置提示 */}
        <div style={{
          padding: '8px 14px', marginBottom: 16,
          backgroundColor: 'rgba(255,193,7,0.12)', color: '#b8860b',
          borderRadius: 8, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
        }}>
          ⚠️ API Key 管理界面未开发 — Key 通过后端 .env 文件配置
        </div>

        <SectionCard title="🤖 API 配置">
          <FormRow label="LLM 模型">
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { value: 'deepseek-v4-flash' as LLMModel, label: 'DeepSeek V4 Flash', desc: '快速响应，适合日常使用' },
                { value: 'deepseek-v4-pro' as LLMModel, label: 'DeepSeek V4 Pro', desc: '更强推理能力' },
              ].map(model => (
                <div key={model.value} onClick={() => setLlmModel(model.value)}
                  style={{
                    flex: 1, padding: '12px 16px', borderRadius: 8,
                    border: `2px solid ${llmModel === model.value ? '#4361ee' : 'var(--border-color)'}`,
                    background: llmModel === model.value ? 'rgba(67,97,238,0.04)' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{model.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{model.desc}</div>
                </div>
              ))}
            </div>
          </FormRow>

          <FormRow label="API 端点">
            <input className="input" value={llmBaseUrl} onChange={e => setLlmBaseUrl(e.target.value)} style={{ flex: 1, width: '100%' }} />
          </FormRow>

          <FormRow label="连接状态">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: connectionStatus === 'connected' ? '#2a9d8f' : '#e63946', display: 'inline-block' }} />
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{connectionStatus === 'connected' ? '已连接' : '未连接'}</span>
              </span>
              <button onClick={handleTestConnection} className="btn-secondary" style={{ whiteSpace: 'nowrap' }}>
                {testing ? '⏳ 测试中…' : '🔗 测试连接'}
              </button>
            </div>
          </FormRow>
        </SectionCard>

        <SectionCard title="📄 MinerU 文档解析配置">
          <FormRow label="模型版本">
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { value: 'vlm' as MinerUVersion, label: 'VLM', desc: '视觉语言模型' },
                { value: 'pipeline' as MinerUVersion, label: 'Pipeline', desc: '传统管线' },
              ].map(ver => (
                <div key={ver.value} onClick={() => setMinerUVersion(ver.value)}
                  style={{
                    padding: '10px 16px', borderRadius: 8, flex: 1,
                    border: `2px solid ${minerUVersion === ver.value ? '#4361ee' : 'var(--border-color)'}`,
                    background: minerUVersion === ver.value ? 'rgba(67,97,238,0.04)' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{ver.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{ver.desc}</div>
                </div>
              ))}
            </div>
          </FormRow>

          <FormRow label="默认语言">
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { value: 'ch' as MinerULanguage, label: '中文' },
                { value: 'en' as MinerULanguage, label: 'English' },
              ].map(lang => (
                <div key={lang.value} onClick={() => setMinerULanguage(lang.value)}
                  style={{
                    padding: '10px 16px', borderRadius: 8,
                    border: `2px solid ${minerULanguage === lang.value ? '#4361ee' : 'var(--border-color)'}`,
                    background: minerULanguage === lang.value ? 'rgba(67,97,238,0.04)' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{lang.label}</div>
                </div>
              ))}
            </div>
          </FormRow>
        </SectionCard>

        <SectionCard title="📊 系统信息">
          {[
            { label: '后端版本', value: health?.version || '-' },
            { label: '服务运行时长', value: health ? `${Math.floor(health.uptime_seconds / 3600)}h ${Math.floor((health.uptime_seconds % 3600) / 60)}m` : '-' },
            { label: '文档总数', value: health?.docs_count ?? '-' },
            { label: 'DeepSeek 状态', value: health?.deepseek_api === 'connected' ? '已连接' : '未连接', color: health?.deepseek_api === 'connected' ? '#2a9d8f' : '#e63946' },
          ].map(info => (
            <div key={info.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{info.label}</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: (info as any).color || 'var(--text-primary)' }}>{info.value}</span>
            </div>
          ))}
        </SectionCard>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {saved && <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#2a9d8f', fontSize: 13 }}>✅ 设置已保存</div>}
          <button onClick={handleSave} className="btn-primary">💾 保存设置</button>
        </div>
      </div>
    </MainLayout>
  )
}
