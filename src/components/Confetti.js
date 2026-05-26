'use client'

export const CONFETTI_COLORS = {
  high:   ['#ef4444','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ec4899','#f97316'],
  medium: ['#f59e0b','#3b82f6','#10b981','#8b5cf6','#06b6d4'],
  low:    ['#94a3b8','#3b82f6','#10b981'],
}

export default function Confetti({ priority, x = 200, y = 300 }) {
  const colors = CONFETTI_COLORS[priority] || CONFETTI_COLORS.low
  const count  = priority === 'high' ? 70 : priority === 'medium' ? 40 : 22

  const particles = Array.from({ length: count }, (_, i) => {
    const angle = (Math.random() * 2 - 1) * Math.PI * 0.8 - Math.PI / 2
    const speed = 80 + Math.random() * 160
    return {
      id:    i,
      color: colors[i % colors.length],
      size:  5 + Math.random() * 7,
      dx:    Math.cos(angle) * speed,
      dy:    Math.sin(angle) * speed,
      rot:   Math.random() * 720 - 360,
      dur:   0.9 + Math.random() * 0.7,
      delay: Math.random() * 0.25,
      shape: Math.random() > 0.45 ? 'circle' : 'rect',
    }
  })

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999, overflow: 'hidden' }}>
      {particles.map(p => (
        <div key={p.id} style={{
          position: 'fixed',
          left: `${x}px`,
          top:  `${y}px`,
          width:  p.shape === 'circle' ? p.size : p.size * 0.65,
          height: p.shape === 'circle' ? p.size : p.size * 1.4,
          borderRadius: p.shape === 'circle' ? '50%' : 2,
          background: p.color,
          animation: `lv-confetti ${p.dur}s cubic-bezier(.25,.46,.45,.94) ${p.delay}s forwards`,
          '--cdx':  `${p.dx}px`,
          '--cdy':  `${p.dy}px`,
          '--crot': `${p.rot}deg`,
        }} />
      ))}
    </div>
  )
}
