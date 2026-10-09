import { useState, useRef, useEffect, useCallback } from 'react'
import type { GraphData, GraphNode, EntityType } from '../types'
import { ENTITY_COLOR_MAP } from '../types'

interface GraphCanvasProps {
  data: GraphData | null
  highlightNodes?: string[]
  selectedEntities?: EntityType[]
  onNodeClick?: (node: GraphNode) => void
}

// 模拟图谱数据（空状态时展示）
const DEMO_GRAPH: GraphData = {
  nodes: [
    { id: '1', name: '急性胰腺炎', type: 'disease', group: 1 },
    { id: '2', name: '胆囊结石',   type: 'disease', group: 1 },
    { id: '3', name: '腹痛',       type: 'symptom', group: 2 },
    { id: '4', name: '恶心',       type: 'symptom', group: 2 },
    { id: '5', name: '张医生',     type: 'patient', group: 3 },
    { id: '6', name: '硝苯地平',   type: 'medication', group: 4 },
    { id: '7', name: '生长抑素',   type: 'medication', group: 4 },
    { id: '8', name: '体温 38.5℃',type: 'vital_sign', group: 5 },
    { id: '9', name: 'WBC 12.5',  type: 'lab_result', group: 6 },
    { id: '10', name: '高血压',    type: 'disease', group: 1 },
    { id: '11', name: '头痛',      type: 'symptom', group: 2 },
    { id: '12', name: '血常规',    type: 'lab_result', group: 6 },
  ],
  edges: [
    { source: '5', target: '1', label: '确诊' },
    { source: '5', target: '2', label: '确诊' },
    { source: '1', target: '3', label: '表现为' },
    { source: '1', target: '4', label: '表现为' },
    { source: '2', target: '3', label: '表现为' },
    { source: '5', target: '6', label: '处方' },
    { source: '5', target: '7', label: '处方' },
    { source: '5', target: '8', label: '测量' },
    { source: '5', target: '9', label: '化验' },
    { source: '1', target: '10', label: '合并' },
    { source: '10', target: '11', label: '表现为' },
    { source: '5', target: '12', label: '化验' },
  ],
}

interface Position { x: number; y: number }

/**
 * 判断事件目标是否为 SVG 根元素（空白区域点击）
 */
function isSvgRootTarget(el: EventTarget | null): boolean {
  if (!el || !(el instanceof Element)) return false
  return el.tagName === 'svg' || el === el.closest('svg')
}

export default function GraphCanvas({
  data,
  highlightNodes = [],
  selectedEntities,
  onNodeClick,
}: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  // 图谱状态
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })

  // 交互状态 ref（避免闭包问题 + 不触发重渲染）
  const isPanning = useRef(false)           // 是否正在平移画布
  const dragNodeId = useRef<string | null>(null)  // 正在拖拽的节点 ID
  const pointerStart = useRef({ x: 0, y: 0 })    // 指针按下位置
  const offsetStart = useRef({ x: 0, y: 0 })     // 平移起始偏移
  const nodePositions = useRef<Map<string, Position>>(new Map())
  const didDrag = useRef(false)                   // 是否发生了拖拽

  const graphData = data || DEMO_GRAPH

  // 过滤节点
  const filteredNodes = selectedEntities?.length
    ? graphData.nodes.filter((n) => selectedEntities.includes(n.type))
    : graphData.nodes

  const filteredNodeIds = new Set(filteredNodes.map((n) => n.id))
  const filteredEdges = graphData.edges.filter(
    (e) => filteredNodeIds.has(e.source as string) && filteredNodeIds.has(e.target as string)
  )

  // 初始化/重置节点位置
  const initPositions = useCallback(() => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const cx = rect.width / 2
    const cy = rect.height / 2
    const radius = Math.min(cx, cy) * 0.6

    const positions = new Map<string, Position>()
    filteredNodes.forEach((node, i) => {
      if (nodePositions.current.has(node.id)) {
        positions.set(node.id, nodePositions.current.get(node.id)!)
      } else {
        const angle = (2 * Math.PI * i) / filteredNodes.length - Math.PI / 2
        const r = radius * (0.6 + Math.random() * 0.4)
        positions.set(node.id, {
          x: cx + r * Math.cos(angle),
          y: cy + r * Math.sin(angle),
        })
      }
    })
    nodePositions.current = positions
  }, [filteredNodes])

  // 初始化 + 容器尺寸变化时重新布局
  useEffect(() => {
    initPositions()
    const observer = new ResizeObserver(() => initPositions())
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [initPositions])

  // 高亮关联节点
  const getRelatedNodeIds = useCallback((nodeId: string): Set<string> => {
    const ids = new Set<string>([nodeId])
    filteredEdges.forEach((e) => {
      const s = e.source as string
      const t = e.target as string
      if (s === nodeId) ids.add(t)
      if (t === nodeId) ids.add(s)
    })
    return ids
  }, [filteredEdges])

  const relatedIds = selectedNode ? getRelatedNodeIds(selectedNode) : null

  // 找到鼠标位置下的节点
  const findNodeAtPointer = (clientX: number, clientY: number): string | null => {
    const svg = svgRef.current
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    // 将鼠标坐标转换到 SVG 视图坐标
    const svgX = (clientX - rect.left - offset.x) / zoom
    const svgY = (clientY - rect.top - offset.y) / zoom

    // 从大到小遍历（后面的节点在上层）
    let closest: string | null = null
    let closestDist = Infinity

    filteredNodes.forEach((node) => {
      const pos = nodePositions.current.get(node.id)
      if (!pos) return
      const dx = svgX - pos.x
      const dy = svgY - pos.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const nodeSize = node.type === 'disease' ? 22 : node.type === 'patient' ? 20 : 16
      const hitRadius = Math.max(nodeSize + 4, 20) // 点击容差
      if (dist <= hitRadius && dist < closestDist) {
        closest = node.id
        closestDist = dist
      }
    })
    return closest
  }

  // ─── 指针事件处理 ────────────────────────────────────

  const handlePointerDown = (e: React.PointerEvent) => {
    didDrag.current = false
    pointerStart.current = { x: e.clientX, y: e.clientY }
    offsetStart.current = { ...offset }

    const nodeId = findNodeAtPointer(e.clientX, e.clientY)
    if (nodeId) {
      // 点到了节点上 → 准备拖拽节点
      dragNodeId.current = nodeId
      isPanning.current = false
    } else {
      // 点到了空白处 → 准备平移画布
      dragNodeId.current = null
      isPanning.current = true
    }
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    const dx = e.clientX - pointerStart.current.x
    const dy = e.clientY - pointerStart.current.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist > 3) {
      didDrag.current = true
    }

    if (dragNodeId.current && dist > 3) {
      // 拖拽节点
      const pos = nodePositions.current.get(dragNodeId.current)
      if (pos) {
        pos.x += dx / zoom
        pos.y += dy / zoom
        nodePositions.current.set(dragNodeId.current, pos)
        // 触发重渲染（通过 forceUpdate hack）
        setOffset((prev) => ({ ...prev }))
      }
      pointerStart.current = { x: e.clientX, y: e.clientY }
    } else if (isPanning.current) {
      // 平移画布
      setOffset({
        x: offsetStart.current.x + dx,
        y: offsetStart.current.y + dy,
      })
    }
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    const nodeId = findNodeAtPointer(e.clientX, e.clientY)

    if (!didDrag.current) {
      // 没有发生拖拽 → 视为点击
      if (nodeId) {
        // 点击节点：切换选中状态
        const node = filteredNodes.find((n) => n.id === nodeId)
        if (node) {
          if (selectedNode === nodeId) {
            setSelectedNode(null)
          } else {
            setSelectedNode(nodeId)
          }
          onNodeClick?.(node)
        }
      } else if (isSvgRootTarget(e.target)) {
        // 点击空白区域 → 取消选中 + 清除高亮
        setSelectedNode(null)
        setHoveredNode(null)
      }
    }

    // 重置拖拽/平移状态
    isPanning.current = false
    dragNodeId.current = null
    didDrag.current = false
  }

  // 缩放
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom((z) => Math.max(0.2, Math.min(3, z * delta)))
  }

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', backgroundColor: 'var(--bg-card)' }}
      onWheel={handleWheel}
    >
      {/* 空状态引导 */}
      {!data && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
            zIndex: 1,
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 12 }}>🕸️</div>
          <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>知识图谱可视化</div>
          <div style={{ fontSize: 12 }}>上传文档后自动生成知识图谱</div>
        </div>
      )}

      {/* 图谱画布 */}
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        style={{
          position: 'absolute',
          inset: 0,
          cursor: dragNodeId.current ? 'grabbing' : isPanning.current ? 'grabbing' : 'grab',
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
          transformOrigin: 'center',
          transition: didDrag.current ? 'none' : 'transform 0.1s',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* 连接线 */}
        {filteredEdges.map((edge, i) => {
          const sourcePos = nodePositions.current.get(edge.source as string)
          const targetPos = nodePositions.current.get(edge.target as string)
          if (!sourcePos || !targetPos) return null

          const isRelated =
            relatedIds &&
            (relatedIds.has(edge.source as string) && relatedIds.has(edge.target as string))
          const isDimmed = relatedIds && !isRelated
          const isHighlighted =
            highlightNodes.length > 0 &&
            (highlightNodes.includes(edge.source as string) || highlightNodes.includes(edge.target as string))

          return (
            <g key={`edge-${i}`}>
              <line
                x1={sourcePos.x}
                y1={sourcePos.y}
                x2={targetPos.x}
                y2={targetPos.y}
                stroke={
                  isHighlighted ? '#4361ee'
                  : isRelated ? 'var(--color-primary)'
                  : selectedNode ? 'var(--border-color)'
                  : 'var(--border-color)'
                }
                strokeWidth={isRelated ? 2.5 : isHighlighted ? 2.5 : 1}
                strokeOpacity={isDimmed ? 0.1 : isHighlighted ? 0.9 : isRelated ? 0.8 : 0.35}
              />
              {/* 关系标签 */}
              <text
                x={(sourcePos.x + targetPos.x) / 2}
                y={(sourcePos.y + targetPos.y) / 2 - 6}
                textAnchor="middle"
                fontSize={9}
                fill={isDimmed ? 'transparent' : isRelated ? 'var(--text-primary)' : 'var(--text-muted)'}
                fontWeight={isRelated ? 500 : 400}
              >
                {edge.label}
              </text>
            </g>
          )
        })}

        {/* 节点 */}
        {filteredNodes.map((node) => {
          const pos = nodePositions.current.get(node.id)
          if (!pos) return null

          const isHovered = hoveredNode === node.id
          const isSelectedNode = selectedNode === node.id
          const isRelatedNode = relatedIds?.has(node.id)
          const isDimmed = relatedIds && !isRelatedNode
          const isHighlighted = highlightNodes.includes(node.id)
          const color = ENTITY_COLOR_MAP[node.type] || '#999'
          const baseSize = node.type === 'disease' ? 22 : node.type === 'patient' ? 20 : 16
          const size = isSelectedNode ? baseSize + 4 : isHovered ? baseSize + 3 : baseSize

          return (
            <g
              key={node.id}
              transform={`translate(${pos.x}, ${pos.y})`}
              style={{ cursor: 'pointer' }}
              onPointerEnter={() => setHoveredNode(node.id)}
              onPointerLeave={() => setHoveredNode(null)}
            >
              {/* 高亮光环 */}
              {(isSelectedNode || isHighlighted) && (
                <circle
                  r={size + 8}
                  fill="none"
                  stroke={color}
                  strokeWidth={2.5}
                  opacity={0.5}
                  filter="url(#glow)"
                />
              )}
              {/* 节点外圈光晕（选中时） */}
              {isSelectedNode && (
                <circle
                  r={size + 4}
                  fill={color}
                  opacity={0.15}
                />
              )}
              {/* 节点圆 */}
              <circle
                r={size}
                fill={color}
                opacity={isDimmed ? 0.15 : 0.9}
                stroke={isSelectedNode ? '#fff' : isHovered ? 'rgba(255,255,255,0.8)' : 'transparent'}
                strokeWidth={isSelectedNode ? 3 : isHovered ? 2 : 0}
                style={{ transition: 'r 0.15s, opacity 0.15s, stroke-width 0.15s' }}
              />
              {/* 节点名称 */}
              <text
                y={size + 14}
                textAnchor="middle"
                fontSize={10}
                fill={isDimmed ? 'transparent' : isSelectedNode ? 'var(--text-primary)' : isHovered ? 'var(--text-primary)' : 'var(--text-secondary)'}
                fontWeight={isSelectedNode ? 700 : isHovered ? 600 : 400}
                style={{ transition: 'fill 0.15s, font-weight 0.15s' }}
              >
                {node.name.length > 8 ? node.name.slice(0, 7) + '…' : node.name}
              </text>
            </g>
          )
        })}
      </svg>

      {/* 图例 */}
      <div
        style={{
          position: 'absolute',
          bottom: 12,
          left: 12,
          padding: '8px 12px',
          backgroundColor: 'var(--bg-card)',
          borderRadius: 8,
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          zIndex: 2,
        }}
      >
        {Object.entries(ENTITY_COLOR_MAP).map(([type, color]) => {
          const labels: Record<string, string> = {
            patient: '患者', symptom: '症状', disease: '诊断',
            medication: '用药', vital_sign: '体征', lab_result: '化验',
          }
          const show = !selectedEntities || selectedEntities.length === 0 || selectedEntities.includes(type as EntityType)
          if (!show) return null
          return (
            <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: color, display: 'inline-block' }} />
              <span style={{ color: 'var(--text-secondary)' }}>{labels[type] || type}</span>
            </div>
          )
        })}
      </div>

      {/* 缩放控制 */}
      <div
        style={{
          position: 'absolute',
          bottom: 12,
          right: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          zIndex: 2,
        }}
      >
        <button
          onClick={() => setZoom((z) => Math.min(3, z * 1.2))}
          style={{
            width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border-color)',
            background: 'var(--bg-card)', cursor: 'pointer', fontSize: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-primary)',
          }}
        >+</button>
        <button
          onClick={() => setZoom((z) => Math.max(0.2, z * 0.8))}
          style={{
            width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border-color)',
            background: 'var(--bg-card)', cursor: 'pointer', fontSize: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-primary)',
          }}
        >−</button>
        <button
          onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); setSelectedNode(null) }}
          title="重置视图"
          style={{
            width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border-color)',
            background: 'var(--bg-card)', cursor: 'pointer', fontSize: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-primary)',
          }}
        >⟲</button>
      </div>

      {/* 节点信息卡片（悬停时） */}
      {hoveredNode && !didDrag.current && (() => {
        const node = filteredNodes.find((n) => n.id === hoveredNode)
        if (!node) return null
        return (
          <div
            className="animate-fade-in"
            style={{
              position: 'absolute',
              top: 12,
              left: 12,
              padding: '10px 14px',
              backgroundColor: '#1a1a2e',
              color: '#fff',
              borderRadius: 8,
              fontSize: 12,
              maxWidth: 200,
              zIndex: 3,
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              pointerEvents: 'none',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{node.name}</div>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
              类型: {node.type}
            </div>
            {node.properties && Object.entries(node.properties).map(([k, v]) => (
              <div key={k} style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
                {k}: {v}
              </div>
            ))}
          </div>
        )
      })()}
    </div>
  )
}
