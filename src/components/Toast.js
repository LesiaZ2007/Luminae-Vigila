'use client'

import { Bell, X } from 'lucide-react'

const COLOR_PRESETS = [
  '#3b82f6','#2563eb','#0ea5e9','#06b6d4',
  '#10b981','#059669','#f59e0b','#ef4444',
  '#8b5cf6','#ec4899','#64748b','#475569',
]

export default function Toast({ toasts, onDismiss }) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none" style={{ width: 'min(360px, calc(100vw - 32px))' }}>
      {toasts.map(toast => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-start gap-3 px-4 py-3"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            boxShadow: 'var(--shadow-modal)',
            color: 'var(--text)',
            width: '100%',
            animation: 'slideIn 0.2s ease',
          }}
        >
          <div className="mt-0.5 w-7 h-7 rounded-xl flex items-center justify-center shrink-0"
               style={{ background: 'var(--blue-bg)' }}>
            <Bell size={14} style={{ color: 'var(--blue)' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-tight" style={{ color: 'var(--text)', margin: 0 }}>{toast.title}</p>
            {toast.subtitle && (
              <p className="text-xs mt-1" style={{ color: 'var(--text-2)', marginBottom: 0, whiteSpace: 'pre-line' }}>{toast.subtitle}</p>
            )}
            {toast.actions && (
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                {toast.actions.map((action, index) => (
                  action.type === 'color' ? (
                    <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-2)' }}>{action.label}</span>
                      {COLOR_PRESETS.map(color => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => action.onChange?.(color)}
                          title={color}
                          style={{
                            width: 17,
                            height: 17,
                            borderRadius: '50%',
                            background: color,
                            border: action.value?.toLowerCase() === color.toLowerCase() ? '2.5px solid var(--text)' : '2px solid transparent',
                            cursor: 'pointer',
                            padding: 0,
                            transition: 'transform .1s',
                          }}
                          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.18)'}
                          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                        />
                      ))}
                    </div>
                  ) : (
                    <button
                      key={index}
                      type="button"
                      onClick={() => {
                        action.onClick?.()
                        if (action.dismiss !== false) onDismiss(toast.id)
                      }}
                      style={{
                        border: '1px solid var(--border)',
                        background: action.variant === 'danger' ? 'rgba(239,68,68,.09)' : 'var(--surface2)',
                        color: action.variant === 'danger' ? 'var(--red)' : 'var(--text-2)',
                        borderRadius: 8,
                        padding: '6px 10px',
                        fontSize: '0.73rem',
                        fontWeight: 700,
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                      }}
                    >
                      {action.label}
                    </button>
                  )
                ))}
              </div>
            )}
          </div>
          <button onClick={() => onDismiss(toast.id)}
                  className="mt-0.5 shrink-0 transition-colors"
                  style={{ color: 'var(--text-3)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 2 }}>
            <X size={13} />
          </button>
        </div>
      ))}
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </div>
  )
}
