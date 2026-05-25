'use client'

import { useState, useRef, useEffect } from 'react'

export default function Select({ value, onChange, options, placeholder = 'Select…' }) {
  const [open,       setOpen]       = useState(false)
  const [hoveredVal, setHoveredVal] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    function onKey(e) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const selected = options.find(o => String(o.value) === String(value))

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          background: 'var(--input-bg)', border: '1.5px solid var(--border)', borderRadius: 10,
          padding: '10px 14px', color: selected ? 'var(--text)' : 'var(--text-3)',
          fontFamily: 'inherit', fontSize: '0.875rem', cursor: 'pointer',
          transition: 'border-color .15s, box-shadow .15s',
          ...(open ? { borderColor: 'var(--blue)', boxShadow: '0 0 0 3px var(--blue-ring)' } : {}),
        }}
        onFocus={e => { e.currentTarget.style.borderColor = 'var(--blue)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--blue-ring)' }}
        onBlur={e => { if (!open) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' } }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected?.label || placeholder}
        </span>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{
          flexShrink: 0, color: 'var(--text-3)',
          transition: 'transform .18s', transform: open ? 'rotate(180deg)' : 'none',
        }}>
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 5px)', left: 0, right: 0, zIndex: 200,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 12, boxShadow: 'var(--shadow-modal)', overflow: 'hidden',
          animation: 'modal-in 0.16s cubic-bezier(0.16,1,0.3,1) both',
          maxHeight: 260, overflowY: 'auto',
        }}>
          {options.map(opt => {
            const isSelected = String(opt.value) === String(value)
            const isHovered  = hoveredVal === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onMouseEnter={() => setHoveredVal(opt.value)}
                onMouseLeave={() => setHoveredVal(null)}
                onClick={() => { onChange(opt.value); setOpen(false) }}
                style={{
                  width: '100%', padding: '10px 14px', textAlign: 'left', border: 'none',
                  background: isSelected ? 'var(--blue-bg)' : isHovered ? 'var(--surface2)' : 'transparent',
                  color: isSelected ? 'var(--blue-text)' : 'var(--text)',
                  cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.875rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  transition: 'background .1s',
                }}
              >
                {opt.label}
                {isSelected && (
                  <svg width="13" height="10" viewBox="0 0 13 10" fill="none">
                    <path d="M1.5 5L5 8.5 11.5 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
