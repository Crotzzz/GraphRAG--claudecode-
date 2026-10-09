import { useState, useCallback, useEffect, useRef } from 'react'
import type { DocumentTask, ChatMessage, GraphData, GraphStats, EntityType } from '../types'
import { ENTITY_TYPES } from '../types'
import GraphCanvas from '../components/GraphCanvas'
import ChatPanel from '../components/ChatPanel'
import StatsCard from '../components/StatsCard'
import MainLayout from '../layouts/MainLayout'
import { uploadDocument, getDocument, listDocuments, deleteDocument as deleteDocumentApi } from '../api/documents'
import { getFullKG, getKGStats } from '../api/kg'
import { streamAgentAnswer } from '../api/agent'
import type { SourceInfo } from '../api/agent'

export default function Workbench() {
  const [tasks, setTasks] = useState<DocumentTask[]>([])
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null)
  const [isChatProcessing, setIsChatProcessing] = useState(false)
  const [selectedEntities, setSelectedEntities] = useState<EntityType[]>(ENTITY_TYPES.map((e) => e.type))
  const [graphHighlightNodes, setGraphHighlightNodes] = useState<string[]>([])
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [graphStats, setGraphStats] = useState<GraphStats>({ nodeCount: 0, edgeCount: 0, typeCount: 0, alignmentRate: 0 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 强制重渲染触发器（不存储数据）
  const [, triggerRender] = useState(0)

  // refs
  const graphDataRef = useRef<GraphData | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const currentThreadId = useRef<string | null>(null)
  const selectedDocIdRef = useRef<string | null>(null)
  // 按文档独立保存对话历史 (doc_id → ChatMessage[])
  const chatByDoc = useRef<Map<string, ChatMessage[]>>(new Map())

  useEffect(() => { graphDataRef.current = graphData }, [graphData])
  useEffect(() => { selectedDocIdRef.current = selectedDocId }, [selectedDocId])
  useEffect(() => { return () => { abortRef.current?.abort() } }, [])

  // 当前文档的对话（从 ref 读取，纯计算）
  const displayMessages: ChatMessage[] = selectedDocId ? (chatByDoc.current.get(selectedDocId) || []) : []

  // 辅助：更新当前文档的对话并触发重渲染
  const updateChat = (fn: (prev: ChatMessage[]) => ChatMessage[]) => {
    const docId = selectedDocIdRef.current
    if (!docId) return
    const prev = chatByDoc.current.get(docId) || []
    const next = fn(prev)
    chatByDoc.current.set(docId, next)
    triggerRender(n => n + 1)
  }

  // 加载文档列表
  const loadTasks = useCallback(async () => {
    try {
      const res = await listDocuments(1, 50)
      setTasks(res.items.map(d => ({
        doc_id: d.doc_id, filename: d.filename, file_size: d.file_size,
        file_type: d.file_type, status: d.status, progress: d.progress,
        error: d.error, created_at: d.created_at, updated_at: d.updated_at,
        nodeCount: d.kg_stats?.total_nodes, edgeCount: d.kg_stats?.total_relationships,
      })))
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadTasks() }, [loadTasks])

  // 选中文档 → 加载图谱
  useEffect(() => {
    if (!selectedDocId) {
      setGraphData(null)
      setGraphStats({ nodeCount: 0, edgeCount: 0, typeCount: 0, alignmentRate: 0 })
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.all([
      getFullKG(selectedDocId).catch(() => null),
      getKGStats(selectedDocId).catch(() => null),
    ]).then(([kg, stats]) => {
      if (cancelled) return
      if (kg) {
        setGraphData({
          nodes: kg.nodes.map((n, i) => ({
            id: n.id,
            name: n.name && n.name.length > 12 ? n.name.slice(0, 11) + '…' : (n.name || ''),
            type: (n.label as EntityType) || 'disease',
            group: i, properties: n.properties || {},
          })),
          edges: (kg.relationships || [])
            .filter(r => r && new Set(kg.nodes.map(x => x.id)).has(r.source_id) && new Set(kg.nodes.map(x => x.id)).has(r.target_id))
            .map(r => ({ source: r.source_id, target: r.target_id, label: r.type || '' })),
        })
        const exactCount = (kg.nodes || []).filter(n => n.source?.alignment_status === 'match_exact').length
        setGraphStats({
          nodeCount: kg.nodes.length, edgeCount: (kg.relationships || []).length,
          typeCount: new Set(kg.nodes.map(n => n.label)).size,
          alignmentRate: kg.nodes.length > 0 ? Math.round((exactCount / kg.nodes.length) * 100) : 0,
        })
      }
      if (stats) {
        setGraphStats(prev => ({
          ...prev, nodeCount: stats.total_nodes || 0, edgeCount: stats.total_relationships || 0,
          typeCount: Object.keys(stats.node_types || {}).length,
        }))
      }
      setLoading(false)
    }).catch(e => {
      if (!cancelled) { setError('加载知识图谱失败: ' + (e?.message || '')); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [selectedDocId])

  // 上传文件
  const handleUpload = useCallback(async (file: File) => {
    setError(null)
    try {
      const doc = await uploadDocument(file)
      setTasks(prev => [{
        doc_id: doc.doc_id, filename: doc.filename, file_size: doc.file_size,
        file_type: doc.file_type, status: doc.status, progress: doc.progress,
        error: null, created_at: doc.created_at, updated_at: doc.updated_at,
      }, ...prev])
      setSelectedDocId(doc.doc_id)
    } catch (e: any) { setError('上传失败: ' + (e?.message || '')) }
  }, [])

  // 删除任务
  const handleDeleteTask = useCallback(async (id: string) => {
    try {
      await deleteDocumentApi(id)
      setTasks(prev => prev.filter(t => t.doc_id !== id))
      chatByDoc.current.delete(id)
      if (selectedDocId === id) {
        setSelectedDocId(null)
        setGraphData(null)
        triggerRender(n => n + 1)
      }
    } catch (e: any) { setError('删除失败: ' + (e?.message || '')) }
  }, [selectedDocId])

  // 发送消息 → SSE 流式
  const handleSendMessage = useCallback((text: string) => {
    const docId = selectedDocIdRef.current
    if (!docId) return

    abortRef.current?.abort()

    // 添加用户消息
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`, role: 'user', content: text,
      timestamp: new Date().toISOString(),
    }
    updateChat(prev => [...prev, userMsg])
    setIsChatProcessing(true)

    const assistantId = `msg-${Date.now() + 1}`
    updateChat(prev => [...prev, {
      id: assistantId, role: 'assistant', content: '',
      toolStatus: 'searching', toolDetail: '正在分析问题…',
      timestamp: new Date().toISOString(),
    }])

    const abort = streamAgentAnswer(docId, text, {
      onStatus(_stage, message) {
        updateChat(prev => prev.map(m => m.id === assistantId ? { ...m, toolDetail: message || '处理中…' } : m))
      },
      onToolCall(tool) {
        const labels: Record<string, string> = {
          retrieve_kg: '正在搜索知识图谱…', query_graph: '正在查询关系…', list_entities: '正在浏览实体…',
        }
        updateChat(prev => prev.map(m =>
          m.id === assistantId ? { ...m, toolDetail: labels[tool] || `调用 ${tool}…`, toolStatus: 'querying' } : m
        ))
      },
      onToken(token) {
        if (!token) return
        updateChat(prev => prev.map(m =>
          m.id === assistantId ? { ...m, content: m.content + token, toolStatus: 'generating' } : m
        ))
      },
      onDone(latencyMs, sources, threadId) {
        currentThreadId.current = threadId
        const srcEntities = (sources || []).filter((s): s is SourceInfo & { label: string } => s.type === 'entity' && !!s.label)
          .map(s => ({ name: s.name || '', type: s.label as EntityType }))
        updateChat(prev => prev.map(m =>
          m.id === assistantId ? { ...m, toolStatus: 'done', toolDetail: `完成 (${latencyMs}ms)`, sources: srcEntities } : m
        ))
        setIsChatProcessing(false)
        // 图谱联动
        if (srcEntities.length > 0) {
          const kg = graphDataRef.current
          if (kg?.nodes) {
            const ids = kg.nodes.filter(n =>
              srcEntities.some(s => (s.name && n.name && (n.name.includes(s.name.slice(0, 6)) || s.name.includes(n.name.slice(0, 6)))))
            ).map(n => n.id)
            if (ids.length > 0) setTimeout(() => setGraphHighlightNodes(ids), 100)
          }
        }
      },
      onError(message) {
        updateChat(prev => prev.map(m =>
          m.id === assistantId ? { ...m, content: m.content + `\n\n[错误] ${message || '未知错误'}`, toolStatus: 'error', toolDetail: '出错了' } : m
        ))
        setIsChatProcessing(false)
      },
    })
    abortRef.current = abort
  }, [])

  const handleEntityToggle = (type: EntityType) => {
    setSelectedEntities(prev => prev.includes(type) ? prev.filter(e => e !== type) : [...prev, type])
  }

  const handleSelectDoc = (id: string) => {
    abortRef.current?.abort()
    setSelectedDocId(id)
    setGraphHighlightNodes([])
  }

  const selectedDoc = tasks.find(t => t.doc_id === selectedDocId)
  const documentStatus = selectedDoc?.status === 'done' ? 'ready'
    : selectedDoc?.status === 'running' ? 'processing'
    : selectedDoc?.status === 'failed' ? 'error' : 'idle'

  return (
    <MainLayout
      tasks={tasks}
      selectedTaskId={selectedDocId}
      onSelectTask={handleSelectDoc}
      onDeleteTask={handleDeleteTask}
      onUpload={handleUpload}
      showEntityFilter
      selectedEntities={selectedEntities}
      onEntityToggle={handleEntityToggle}
      documentName={selectedDoc?.filename}
      status={documentStatus}
    >
      <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {error && (
            <div style={{
              padding: '8px 14px', margin: '8px 12px 0',
              backgroundColor: 'rgba(230,57,70,0.1)', color: '#e63946',
              borderRadius: 8, fontSize: 12, display: 'flex', justifyContent: 'space-between',
            }}>
              <span>⚠️ {error}</span>
              <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#e63946', cursor: 'pointer' }}>×</button>
            </div>
          )}

          {selectedDoc && (
            <div style={{ padding: '4px 14px 0' }}>
              <span style={{ padding: '4px 10px', borderRadius: 6, fontSize: 10, backgroundColor: 'rgba(255,193,7,0.15)', color: '#b8860b', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                ⚠️ 自动索引管线未开发
              </span>
            </div>
          )}

          {selectedDocId && graphStats.nodeCount > 0 && (
            <div style={{ padding: '10px 14px', flexShrink: 0 }}>
              <StatsCard stats={graphStats} />
            </div>
          )}

          <div style={{ flex: 1, position: 'relative' }}>
            {loading && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13, zIndex: 2, background: 'rgba(0,0,0,0.03)' }}>
                ⏳ 加载知识图谱…
              </div>
            )}
            <GraphCanvas data={graphData} highlightNodes={graphHighlightNodes} selectedEntities={selectedEntities} onNodeClick={() => {}} />
          </div>
        </div>

        <ChatPanel
          messages={displayMessages}
          onSend={handleSendMessage}
          isProcessing={isChatProcessing}
          disabled={!selectedDocId}
          placeholder={!selectedDocId ? '请先选择文档' : '请输入您的问题…'}
        />
      </div>
    </MainLayout>
  )
}
