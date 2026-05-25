'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

function pad(n) { return String(n).padStart(2, '0') }

const CX = 110, CY = 110, R = 78

function polarPos(idx, total, radius) {
  const angle = (idx / total) * 2 * Math.PI - Math.PI / 2
  return { x: CX + radius * Math.cos(angle), y: CY + radius * Math.sin(angle) }
}

// Convert SVG coords to a clock value (snaps to nearest position in `items`)
function coordsToValue(x, y, items) {
  const dx = x - CX, dy = y - CY
  let angle = Math.atan2(dy, dx) + Math.PI / 2
  if (angle < 0) angle += 2 * Math.PI
  const frac = angle / (2 * Math.PI)         // 0 … 1
  const idx  = Math.round(frac * 12) % 12    // 0 … 11
  return items[idx]
}

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const MINS  = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]

export default function TimePicker({ value, onChange }) {
  const [h24, rawMin] = (value || '09:00').split(':').map(Number)
  const initPeriod = h24 >= 12 ? 'PM' : 'AM'
  const initHour   = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24
  const initMin    = rawMin || 0

  const [open,       setOpen]       = useState(false)
  const [mode,       setMode]       = useState('hour')
  const [hour,       setHour]       = useState(initHour)
  const [minute,     setMinute]     = useState(initMin)
  const [period,     setPeriod]     = useState(initPeriod)
  const [hoveredIdx, setHoveredIdx] = useState(-1)
  const [isDragging, setIsDragging] = useState(false)
  // Inline edit state
  const [editH,  setEditH]  = useState(false)
  const [editM,  setEditM]  = useState(false)
  const [typedH, setTypedH] = useState('')
  const [typedM, setTypedM] = useState('')

  const wrapRef  = useRef(null)
  const svgRef   = useRef(null)
  const timerRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function onDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  function emit24(h, m, p) {
    let out = h % 12
    if (p === 'PM') out += 12
    onChange(`${pad(out)}:${pad(m)}`)
  }

  function pickHour(h) {
    setHour(h); emit24(h, minute, period)
    setHoveredIdx(-1)
    if (!isDragging) {
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setMode('minute'), 200)
    }
  }

  function pickMinute(m) {
    setMinute(m); emit24(hour, m, period)
    setHoveredIdx(-1)
  }

  function togglePeriod(p) { setPeriod(p); emit24(hour, minute, p) }

  function commitHour() {
    const n = parseInt(typedH, 10)
    if (!isNaN(n) && n >= 1 && n <= 12) { setHour(n); emit24(n, minute, period) }
    setEditH(false); setTypedH(''); setMode('minute')
  }
  function commitMinute(andClose = false) {
    const n = parseInt(typedM, 10)
    if (!isNaN(n) && n >= 0 && n <= 59) { setMinute(n); emit24(hour, n, period) }
    setEditM(false); setTypedM('')
    if (andClose) setOpen(false)
  }

  // ── Drag support ──────────────────────────────────────────────────────────
  function getSVGCoords(clientX, clientY) {
    const svg = svgRef.current
    if (!svg) return null
    const rect   = svg.getBoundingClientRect()
    const scaleX = 220 / rect.width
    const scaleY = 220 / rect.height
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY }
  }

  function applyDragCoords(clientX, clientY) {
    const pos = getSVGCoords(clientX, clientY)
    if (!pos) return
    const items = mode === 'hour' ? HOURS : MINS
    const val   = coordsToValue(pos.x, pos.y, items)
    if (mode === 'hour') { setHour(val); emit24(val, minute, period) }
    else                  { setMinute(val); emit24(hour, val, period) }
  }

  const onMouseMove = useCallback((e) => {
    if (!isDragging) return
    applyDragCoords(e.clientX, e.clientY)
  }, [isDragging, mode, hour, minute, period])

  const onMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false)
      // After dragging hours, auto-advance to minutes
      if (mode === 'hour') {
        clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => setMode('minute'), 200)
      }
    }
  }, [isDragging, mode])

  useEffect(() => {
    if (!isDragging) return
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [isDragging, onMouseMove, onMouseUp])

  const items      = mode === 'hour' ? HOURS : MINS
  const selectedVal = mode === 'hour' ? hour : Math.round(minute / 5) * 5
  const selectedIdx = mode === 'hour' ? HOURS.indexOf(hour) : MINS.indexOf(selectedVal)
  // For non-snapped minute values (typed exact), interpolate hand position
  const handEnd = (() => {
    if (mode === 'minute' && selectedIdx < 0) {
      // exact minute — compute angle directly
      const angle = (minute / 60) * 2 * Math.PI - Math.PI / 2
      return { x: CX + (R - 10) * Math.cos(angle), y: CY + (R - 10) * Math.sin(angle) }
    }
    return selectedIdx >= 0 ? polarPos(selectedIdx, 12, R - 10) : null
  })()

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>

      {/* Trigger button */}
      <button type="button"
              onClick={() => { setOpen(v => !v); setMode('hour') }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                background: 'var(--input-bg)', border: '1.5px solid var(--border)',
                borderRadius: 10, padding: '9px 14px', color: 'var(--text)',
                fontFamily: 'inherit', fontSize: '0.875rem', fontWeight: 600,
                cursor: 'pointer', textAlign: 'left',
                transition: 'border-color .15s, box-shadow .15s',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--blue)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--blue-ring)' }}
              onBlur={e =>  { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: 'var(--text-3)', flexShrink: 0 }}>
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
        <span style={{ flex: 1 }}>{hour}:{pad(minute)} {period}</span>
      </button>

      {/* Clock popover */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)',
          zIndex: 200, background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 20, boxShadow: 'var(--shadow-modal)', padding: '16px 16px 14px',
          width: 252, userSelect: 'none',
        }}>

          {/* Digital time + AM/PM */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 14 }}>

            {/* Hour — click to type */}
            {editH ? (
              <input autoFocus type="text" inputMode="numeric" maxLength={2}
                     value={typedH} onChange={e => setTypedH(e.target.value.replace(/\D/,'').slice(0,2))}
                     onBlur={commitHour}
                     onKeyDown={e => { if (e.key === 'Enter') commitHour(); if (e.key === 'Escape') { setEditH(false); setTypedH('') } }}
                     style={{
                       padding: '6px 10px', borderRadius: 10, border: '2px solid var(--blue)',
                       fontFamily: 'inherit', fontSize: '1.9rem', fontWeight: 800, lineHeight: 1,
                       background: 'var(--blue)', color: '#fff', width: 62, textAlign: 'center', outline: 'none',
                     }} />
            ) : (
              <button type="button"
                      onClick={() => { setMode('hour'); setEditH(true); setTypedH(String(hour)) }}
                      title="Click to type exact hour"
                      style={{
                        padding: '6px 10px', borderRadius: 10, border: 'none', cursor: 'pointer',
                        fontFamily: 'inherit', fontSize: '1.9rem', fontWeight: 800, lineHeight: 1,
                        background: mode === 'hour' ? 'var(--blue)' : 'var(--surface2)',
                        color:      mode === 'hour' ? '#fff'        : 'var(--text-3)',
                        transition: 'all .15s', minWidth: 56, textAlign: 'center',
                      }}>
                {pad(hour)}
              </button>
            )}

            <span style={{ fontSize: '1.9rem', fontWeight: 800, color: 'var(--text-3)', lineHeight: 1 }}>:</span>

            {/* Minute — click to type */}
            {editM ? (
              <input autoFocus type="text" inputMode="numeric" maxLength={2}
                     value={typedM} onChange={e => setTypedM(e.target.value.replace(/\D/,'').slice(0,2))}
                     onBlur={() => commitMinute(false)}
                     onKeyDown={e => { if (e.key === 'Enter') commitMinute(true); if (e.key === 'Escape') { setEditM(false); setTypedM('') } }}
                     style={{
                       padding: '6px 10px', borderRadius: 10, border: '2px solid var(--blue)',
                       fontFamily: 'inherit', fontSize: '1.9rem', fontWeight: 800, lineHeight: 1,
                       background: 'var(--blue)', color: '#fff', width: 62, textAlign: 'center', outline: 'none',
                     }} />
            ) : (
              <button type="button"
                      onClick={() => { setMode('minute'); setEditM(true); setTypedM(String(minute)) }}
                      title="Click to type exact minutes"
                      style={{
                        padding: '6px 10px', borderRadius: 10, border: 'none', cursor: 'pointer',
                        fontFamily: 'inherit', fontSize: '1.9rem', fontWeight: 800, lineHeight: 1,
                        background: mode === 'minute' ? 'var(--blue)' : 'var(--surface2)',
                        color:      mode === 'minute' ? '#fff'        : 'var(--text-3)',
                        transition: 'all .15s', minWidth: 56, textAlign: 'center',
                      }}>
                {pad(minute)}
              </button>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginLeft: 8 }}>
              {['AM', 'PM'].map(p => (
                <button key={p} type="button" onClick={() => togglePeriod(p)}
                        style={{
                          padding: '5px 9px', borderRadius: 7, border: 'none', cursor: 'pointer',
                          fontFamily: 'inherit', fontSize: '0.7rem', fontWeight: 700,
                          background: period === p ? 'var(--blue)'    : 'var(--surface2)',
                          color:      period === p ? '#fff'            : 'var(--text-3)',
                          transition: 'all .15s',
                        }}>{p}</button>
              ))}
            </div>
          </div>

          {/* Clock face SVG — drag or click */}
          <svg ref={svgRef} width="220" height="220" viewBox="0 0 220 220"
               style={{ display: 'block', margin: '0 auto', cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
               onMouseDown={e => {
                 e.preventDefault()
                 setIsDragging(true)
                 applyDragCoords(e.clientX, e.clientY)
               }}>

            {/* Background disc */}
            <circle cx={CX} cy={CY} r={R + 10} fill="var(--surface2)" />

            {/* Clock hand */}
            {handEnd && (
              <>
                <line x1={CX} y1={CY} x2={handEnd.x} y2={handEnd.y}
                      stroke="var(--blue)" strokeWidth="2" strokeLinecap="round" />
                <circle cx={CX} cy={CY} r="4" fill="var(--blue)" />
                <circle cx={handEnd.x} cy={handEnd.y} r="17"
                        fill="var(--blue)" opacity="0.18" />
              </>
            )}

            {/* Number items */}
            {items.map((val, i) => {
              const pos   = polarPos(i, 12, R)
              const isSel = val === selectedVal
              const isHov = hoveredIdx === i && !isSel
              return (
                <g key={val}
                   style={{ cursor: 'pointer' }}
                   onMouseEnter={() => setHoveredIdx(i)}
                   onMouseLeave={() => setHoveredIdx(-1)}
                   onClick={() => mode === 'hour' ? pickHour(val) : pickMinute(val)}>
                  <circle cx={pos.x} cy={pos.y} r="17"
                          fill={isSel ? 'var(--blue)' : isHov ? 'var(--border)' : 'transparent'} />
                  <text x={pos.x} y={pos.y}
                        textAnchor="middle" dominantBaseline="central"
                        fill={isSel ? '#fff' : 'var(--text-2)'}
                        fontSize="12.5"
                        fontWeight={isSel ? '700' : '500'}
                        fontFamily="inherit"
                        style={{ pointerEvents: 'none' }}>
                    {mode === 'minute' ? pad(val) : val}
                  </text>
                </g>
              )
            })}
          </svg>

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
            <span style={{ fontSize: '0.67rem', color: 'var(--text-3)', fontWeight: 500 }}>
              {mode === 'hour' ? 'Drag or tap · click digits to type' : 'Drag or tap · click digits to type'}
            </span>
            <button type="button" onClick={() => setOpen(false)}
                    style={{
                      padding: '6px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
                      background: 'var(--blue)', color: '#fff',
                      fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 700,
                    }}>OK</button>
          </div>
        </div>
      )}
    </div>
  )
}
