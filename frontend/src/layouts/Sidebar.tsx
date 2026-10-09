import { useState } from 'react'
import type { DocumentTask, EntityType } from '../types'
import { ENTITY_TYPES } from '../types'
import UploadZone from '../components/UploadZone'
import TaskList from '../components/TaskList'

interface SidebarProps {
  tasks: DocumentTask[]
  selectedTaskId: string | null
  onSelectTask: (id: string) => void
  onDeleteTask: (id: string) => void
  onUpload: (file: File) => void
  showEntityFilter?: boolean
  selectedEntities?: EntityType[]
  onEntityToggle?: (type: EntityType) => void
  collapsed?: boolean
  onToggleCollapse?: () => void
}

export default function Sidebar({
  tasks,
  selectedTaskId,
  onSelectTask,
  onDeleteTask,
  onUpload,
  showEntityFilter = false,
  selectedEntities = ENTITY_TYPES.map((e) => e.type),
  onEntityToggle,
  collapsed = false,
}: SidebarProps) {
  const [uploadError, setUploadError] = useState<string | null>(null)

  const handleUpload = (file: File) => {
    setUploadError(null)
    const ext = file.name.split('.').pop()?.toLowerCase()
    const allowed = ['pdf', 'png', 'jpg', 'jpeg', 'docx', 'pptx', 'xlsx', 'html']
    if (!ext || !allowed.includes(ext)) {
      setUploadError(`不支持的文件格式 ".${ext}"，支持: ${allowed.join(', ')}`)
      return
    }
    if (file.size > 200 * 1024 * 1024) {
      setUploadError('文件超过 200MB 限制')
      return
    }
    onUpload(file)
  }

  if (collapsed) {
    return (
      <div
        style={{
          width: 'var(--sidebar-collapsed-width)',
          backgroundColor: 'var(--bg-card)',
          borderRight: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '12px 0',
          gap: 16,
          flexShrink: 0,
          overflow: 'hidden',
        }}
      >
        <div title="上传文档" style={{ cursor: 'pointer', fontSize: 22, opacity: 0.6 }}>📤</div>
        <div title="任务列表" style={{ cursor: 'pointer', fontSize: 22, opacity: 0.6 }}>📋</div>
        <div title="过滤" style={{ cursor: 'pointer', fontSize: 22, opacity: 0.6 }}>🔍</div>
      </div>
    )
  }

  return (
    <div
      style={{
        width: 'var(--sidebar-width)',
        backgroundColor: 'var(--bg-card)',
        borderRight: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {/* 标题 */}
      <div
        style={{
          padding: '14px 16px 8px',
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--text-secondary)',
          letterSpacing: 0.5,
          textTransform: 'uppercase',
        }}
      >
        📄 文档管理
      </div>

      {/* 上传区域 */}
      <div style={{ padding: '0 12px 8px' }}>
        <UploadZone onUpload={handleUpload} error={uploadError} onClearError={() => setUploadError(null)} />
      </div>

      {/* 任务列表 */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 8px' }}>
        <TaskList
          tasks={tasks}
          selectedId={selectedTaskId}
          onSelect={onSelectTask}
          onDelete={onDeleteTask}
        />
      </div>

      {/* 实体类型过滤（工作台用） */}
      {showEntityFilter && onEntityToggle && (
        <div
          style={{
            borderTop: '1px solid var(--border-color)',
            padding: '10px 16px',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
            实体类型过滤
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {ENTITY_TYPES.map((et) => {
              const checked = selectedEntities.includes(et.type)
              return (
                <label
                  key={et.type}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    fontSize: 12,
                    color: 'var(--text-primary)',
                    padding: '2px 0',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onEntityToggle(et.type)}
                    style={{ accentColor: et.color }}
                  />
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      backgroundColor: et.color,
                      display: 'inline-block',
                    }}
                  />
                  <span>{et.label}</span>
                </label>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
