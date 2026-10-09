import type { DocumentTask } from '../types'

interface TaskListProps {
  tasks: DocumentTask[]
  selectedId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending:  { label: '待处理',  color: '#999' },
  running:  { label: '处理中',  color: '#f4a261' },
  done:     { label: '已完成',  color: '#2a9d8f' },
  failed:   { label: '失败',    color: '#e63946' },
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function TaskList({ tasks, selectedId, onSelect, onDelete }: TaskListProps) {
  if (tasks.length === 0) {
    return (
      <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
        <div>暂无文档</div>
        <div style={{ marginTop: 4 }}>请上传文档开始分析</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {tasks.map((task) => {
        const st = STATUS_MAP[task.status]
        const isSelected = task.doc_id === selectedId

        return (
          <div
            key={task.doc_id}
            onClick={() => onSelect(task.doc_id)}
            style={{
              padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
              backgroundColor: isSelected ? 'rgba(67, 97, 238, 0.08)' : 'transparent',
              border: `1px solid ${isSelected ? 'rgba(67, 97, 238, 0.3)' : 'transparent'}`,
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'rgba(0,0,0,0.02)' }}
            onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }} title={task.filename}>
                {task.filename}
              </span>
              <span className="badge" style={{ backgroundColor: st.color, flexShrink: 0 }}>{st.label}</span>
            </div>

            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: task.status === 'running' ? 6 : 0 }}>
              {formatSize(task.file_size)} · {task.file_type.toUpperCase()}
            </div>

            {task.status === 'running' && (
              <div>
                <div style={{ height: 4, borderRadius: 3, backgroundColor: 'var(--border-color)', overflow: 'hidden' }}>
                  <div className="progress-gradient" style={{ width: `${task.progress}%`, height: '100%' }} />
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, display: 'flex', justifyContent: 'space-between' }}>
                  <span>{task.statusText || '处理中…'}</span>
                  <span>{task.progress}%</span>
                </div>
              </div>
            )}

            {task.status === 'done' && task.nodeCount !== undefined && (
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                {task.nodeCount} 节点 · {task.edgeCount} 关系
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
              <button onClick={(e) => { e.stopPropagation(); onDelete(task.doc_id) }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', padding: '2px 6px', borderRadius: 4 }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#e63946' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}
              >删除</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
