'use client'

/**
 * AccentPicker — palette popover for picking the app's accent color.
 *
 * Applies the chosen accent via a `data-accent` attribute on <html>.
 * Persists to localStorage under `lv-accent`.
 * A script in layout.js reads this before paint to avoid flash of the wrong color.
 *
 * Usage: drop anywhere in the sidebar / settings area.
 * Exports `applyAccent(id)` so layout.js can call it on the client.
 */

import { useState, useEffect, useRef } from 'react'
import { Palette } from 'lucide-react'

export const ACCENT_OPTIONS = [
  { id: 'blue',     label: 'Luminae Blue', color: '#3a6fa8' },
  { id: 'violet',   label: 'Violet',       color: '#7c3aed' },
  { id: 'emerald',  label: 'Emerald',      color: '#059669' },
  { id: 'rose',     label: 'Rose',         color: '#e11d48' },
  { id: 'amber',    label: 'Amber',        color: '#d97706' },
  { id: 'slate',    label: 'Slate',        color: '#475569' },
]

const STORAGE_KEY = 'lv-accent'
const DEFAULT_ACCENT = 'blue'

/** Apply an accent id to the document. Safe to call before React hydrates. */
export function applyAccent(id) {
  const safe = ACCENT_OPTIONS.some(o => o.id === id) ? id : DEFAULT_ACCENT
  if (safe === DEFAULT_ACCENT) {
    document.documentElement.removeAttribute('data-accent')
  } else {
    document.documentElement.setAttribute('data-accent', safe)
  }
}

/** Read the saved accent from localStorage (used in inline script). */
export function getSavedAccent() {
  try { return localStorage.getItem(STORAGE_KEY) || DEFAULT_ACCENT } catch { return DEFAULT_ACCENT }
}

export default function AccentPicker({ /** 'sidebar' (dark bg) | 'light' (light bg) */ variant = 'sidebar' }) {
  const [current, setCurrent] = useState(DEFAULT_ACCENT)
  const [open,    setOpen]    = useState(false)
  const ref = useRef(null)

  // Sync current value from DOM on mount
  useEffect(() => {
    const saved = getSavedAccent()
    setCurrent(saved)
  }, [])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function onDown(e) { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function pick(id) {
    applyAccent(id)
    try { localStorage.setItem(STORAGE_KEY, id) } catch {}
    setCurrent(id)
    setOpen(false)
  }

  const currentOption = ACCENT_OPTIONS.find(o => o.id === current) ?? ACCENT_OPTIONS[0]
  const isDark = variant === 'sidebar'

  const btnColor   = isDark ? 'rgba(147,197,253,.5)' : 'var(--text-3)'
  const hoverColor = isDark ? 'rgba(147,197,253,.9)' : 'var(--text)'

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        title="Accent color"
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          width: '100%', padding: isDark ? '7px 12px' : '8px 12px',
          borderRadius: 10,
          border: isDark ? '1px solid rgba(255,255,255,.08)' : '1px solid var(--border)',
          background: open
            ? (isDark ? 'rgba(255,255,255,.07)' : 'var(--surface2)')
            : 'transparent',
          color: open ? hoverColor : btnColor,
          fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
          transition: 'all .13s',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = hoverColor }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.color = btnColor }}
      >
        {/* Live swatch */}
        <span style={{
          width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
          background: currentOption.color,
          boxShadow: `0 0 0 2px ${isDark ? 'rgba(255,255,255,.15)' : 'var(--border)'}`,
        }} />
        <Palette size={12} />
        <span>Accent color</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          bottom: 'calc(100% + 6px)', left: 0, right: 0,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 14, boxShadow: 'var(--shadow-modal)',
          padding: '10px 12px 12px',
          animation: 'modal-in .16s cubic-bezier(.22,1,.36,1)',
          zIndex: 400,
          minWidth: 180,
        }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 8 }}>
            Accent color
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {ACCENT_OPTIONS.map(opt => {
              const isActive = current === opt.id
              return (
                <button key={opt.id} onClick={() => pick(opt.id)} title={opt.label}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                    padding: '7px 4px', borderRadius: 9, border: 'none', cursor: 'pointer',
                    background: isActive ? 'var(--surface2)' : 'transparent',
                    outline: isActive ? `2px solid ${opt.color}` : '2px solid transparent',
                    transition: 'background .12s, outline .12s',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--surface2)' }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                >
                  <span style={{
                    width: 22, height: 22, borderRadius: '50%', background: opt.color,
                    boxShadow: isActive ? `0 0 0 3px ${opt.color}33` : 'none',
                    transition: 'box-shadow .12s',
                  }} />
                  <span style={{ fontSize: '0.58rem', fontWeight: 700, color: isActive ? 'var(--text)' : 'var(--text-3)', lineHeight: 1, textAlign: 'center', whiteSpace: 'nowrap' }}>
                    {opt.label.split(' ')[0]}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
