'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'

const DAYS   = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December']

export default function DatePicker({ value, onChange, min, placeholder = 'Select date' }) {
  const todayStr = new Date().toISOString().slice(0, 10)

  const [open, setOpen]   = useState(false)
  const [closing, setClosing] = useState(false)
  const [view,  setView]  = useState(() => {
    const d = value ? new Date(value + 'T12:00:00') : new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const ref = useRef(null)

  // Sync view month when value changes externally
  useEffect(() => {
    if (value) {
      const d = new Date(value + 'T12:00:00')
      setView({ year: d.getFullYear(), month: d.getMonth() })
    }
  }, [value])

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return
    function onMouse(e) { if (ref.current && !ref.current.contains(e.target)) closePopover() }
    function onKey(e)   { if (e.key === 'Escape') closePopover() }
    document.addEventListener('mousedown', onMouse)
    document.addEventListener('keydown',   onKey)
    return () => {
      document.removeEventListener('mousedown', onMouse)
      document.removeEventListener('keydown',   onKey)
    }
  }, [open])

  function closePopover() {
    setClosing(true)
    setTimeout(() => { setOpen(false); setClosing(false) }, 160)
  }

  function prevMonth() {
    setView(v => v.month === 0 ? { year: v.year - 1, month: 11 } : { ...v, month: v.month - 1 })
  }
  function nextMonth() {
    setView(v => v.month === 11 ? { year: v.year + 1, month: 0 } : { ...v, month: v.month + 1 })
  }

  function selectDay(day) {
    const str = `${view.year}-${String(view.month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    onChange(str)
    closePopover()
  }

  // Build cells: leading nulls then day numbers
  const firstDow   = new Date(view.year, view.month, 1).getDay()
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate()
  const cells = Array.from({ length: firstDow + daysInMonth }, (_, i) =>
    i < firstDow ? null : i - firstDow + 1
  )

  const displayStr = value
    ? new Date(value + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    : placeholder

  return (
    <div ref={ref} style={{ position: 'relative' }}>

      {/* Trigger button */}
      <button type="button"
              onClick={() => { if (open) closePopover(); else setOpen(true) }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                background: 'var(--input-bg)', border: '1.5px solid var(--border)', borderRadius: 10,
                padding: '10px 14px', color: value ? 'var(--text)' : 'var(--text-3)',
                fontFamily: 'inherit', fontSize: '0.875rem', cursor: 'pointer',
                transition: 'border-color .15s, box-shadow .15s',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--blue)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--blue-ring)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = '' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Calendar size={14} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
          {displayStr}
        </span>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ flexShrink: 0, transition: 'transform .15s', transform: open ? 'rotate(180deg)' : 'none' }}>
          <path d="M1 1l4 4 4-4" stroke="var(--text-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Calendar popover */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 14, boxShadow: 'var(--shadow-modal)', zIndex: 200,
          padding: '14px 12px', width: 264,
          animation: closing ? 'modal-out 0.16s ease forwards' : 'modal-in 0.2s cubic-bezier(0.22,1,0.36,1) both',
        }}>

          {/* Month navigation */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <button type="button" onClick={prevMonth}
                    style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <ChevronLeft size={14} />
            </button>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text)' }}>
              {MONTHS[view.month]} {view.year}
            </span>
            <button type="button" onClick={nextMonth}
                    style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Day-of-week headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
            {DAYS.map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: '0.64rem', fontWeight: 700, color: 'var(--text-3)', padding: '2px 0' }}>
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {cells.map((day, i) => {
              if (!day) return <div key={`e${i}`} />
              const cellStr  = `${view.year}-${String(view.month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
              const isSel    = cellStr === value
              const isToday  = cellStr === todayStr
              const disabled = min && cellStr < min
              return (
                <button key={cellStr} type="button"
                        disabled={disabled}
                        onClick={() => !disabled && selectDay(day)}
                        style={{
                          width: '100%', aspectRatio: '1', borderRadius: 8, border: 'none',
                          cursor: disabled ? 'default' : 'pointer',
                          fontSize: '0.78rem', fontWeight: isSel || isToday ? 700 : 400,
                          background: isSel ? 'var(--blue)' : 'transparent',
                          color: disabled ? 'var(--text-3)' : isSel ? '#fff' : isToday ? 'var(--blue)' : 'var(--text)',
                          opacity: disabled ? 0.35 : 1,
                          outline: isToday && !isSel ? '1.5px solid var(--blue)' : 'none',
                          outlineOffset: '-1px',
                          transition: 'background .1s',
                        }}
                        onMouseEnter={e => { if (!isSel && !disabled) e.currentTarget.style.background = 'var(--surface2)' }}
                        onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = isSel ? 'var(--blue)' : 'transparent' }}>
                  {day}
                </button>
              )
            })}
          </div>

          {/* "Today" shortcut */}
          <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 8, textAlign: 'center' }}>
            <button type="button"
                    onClick={() => { onChange(todayStr); closePopover() }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 600, color: 'var(--blue)' }}>
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
