'use client'

import { AlertTriangle, RefreshCw } from 'lucide-react'

export default function Error({ reset }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100dvh', padding: 24, background: 'var(--bg)',
    }}>
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '48px 32px', borderRadius: 20, background: 'var(--surface)',
        border: '1px solid var(--border)', gap: 18, textAlign: 'center',
        maxWidth: 380, width: '100%', boxShadow: 'var(--shadow-modal)',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: 'rgba(239,68,68,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <AlertTriangle size={26} style={{ color: '#ef4444' }} />
        </div>
        <div>
          <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>
            Something went wrong
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-2)', lineHeight: 1.6 }}>
            An unexpected error occurred. Your saved data is safe — try reloading.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => reset()}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '10px 22px', borderRadius: 999,
              background: 'var(--blue)', color: '#fff',
              border: 'none', cursor: 'pointer',
              fontSize: '0.85rem', fontWeight: 700, fontFamily: 'inherit',
            }}
          >
            <RefreshCw size={14} />
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '10px 22px', borderRadius: 999,
              background: 'var(--surface2)', color: 'var(--text)',
              border: '1px solid var(--border)', cursor: 'pointer',
              fontSize: '0.85rem', fontWeight: 700, fontFamily: 'inherit',
            }}
          >
            Full reload
          </button>
        </div>
      </div>
    </div>
  )
}
