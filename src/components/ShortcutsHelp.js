'use client'

import { useEffect, useState } from 'react'
import { X, Keyboard } from 'lucide-react'

const SHORTCUTS = [
  { key: 'N',   description: 'New event' },
  { key: 'T',   description: 'New task' },
  { key: '/',   description: 'Open search' },
  { key: 'F',   description: 'Toggle focus timer' },
  { key: '?',   description: 'Show this help overlay' },
  { key: 'Esc', description: 'Close any open overlay' },
  { key: 'Ctrl+K', description: 'Open search (alternative)' },
]

export default function ShortcutsHelp({ onClose }) {
  const [closing, setClosing] = useState(false)

  function handleClose() {
    setClosing(true)
    setTimeout(onClose, 180)
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' || e.key === '?') handleClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center z-50 p-4 modal-backdrop${closing ? ' modal-closing' : ''}`}
      style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(6px)' }}
      onClick={handleClose}
    >
      <div
        className={`modal-surface w-full overflow-hidden${closing ? ' modal-closing' : ''}`}
        style={{ maxWidth: 420 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Keyboard size={16} style={{ color: 'var(--blue)' }} />
            <h2>Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={handleClose}
            style={{ padding: '6px', borderRadius: '8px', border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 24px 24px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <p style={{ fontSize: '0.76rem', color: 'var(--text-3)', marginBottom: 8 }}>
            Shortcuts are disabled while typing in text fields.
          </p>
          {SHORTCUTS.map(({ key, description }) => (
            <div
              key={key}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '9px 12px',
                borderRadius: 10,
                background: 'var(--surface2)',
              }}
            >
              <span style={{ fontSize: '0.84rem', color: 'var(--text-2)', fontWeight: 500 }}>
                {description}
              </span>
              <kbd
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 32,
                  padding: '3px 8px',
                  borderRadius: 7,
                  background: 'var(--surface)',
                  border: '1.5px solid var(--border)',
                  boxShadow: '0 1px 0 var(--border)',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  fontFamily: 'inherit',
                  color: 'var(--text)',
                  letterSpacing: '0.02em',
                  whiteSpace: 'nowrap',
                }}
              >
                {key}
              </kbd>
            </div>
          ))}

          <div style={{ marginTop: 8, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-3)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              luminae<span style={{ color: 'var(--blue)', marginLeft: 3 }}>Vigila</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
