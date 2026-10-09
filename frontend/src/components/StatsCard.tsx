import type { GraphStats } from '../types'

interface StatsCardProps {
  stats: GraphStats
}

export default function StatsCard({ stats }: StatsCardProps) {
  const items = [
    { label: '节点数', value: stats.nodeCount, color: '#4361ee' },
    { label: '关系数', value: stats.edgeCount, color: '#7209b7' },
    { label: '类型数', value: stats.typeCount, color: '#2a9d8f' },
    { label: '对齐率', value: `${stats.alignmentRate}%`, color: '#f4a261' },
  ]

  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        padding: '10px 14px',
        backgroundColor: 'var(--bg-card)',
        borderRadius: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}
    >
      {items.map((item) => (
        <div
          key={item.label}
          style={{
            flex: 1,
            textAlign: 'center',
            padding: '4px 0',
            borderRight: items.indexOf(item) < items.length - 1 ? '1px solid var(--border-color)' : 'none',
          }}
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: item.color,
              lineHeight: 1.2,
              fontFamily: 'Inter, sans-serif',
            }}
          >
            {item.value}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
            {item.label}
          </div>
        </div>
      ))}
    </div>
  )
}
