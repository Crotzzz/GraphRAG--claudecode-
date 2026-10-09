import React from 'react'

interface Props {
  children: React.ReactNode
  fallback?: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100vh', padding: 40, backgroundColor: 'var(--bg-page)', color: 'var(--text-primary)',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>页面渲染出错</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16, maxWidth: 500, textAlign: 'center' }}>
            {this.state.error?.message || '未知错误'}
          </p>
          <button onClick={this.handleReset}
            style={{
              padding: '8px 20px', borderRadius: 8, border: 'none',
              backgroundColor: '#4361ee', color: '#fff', cursor: 'pointer', fontSize: 14,
            }}
          >重新加载</button>
        </div>
      )
    }
    return this.props.children
  }
}
