interface StatusBarProps {
  documentName?: string
  modelName?: string
  status?: 'idle' | 'ready' | 'processing' | 'error'
}

export default function StatusBar({
  documentName,
  modelName = 'DeepSeek V4 Flash',
  status = 'idle',
}: StatusBarProps) {
  const statusConfig = {
    idle:       { label: '等待上传', color: '#999' },
    ready:      { label: '已就绪',   color: '#2a9d8f' },
    processing: { label: '处理中…',  color: '#f4a261' },
    error:      { label: '异常',     color: '#e63946' },
  }

  const cfg = statusConfig[status]

  return (
    <div
      style={{
        height: 'var(--statusbar-height)',
        backgroundColor: 'var(--bg-card)',
        borderTop: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        fontSize: 11,
        color: 'var(--text-secondary)',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {documentName && (
          <span>
            文档: <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{documentName}</span>
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span>模型: {modelName}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: cfg.color,
              display: 'inline-block',
            }}
          />
          状态: {cfg.label}
        </span>
      </div>
    </div>
  )
}
