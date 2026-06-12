'use client'

/**
 * SettingsMenu — a single toolbar "Settings" button that pops up the
 * low-frequency app controls (appearance + tour) so they don't clutter the
 * sidebar:
 *   - Light / Dark mode
 *   - Accent color (6 palettes)
 *   - Show tour (re-run onboarding)
 *
 * Reuses AccentPicker's ACCENT_OPTIONS / applyAccent / getSavedAccent so the
 * accent logic stays in one place.
 */

import { useState, useEffect, useRef } from 'react'
import { Settings, Check, Compass, Sun, Moon, Monitor } from 'lucide-react'
import { ACCENT_OPTIONS, applyAccent, getSavedAccent } from './AccentPicker'

const ACCENT_STORAGE_KEY = 'lv-accent'

export default function SettingsMenu({ theme, onSetTheme, onShowTour, /** 'sidebar' (dark bg) | 'light' */ variant = 'sidebar' }) {
  const [open,   setOpen]   = useState(false)
  const [accent, setAccent] = useState('blue')
  const ref = useRef(null)
  const isDark = variant === 'sidebar'

  useEffect(() => { setAccent(getSavedAccent()) }, [])

  useEffect(() => {
    if (!open) return
    function onDown(e) { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function pickAccent(id) {
    applyAccent(id)
    try { localStorage.setItem(ACCENT_STORAGE_KEY, id) } catch {}
    setAccent(id)
  }

  const btnColor   = isDark ? 'rgba(147,197,253,.5)' : 'var(--text-3)'
  const hoverColor = isDark ? 'rgba(147,197,253,.9)' : 'var(--text)'

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        title="Settings"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%',
          padding: '7px 12px', borderRadius: 10,
          border: isDark ? '1px solid rgba(255,255,255,.08)' : '1px solid var(--border)',
          background: open ? (isDark ? 'rgba(255,255,255,.07)' : 'var(--surface2)') : 'transparent',
          color: open ? hoverColor : btnColor,
          fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', transition: 'all .13s',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = hoverColor }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.color = btnColor }}
      >
        <Settings size={13} /> Settings
      </button>

      {open && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, right: 0,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 14, boxShadow: 'var(--shadow-modal)',
          padding: '12px 13px 13px',
          animation: 'modal-in .16s cubic-bezier(.22,1,.36,1)',
          zIndex: 400, minWidth: 210,
          display: 'flex', flexDirection: 'column', gap: 13,
        }}>
          {/* Appearance — light / system / dark segmented control */}
          <div>
            <div style={sectionLabel}>Appearance</div>
            <div style={{ display: 'flex', gap: 4, padding: 3, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface2)' }}>
              {[
                { id: 'light',  icon: Sun,     label: 'Light mode'  },
                { id: 'system', icon: Monitor, label: 'System default' },
                { id: 'dark',   icon: Moon,    label: 'Dark mode'   },
              ].map(({ id, icon: Icon, label }) => {
                const active = theme === id
                return (
                  <button key={id} onClick={() => onSetTheme?.(id)} title={label}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: '7px 0', borderRadius: 7, border: 'none', cursor: 'pointer',
                      background: active ? 'var(--blue)' : 'transparent',
                      color: active ? '#fff' : 'var(--text-3)',
                      transition: 'background .12s, color .12s',
                    }}>
                    <Icon size={15} />
                  </button>
                )
              })}
            </div>
          </div>

          {/* Accent color */}
          <div>
            <div style={sectionLabel}>Accent color</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
              {ACCENT_OPTIONS.map(opt => {
                const active = accent === opt.id
                return (
                  <button key={opt.id} onClick={() => pickAccent(opt.id)} title={opt.label}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      aspectRatio: '1', borderRadius: '50%', border: 'none', cursor: 'pointer',
                      background: opt.color,
                      boxShadow: active ? `0 0 0 2px var(--surface), 0 0 0 4px ${opt.color}` : 'none',
                      transition: 'box-shadow .12s',
                    }}>
                    {active && <Check size={12} color="#fff" strokeWidth={3} />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Help */}
          <div>
            <div style={sectionLabel}>Help</div>
            <button
              onClick={() => { setOpen(false); onShowTour?.() }}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, width: '100%',
                padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface2)',
                color: 'var(--text-2)', fontFamily: 'inherit', fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer',
              }}>
              <Compass size={13} /> Show tour
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const sectionLabel = {
  fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em',
  color: 'var(--text-3)', marginBottom: 6,
}
