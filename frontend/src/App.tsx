import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary'
import Workbench from './pages/Workbench'
import Documents from './pages/Documents'
import Settings from './pages/Settings'

export default function App() {
  // 恢复暗色模式偏好
  try {
    const savedTheme = localStorage.getItem('theme')
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark')
    }
  } catch { /* ignore */ }

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/workspace" element={
            <ErrorBoundary>
              <Workbench />
            </ErrorBoundary>
          } />
          <Route path="/documents" element={
            <ErrorBoundary>
              <Documents />
            </ErrorBoundary>
          } />
          <Route path="/settings" element={
            <ErrorBoundary>
              <Settings />
            </ErrorBoundary>
          } />
          <Route path="*" element={<Navigate to="/workspace" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
