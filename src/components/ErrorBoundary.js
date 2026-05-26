'use client'

import React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

function ErrorCard({ onReload }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '40px 24px', borderRadius: 18, background: 'var(--surface)',
      border: '1px solid var(--border)', gap: 16, textAlign: 'center',
      minHeight: 200,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: '50%',
        background: 'rgba(239,68,68,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <AlertTriangle size={22} style={{ color: 'var(--red)' }} />
      </div>
      <div>
        <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
          Something went wrong
        </div>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-2)', maxWidth: 260, lineHeight: 1.55 }}>
          An unexpected error occurred in this section. Your data is safe.
        </div>
      </div>
      <button
        onClick={onReload}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          padding: '9px 20px', borderRadius: 999,
          background: 'var(--blue)', color: '#fff',
          border: 'none', cursor: 'pointer',
          fontSize: '0.82rem', fontWeight: 700, fontFamily: 'inherit',
          transition: 'background .15s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--blue-hover)'}
        onMouseLeave={e => e.currentTarget.style.background = 'var(--blue)'}
      >
        <RefreshCw size={13} />
        Reload
      </button>
    </div>
  )
}

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('[luminaeVigila] Uncaught error:', error, info?.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return <ErrorCard onReload={() => window.location.reload()} />
    }
    return this.props.children
  }
}
