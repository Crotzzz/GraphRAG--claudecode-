import { useState, useRef, type DragEvent } from 'react'

interface UploadZoneProps {
  onUpload: (file: File) => void
  error?: string | null
  onClearError?: () => void
}

export default function UploadZone({ onUpload, error, onClearError }: UploadZoneProps) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(true)
  }
  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(false)
  }
  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) onUpload(file)
  }
  const handleClick = () => {
    inputRef.current?.click()
  }
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onUpload(file)
    if (e.target) e.target.value = ''
  }

  return (
    <div>
      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${dragging ? 'var(--color-primary)' : 'var(--border-color)'}`,
          borderRadius: 10,
          padding: '16px 12px',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'border-color 0.2s, background 0.2s',
          backgroundColor: dragging ? 'rgba(67, 97, 238, 0.04)' : 'transparent',
        }}
      >
        <div style={{ fontSize: 24, marginBottom: 4 }}>📤</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
          拖拽文件到此处<br />或点击上传
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
          PDF / Word / Excel / PPT / 图片
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        style={{ display: 'none' }}
        accept=".pdf,.png,.jpg,.jpeg,.docx,.pptx,.xlsx,.html"
        onChange={handleFileChange}
      />
      {error && (
        <div
          style={{
            marginTop: 6,
            padding: '6px 10px',
            backgroundColor: 'rgba(230, 57, 70, 0.1)',
            color: '#e63946',
            borderRadius: 6,
            fontSize: 11,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>❌ {error}</span>
          <button
            onClick={(e) => { e.stopPropagation(); onClearError?.() }}
            style={{ background: 'none', border: 'none', color: '#e63946', cursor: 'pointer', fontSize: 14 }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}
