import { useState, useRef, useEffect } from 'react'
import type { ChatMessage, SourceEntity } from '../types'
import { ENTITY_COLOR_MAP } from '../types'

interface ChatPanelProps {
  messages: ChatMessage[]
  onSend: (message: string) => void
  isProcessing?: boolean
  disabled?: boolean
  placeholder?: string
}

export default function ChatPanel({
  messages,
  onSend,
  isProcessing = false,
  disabled = false,
  placeholder = '请输入您的问题…',
}: ChatPanelProps) {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 自动聚焦输入框
  useEffect(() => {
    if (!disabled && !isProcessing) {
      inputRef.current?.focus()
    }
  }, [disabled, isProcessing])

  const handleSend = () => {
    const text = input.trim()
    if (!text || isProcessing || disabled) return
    onSend(text)
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    // 自动调整高度
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 100)}px`
  }

  return (
    <div
      style={{
        width: 380,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--bg-card)',
        borderLeft: '1px solid var(--border-color)',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {/* 标题 */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-color)',
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--text-secondary)',
          letterSpacing: 0.5,
          textTransform: 'uppercase',
        }}
      >
        💬 智能问答
      </div>

      {/* 消息列表 */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.length === 0 && !isProcessing && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--text-muted)',
              fontSize: 12,
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
            <div>选择文档后开始提问</div>
            <div style={{ marginTop: 4, fontSize: 11 }}>支持多轮对话，可连续追问</div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            {/* 消息气泡 */}
            <div
              className={msg.role === 'user' ? 'message-bubble-user' : 'message-bubble-assistant'}
              style={{
                maxWidth: '90%',
                padding: '10px 14px',
                fontSize: 13,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {msg.role === 'assistant' && msg.toolStatus && (
                <div style={{ marginBottom: 8 }}>
                  {/* 工具调用状态 */}
                  {msg.toolStatus !== 'done' && msg.toolStatus !== 'error' && (
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '4px 10px',
                        borderRadius: 6,
                        backgroundColor: 'rgba(67, 97, 238, 0.08)',
                        fontSize: 11,
                        color: 'var(--color-primary)',
                        animation: 'pulse 2s ease-in-out infinite',
                      }}
                    >
                      <span style={{ fontSize: 12 }}>{msg.toolDetail || '处理中…'}</span>
                    </div>
                  )}
                  {msg.toolStatus === 'error' && (
                    <div style={{ color: '#e63946', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                      ❌ 处理出错
                    </div>
                  )}
                </div>
              )}
              <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
            </div>

            {/* 来源引用 */}
            {msg.sources && msg.sources.length > 0 && (
              <div
                style={{
                  marginTop: 6,
                  padding: '8px 12px',
                  backgroundColor: 'rgba(42, 157, 143, 0.06)',
                  borderRadius: 8,
                  fontSize: 11,
                  maxWidth: '90%',
                  alignSelf: 'flex-start',
                }}
              >
                <div style={{ fontWeight: 600, color: '#2a9d8f', marginBottom: 4, fontSize: 10 }}>
                  📎 来源引用
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {msg.sources.map((src, i) => (
                    <span
                      key={i}
                      style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 10,
                        backgroundColor: `${ENTITY_COLOR_MAP[src.type] || '#999'}20`,
                        color: ENTITY_COLOR_MAP[src.type] || '#999',
                      }}
                    >
                      {src.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 时间戳 */}
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, padding: '0 4px' }}>
              {new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        ))}

        {/* 加载中占位 */}
        {isProcessing && messages[messages.length - 1]?.role === 'user' && (
          <div className="animate-fade-in" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--color-primary)', animation: 'pulse 1.5s ease-in-out infinite' }} />
            <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--color-primary)', animation: 'pulse 1.5s ease-in-out infinite 0.3s' }} />
            <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--color-primary)', animation: 'pulse 1.5s ease-in-out infinite 0.6s' }} />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入区 */}
      <div
        style={{
          padding: '10px 12px',
          borderTop: '1px solid var(--border-color)',
          backgroundColor: 'var(--bg-card)',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'flex-end',
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={disabled ? '请先选择文档' : placeholder}
            disabled={disabled || isProcessing}
            rows={1}
            className="input"
            style={{
              resize: 'none',
              minHeight: 36,
              maxHeight: 100,
              padding: '8px 12px',
              fontSize: 13,
              lineHeight: 1.4,
              flex: 1,
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isProcessing || disabled}
            className="btn-primary"
            style={{
              height: 36,
              width: 50,
              padding: 0,
              flexShrink: 0,
              fontSize: 16,
            }}
          >
            {isProcessing ? '⏳' : '➤'}
          </button>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'right', marginTop: 4 }}>
          Ctrl+Enter 发送
        </div>
      </div>
    </div>
  )
}
