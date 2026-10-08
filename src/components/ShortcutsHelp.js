'use client'

import { useEffect } from 'react'
import { X, Keyboard } from 'lucide-react'
import Dialog, { useDialogExit } from '@/components/Dialog'

const SHORTCUTS = [
  { key: '/  or  ?', description: 'Show this shortcuts overlay' },
  { key: 'N',      description: 'New event (full form)' },
  { key: 'T',      description: 'New task (full form)' },
  { key: 'W',      description: 'New note (write)' },
  { key: 'Ctrl+K', description: 'Open search' },
  { key: 'F',      description: 'Toggle focus timer' },
  { key: '← →',    description: 'Previous / next day, week, or month' },
  { key: 'Esc',    description: 'Close any open overlay' },
]

export default function ShortcutsHelp({ onClose }) {
  const [closing, handleClose] = useDialogExit(onClose)

  useEffect(() => {
    function onKey(e) {
      // Pressing the opening key again closes it, so / is a toggle. Escape is the
      // dialog's own; this is only the two opening keys.
      if (e.key === '?' || e.key === '/') { e.preventDefault(); handleClose() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [handleClose])

  return (
    <Dialog label="Keyboard shortcuts" closing={closing} onClose={handleClose}
            className="overflow-hidden" maxWidth={420}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Keyboard size={16} style={{ color: 'var(--blue)' }} />
            <h2>Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={handleClose}
            aria-label="Close"
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
    </Dialog>
  )
}
