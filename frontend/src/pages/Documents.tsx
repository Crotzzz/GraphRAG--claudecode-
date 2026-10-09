import { useState, useEffect, useCallback } from 'react'
import MainLayout from '../layouts/MainLayout'
import UploadZone from '../components/UploadZone'
import { uploadDocument, listDocuments, deleteDocument } from '../api/documents'
import type { DocumentRecord } from '../api/documents'

type SortField = 'filename' | 'file_size' | 'status' | 'created_at'
type SortDir = 'asc' | 'desc'

const STATUS_FILTERS = [
  { value: '', label: '全部' },
  { value: 'done', label: '已完成' },
  { value: 'running', label: '处理中' },
  { value: 'failed', label: '失败' },
] as const

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: '待处理', color: '#999' },
  running: { label: '处理中', color: '#f4a261' },
  done: { label: '已完成', color: '#2a9d8f' },
  failed: { label: '失败', color: '#e63946' },
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function Documents() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [statusFilter, setStatusFilter] = useState('')
  const [sortField, setSortField] = useState<SortField>('created_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)

  const loadDocs = useCallback(async () => {
    try {
      const res = await listDocuments(page, 20, statusFilter || undefined)
      setDocuments(res.items)
      setTotal(res.total)
    } catch (e: any) {
      console.error('加载文档列表失败', e)
    }
  }, [page, statusFilter])

  useEffect(() => { loadDocs() }, [loadDocs])

  const handleUpload = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase()
    const allowed = ['pdf', 'png', 'jpg', 'jpeg', 'docx', 'pptx', 'xlsx', 'html']
    if (!ext || !allowed.includes(ext)) {
      setUploadError(`不支持的文件格式 ".${ext}"`)
      return
    }
    if (file.size > 200 * 1024 * 1024) {
      setUploadError('文件超过 200MB 限制')
      return
    }
    setUploadError(null)
    try {
      await uploadDocument(file)
      loadDocs()
    } catch (e: any) {
      setUploadError('上传失败: ' + (e.message || ''))
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteDocument(id)
      setDocuments(prev => prev.filter(d => d.doc_id !== id))
      setConfirmDelete(null)
    } catch (e: any) {
      setUploadError('删除失败: ' + (e.message || ''))
    }
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const filtered = [...documents].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1
    if (sortField === 'filename') return a.filename.localeCompare(b.filename) * dir
    if (sortField === 'file_size') return (a.file_size - b.file_size) * dir
    if (sortField === 'status') return a.status.localeCompare(b.status) * dir
    return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir
  })

  const doneCount = documents.filter(d => d.status === 'done').length
  const runningCount = documents.filter(d => d.status === 'running').length

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span style={{ opacity: 0.3 }}>↕</span>
    return <span>{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  return (
    <MainLayout documentName="" status="idle">
      <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>
          📄 文档管理
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 20px' }}>
          管理和查看所有已上传的文档
        </p>

        {/* 管线未开发提示 */}
        <div style={{
          padding: '8px 14px', marginBottom: 16,
          backgroundColor: 'rgba(255,193,7,0.12)', color: '#b8860b',
          borderRadius: 8, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
        }}>
          ⚠️ 自动索引管线未开发 — 上传的文档需通过后端管线完成解析后才能查看知识图谱
        </div>

        {/* 统计 */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
          {[
            { label: '总文档数', value: total, color: '#4361ee' },
            { label: '已完成', value: doneCount, color: '#2a9d8f' },
            { label: '处理中', value: runningCount, color: '#f4a261' },
          ].map(stat => (
            <div key={stat.label} className="card" style={{ padding: '16px 24px', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: stat.color, fontFamily: 'Inter' }}>{stat.value}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* 上传 */}
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <UploadZone onUpload={handleUpload} error={uploadError} onClearError={() => setUploadError(null)} />
        </div>

        {/* 表格 */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: 8 }}>
            {STATUS_FILTERS.map(f => (
              <button key={f.value} onClick={() => { setStatusFilter(f.value); setPage(1) }}
                style={{
                  padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border-color)',
                  background: statusFilter === f.value ? '#4361ee' : 'transparent',
                  color: statusFilter === f.value ? '#fff' : 'var(--text-secondary)',
                  fontSize: 12, cursor: 'pointer',
                }}
              >{f.label}</button>
            ))}
          </div>

          <div style={{ overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-page)' }}>
                  {[
                    { field: 'filename' as SortField, label: '文件名' },
                    { field: 'file_size' as SortField, label: '大小' },
                    { field: 'status' as SortField, label: '状态' },
                    { field: 'created_at' as SortField, label: '上传时间' },
                  ].map(col => (
                    <th key={col.field} onClick={() => handleSort(col.field)}
                      style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500, color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', borderBottom: '1px solid var(--border-color)' }}
                    >{col.label} <SortIcon field={col.field} /></th>
                  ))}
                  <th style={{ padding: '10px 14px', textAlign: 'right', borderBottom: '1px solid var(--border-color)' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(doc => {
                  const st = STATUS_MAP[doc.status] || { label: doc.status, color: '#999' }
                  return (
                    <tr key={doc.doc_id} style={{ borderBottom: '1px solid var(--border-color)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.02)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>{doc.file_type === 'pdf' ? '📕' : '📄'}</span>
                          <div>
                            <div style={{ fontWeight: 500, color: 'var(--text-primary)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.filename}</div>
                            {doc.kg_stats && (
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                {doc.kg_stats.total_nodes} 节点 · {doc.kg_stats.total_relationships} 关系
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: 12 }}>{formatSize(doc.file_size)}</td>
                      <td style={{ padding: '10px 14px' }}><span className="badge" style={{ backgroundColor: st.color }}>{st.label}</span></td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: 12 }}>
                        {new Date(doc.created_at).toLocaleDateString('zh-CN') + ' ' + new Date(doc.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        {confirmDelete === doc.doc_id ? (
                          <span style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                            <button onClick={() => handleDelete(doc.doc_id)} className="btn-primary" style={{ height: 28, padding: '0 10px', fontSize: 11, backgroundColor: '#e63946' }}>确认</button>
                            <button onClick={() => setConfirmDelete(null)} className="btn-secondary" style={{ height: 28, padding: '0 10px', fontSize: 11 }}>取消</button>
                          </span>
                        ) : (
                          <button onClick={() => setConfirmDelete(doc.doc_id)}
                            style={{ background: 'none', border: '1px solid transparent', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', padding: '4px 10px', borderRadius: 6 }}
                            onMouseEnter={e => { e.currentTarget.style.color = '#e63946'; e.currentTarget.style.borderColor = 'rgba(230,57,70,0.3)' }}
                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'transparent' }}
                          >删除</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>暂无文档</div>
            )}
          </div>
          <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border-color)', fontSize: 11, color: 'var(--text-muted)' }}>
            共 {filtered.length} 条记录（总 {total} 条）
          </div>
        </div>
      </div>
    </MainLayout>
  )
}
