'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'

const DAYS   = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December']

/** Parse a user-typed string into a YYYY-MM-DD string, or return null. */
function parseTypedDate(str) {
  const s = str.trim()
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + 'T12:00:00')
    if (!isNaN(d)) return s
  }
  // M/D/YYYY or MM/DD/YYYY
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) {
    const iso = `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`
    const d = new Date(iso + 'T12:00:00')
    if (!isNaN(d)) return iso
  }
  // M-D-YYYY
  const m2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (m2) {
    const iso = `${m2[3]}-${m2[1].padStart(2,'0')}-${m2[2].padStart(2,'0')}`
    const d = new Date(iso + 'T12:00:00')
    if (!isNaN(d)) return iso
  }
  return null
}

export default function DatePicker({ value, onChange, min, placeholder = 'Select date' }) {
  const todayStr = new Date().toISOString().slice(0, 10)

  const [open,     setOpen]     = useState(false)
  const [closing,  setClosing]  = useState(false)
  const [view,     setView]     = useState(() => {
    const d = value ? new Date(value + 'T12:00:00') : new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0, width: 264 })
  const [inputVal, setInputVal] = useState('')
  const [inputErr, setInputErr] = useState(false)

  const ref      = useRef(null)   // trigger wrapper
  const trigRef  = useRef(null)   // trigger button (for getBoundingClientRect)
  const popupRef = useRef(null)   // portal div — needed for outside-click detection

  // Recalculate popover position on open and on scroll/resize
  useEffect(() => {
    if (!open || !trigRef.current) return
    function calcPos() {
      const rect      = trigRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const popH      = 360  // approximate calendar + input height
      const top       = spaceBelow >= popH ? rect.bottom + 6 : rect.top - popH - 6
      setPopupPos({ top, left: rect.left, width: Math.max(264, rect.width) })
    }
    calcPos()
    window.addEventListener('scroll', calcPos, true)
    window.addEventListener('resize', calcPos)
    return () => {
      window.removeEventListener('scroll', calcPos, true)
      window.removeEventListener('resize', calcPos)
    }
  }, [open])

  // Sync text input + calendar view when popover opens or value changes externally
  useEffect(() => {
    if (open) {
      setInputVal(value || '')
      setInputErr(false)
    }
  }, [open])

  useEffect(() => {
    if (value) {
      const d = new Date(value + 'T12:00:00')
      setView({ year: d.getFullYear(), month: d.getMonth() })
      if (open) setInputVal(value)
    }
  }, [value])

  // Close on outside click (must check BOTH the trigger wrapper AND the portal div)
  useEffect(() => {
    if (!open) return
    function onMouse(e) {
      const inTrigger = ref.current    && ref.current.contains(e.target)
      const inPopup   = popupRef.current && popupRef.current.contains(e.target)
      if (!inTrigger && !inPopup) closePopover()
    }
    function onKey(e) { if (e.key === 'Escape') closePopover() }
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
    setInputVal(str)
    setInputErr(false)
    closePopover()
  }

  function commitInput(raw) {
    const str = raw.trim()
    if (!str) { onChange(''); setInputErr(false); closePopover(); return }
    const parsed = parseTypedDate(str)
    if (parsed) {
      if (min && parsed < min) { setInputErr(true); return }
      onChange(parsed)
      const d = new Date(parsed + 'T12:00:00')
      setView({ year: d.getFullYear(), month: d.getMonth() })
      setInputErr(false)
      closePopover()
    } else {
      setInputErr(true)
    }
  }

  // Build cells: leading nulls then day numbers
  const firstDow    = new Date(view.year, view.month, 1).getDay()
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
      <button type="button" ref={trigRef}
              onClick={() => { if (open) closePopover(); else setOpen(true) }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                background: 'var(--input-bg)', border: '1.5px solid var(--border)', borderRadius: 10,
                padding: '10px 14px', color: value ? 'var(--text)' : 'var(--text-3)',
                fontFamily: 'inherit', fontSize: '0.875rem', cursor: 'pointer',
                transition: 'border-color .15s, box-shadow .15s',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--blue)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--blue-ring)' }}
              onBlur={e  => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = '' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Calendar size={14} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
          {displayStr}
        </span>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ flexShrink: 0, transition: 'transform .15s', transform: open ? 'rotate(180deg)' : 'none' }}>
          <path d="M1 1l4 4 4-4" stroke="var(--text-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Calendar popover — rendered in a portal so it escapes any overflow:hidden parent */}
      {open && typeof document !== 'undefined' && createPortal(
        <div ref={popupRef} data-datepicker-popup style={{
          position: 'fixed',
          top:   popupPos.top,
          left:  popupPos.left,
          width: popupPos.width,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 14, boxShadow: 'var(--shadow-modal)', zIndex: 9999,
          padding: '12px 12px 10px',
          animation: closing ? 'modal-out 0.16s ease forwards' : 'modal-in 0.2s cubic-bezier(0.22,1,0.36,1) both',
        }}>

          {/* Type-in date input */}
          <div style={{ marginBottom: 10 }}>
            <input
              type="text"
              value={inputVal}
              placeholder="MM/DD/YYYY or YYYY-MM-DD"
              onChange={e => { setInputVal(e.target.value); setInputErr(false) }}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); commitInput(inputVal) }
              }}
              onBlur={() => {
                // only commit if the new focus target is outside the popup
                // (use setTimeout so the blur fires before the next focus is known)
                setTimeout(() => {
                  if (popupRef.current && document.activeElement && popupRef.current.contains(document.activeElement)) return
                  commitInput(inputVal)
                }, 0)
              }}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'var(--input-bg)',
                border: `1.5px solid ${inputErr ? 'var(--red)' : 'var(--border)'}`,
                borderRadius: 8, padding: '7px 10px',
                fontFamily: 'inherit', fontSize: '0.8rem', color: 'var(--text)',
                outline: 'none',
              }}
              onFocus={e  => { if (!inputErr) e.currentTarget.style.borderColor = 'var(--blue)' }}
            />
            {inputErr && (
              <p style={{ margin: '4px 0 0', fontSize: '0.7rem', color: 'var(--red)' }}>
                Invalid date — try MM/DD/YYYY
              </p>
            )}
          </div>

          {/* Month navigation */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
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
                    onClick={() => { onChange(todayStr); setInputVal(todayStr); setInputErr(false); closePopover() }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 600, color: 'var(--blue)' }}>
              Today
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
