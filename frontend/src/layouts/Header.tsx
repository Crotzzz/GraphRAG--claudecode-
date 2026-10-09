import { useLocation, useNavigate } from 'react-router-dom'

const NAV_ITEMS = [
  { path: '/workspace', label: '工作台', icon: '⊞' },
  { path: '/documents', label: '文档',   icon: '📄' },
  { path: '/settings',  label: '设置',   icon: '⚙️' },
]

export default function Header() {
  const location = useLocation()
  const navigate = useNavigate()

  const toggleTheme = () => {
    const root = document.documentElement
    const isDark = root.classList.toggle('dark')
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
  }

  return (
    <header
      style={{
        height: 'var(--header-height)',
        backgroundColor: '#1a1a2e',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        flexShrink: 0,
        userSelect: 'none',
        zIndex: 100,
      }}
    >
      {/* 左侧 Logo + 标题 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'linear-gradient(135deg, #4361ee, #7209b7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            fontWeight: 700,
            color: '#fff',
          }}
        >
          G
        </div>
        <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: 0.5 }}>
          GraphRAG 智能文档分析
        </span>
      </div>

      {/* 中间导航 */}
      <nav style={{ display: 'flex', gap: 4 }}>
        {NAV_ITEMS.map((item) => {
          const isActive = location.pathname.startsWith(item.path)
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 16px',
                borderRadius: 8,
                border: 'none',
                background: isActive ? 'rgba(255,255,255,0.12)' : 'transparent',
                color: isActive ? '#fff' : 'rgba(255,255,255,0.7)',
                fontSize: 14,
                fontWeight: isActive ? 600 : 400,
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = 'transparent'
              }}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      {/* 右侧操作区 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={toggleTheme}
          title="切换暗色模式"
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            border: 'none',
            background: 'rgba(255,255,255,0.08)',
            color: '#fff',
            fontSize: 16,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
        >
          🌙
        </button>
      </div>
    </header>
  )
}
