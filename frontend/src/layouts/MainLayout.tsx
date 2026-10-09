import { useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import Header from './Header'
import Sidebar from './Sidebar'
import StatusBar from './StatusBar'
import type { DocumentTask, EntityType } from '../types'
import { ENTITY_TYPES } from '../types'

interface MainLayoutProps {
  children: ReactNode
  // 由页面传入的侧栏状态
  tasks?: DocumentTask[]
  selectedTaskId?: string | null
  onSelectTask?: (id: string) => void
  onDeleteTask?: (id: string) => void
  onUpload?: (file: File) => void
  showEntityFilter?: boolean
  selectedEntities?: EntityType[]
  onEntityToggle?: (type: EntityType) => void
  // 底部状态栏
  documentName?: string
  status?: 'idle' | 'ready' | 'processing' | 'error'
}

export default function MainLayout({
  children,
  tasks = [],
  selectedTaskId = null,
  onSelectTask,
  onDeleteTask,
  onUpload,
  showEntityFilter = false,
  selectedEntities = ENTITY_TYPES.map((e) => e.type),
  onEntityToggle,
  documentName,
  status,
}: MainLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const location = useLocation()
  const isWorkbench = location.pathname === '/workspace'

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        backgroundColor: 'var(--bg-page)',
      }}
    >
      <Header />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* 侧边栏 */}
        <Sidebar
          tasks={tasks}
          selectedTaskId={selectedTaskId}
          onSelectTask={onSelectTask || (() => {})}
          onDeleteTask={onDeleteTask || (() => {})}
          onUpload={onUpload || (() => {})}
          showEntityFilter={isWorkbench && showEntityFilter}
          selectedEntities={selectedEntities}
          onEntityToggle={onEntityToggle}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        {/* 侧栏折叠/展开触发区 */}
        <div
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          style={{
            width: 4,
            cursor: 'col-resize',
            flexShrink: 0,
            position: 'relative',
            zIndex: 5,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-primary)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        />

        {/* 主内容区 */}
        <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
          {children}
        </div>
      </div>

      <StatusBar documentName={documentName} status={status} />
    </div>
  )
}
