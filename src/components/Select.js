'use client'

import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'

/**
 * Branded dropdown.
 *
 * The menu is rendered in a PORTAL with fixed positioning so it is never clipped by
 * a scrollable/overflow:hidden ancestor (e.g. the Focus Timer panel) and always sits
 * above other layers. It flips upward when there isn't room below.
 *
 * options: array of { value, label } — or { header: true, label } for a non-selectable
 * group header row.
 */
export default function Select({ value, onChange, options, placeholder = 'Select…' }) {
  const [open,       setOpen]       = useState(false)
  const [hoveredVal, setHoveredVal] = useState(null)
  const [pos,        setPos]        = useState(null) // { left, top, width, openUp }
  const triggerRef = useRef(null)
  const menuRef    = useRef(null)

  function computePos() {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const spaceBelow = window.innerHeight - r.bottom
    const spaceAbove = r.top
    const desired    = Math.min(264, options.length * 40 + 8)
    const openUp     = spaceBelow < desired && spaceAbove > spaceBelow
    const maxH       = Math.max(140, Math.min(264, (openUp ? spaceAbove : spaceBelow) - 14))
    setPos({ left: r.left, top: r.top, bottom: r.bottom, width: r.width, openUp, maxH })
  }

  useLayoutEffect(() => { if (open) computePos() }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return
    const reposition = () => computePos()
    function handler(e) {
      if (triggerRef.current?.contains(e.target)) return
      if (menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    function onKey(e) { if (e.key === 'Escape') setOpen(false) }
    // capture scrolls from any ancestor so the menu tracks the trigger
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', onKey)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const selected = options.find(o => !o.header && String(o.value) === String(value))

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          background: 'var(--input-bg)',
          borderWidth: '1.5px', borderStyle: 'solid',
          borderColor: open ? 'var(--blue)' : 'var(--border)',
          borderRadius: 10,
          padding: '10px 14px', color: selected ? 'var(--text)' : 'var(--text-3)',
          fontFamily: 'inherit', fontSize: '0.875rem', cursor: 'pointer',
          boxShadow: open ? '0 0 0 3px var(--blue-ring)' : 'none',
          transition: 'border-color .15s, box-shadow .15s',
        }}
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

      {/* Dropdown — portaled to body so no overflow ancestor can clip it */}
      {open && pos && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed', left: pos.left, width: pos.width, zIndex: 6000,
            ...(pos.openUp
              ? { bottom: window.innerHeight - pos.top + 5 }
              : { top: pos.bottom + 5 }),
            maxHeight: pos.maxH, overflowY: 'auto',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, boxShadow: 'var(--shadow-modal)',
            animation: 'modal-in 0.16s cubic-bezier(0.16,1,0.3,1) both',
          }}>
          {options.map(opt => {
            if (opt.header) {
              return (
                <div key={opt.value ?? opt.label}
                  style={{ padding: '8px 14px 4px', fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)' }}>
                  {opt.label}
                </div>
              )
            }
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
                  <svg width="13" height="10" viewBox="0 0 13 10" fill="none" style={{ flexShrink: 0, marginLeft: 8 }}>
                    <path d="M1.5 5L5 8.5 11.5 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>
            )
          })}
        </div>,
        document.body,
      )}
    </div>
  )
}
