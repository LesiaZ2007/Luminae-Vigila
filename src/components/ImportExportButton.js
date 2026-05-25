'use client'

/**
 * ImportExportButton — floating circle button that offers JSON import/export
 * for local events and todos (excludes Google Calendar and Canvas data).
 *
 * Props:
 *   events         — array of local calendar events
 *   todos          — array of local todos
 *   todoCategories — array of todo category objects
 *   onImport       — (data: { events, todos, todoCategories }) => void
 *   isMobile       — bool (for bottom offset)
 */

import { useState, useRef } from 'react'
import { Download, Upload, X, FileJson, CheckCircle2 } from 'lucide-react'

export default function ImportExportButton({ events, todos, todoCategories, onImport, isMobile }) {
  const [open,    setOpen]    = useState(false)
  const [status,  setStatus]  = useState(null) // 'importing' | 'done' | { error: string }
  const fileRef = useRef(null)


  function handleExport() {
    const data = {
      version:        1,
      exportedAt:     new Date().toISOString(),
      events,
      todos,
      todoCategories,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `luminae-vigila-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setStatus('done')
    setTimeout(() => { setStatus(null); setOpen(false) }, 1800)
  }

  function handleImportClick() {
    fileRef.current?.click()
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setStatus('importing')

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result)
        if (!data.events || !data.todos) throw new Error('Missing events or todos in file.')
        onImport({
          events:         Array.isArray(data.events)         ? data.events         : [],
          todos:          Array.isArray(data.todos)          ? data.todos          : [],
          todoCategories: Array.isArray(data.todoCategories) ? data.todoCategories : [],
        })
        setStatus('done')
        setTimeout(() => { setStatus(null); setOpen(false) }, 1800)
      } catch (err) {
        setStatus({ error: err.message || 'Invalid file format.' })
      }
    }
    reader.readAsText(file)
    e.target.value = ''  // reset so the same file can be re-imported
  }

  return (
    <>
      {/* Hidden file input */}
      <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleFileChange} />

      {/* Popup menu */}
      {open && (
        <div style={{
          position: 'fixed',
          bottom:   isMobile ? 148 : 86,
          right:    82,   // anchored above/beside the FAB
          zIndex:   199,
          background: 'var(--sidebar)',
          border:     '1px solid rgba(255,255,255,.12)',
          borderRadius: 14,
          padding: '12px 14px',
          boxShadow: '0 8px 32px rgba(0,0,0,.4)',
          minWidth: 190,
          backdropFilter: 'blur(8px)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'rgba(255,255,255,.8)' }}>Local data</span>
            <button onClick={() => { setOpen(false); setStatus(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(147,197,253,.4)', padding: 2, display: 'flex' }}>
              <X size={13} />
            </button>
          </div>

          <p style={{ fontSize: '0.7rem', color: 'rgba(147,197,253,.45)', margin: '0 0 12px', lineHeight: 1.45 }}>
            Exports your local events &amp; tasks (not Google Calendar or Canvas data).
          </p>

          {status === 'done' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#10b981', fontSize: '0.78rem', fontWeight: 600 }}>
              <CheckCircle2 size={14} /> Done!
            </div>
          ) : status === 'importing' ? (
            <div style={{ fontSize: '0.78rem', color: 'rgba(147,197,253,.55)' }}>Importing…</div>
          ) : status?.error ? (
            <div style={{ fontSize: '0.72rem', color: '#fca5a5', lineHeight: 1.4, marginBottom: 8 }}>
              ⚠ {status.error}
            </div>
          ) : null}

          {!status && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button onClick={handleExport} style={btnStyle('#10b981', 'rgba(16,185,129,.12)')}>
                <Download size={13} /> Export as JSON
              </button>
              <button onClick={handleImportClick} style={btnStyle('#60a5fa', 'rgba(96,165,250,.12)')}>
                <Upload size={13} /> Import from JSON
              </button>
            </div>
          )}
        </div>
      )}

      {/* FAB — same dimensions as Corvus button, offset 58px to its left */}
      <button
        onClick={() => { setOpen(v => !v); setStatus(null) }}
        title="Import / Export local data"
        style={{
          position: 'fixed',
          bottom:   isMobile ? 76 : 24,
          right:    82,   // Corvus is at right:20 with width:50; gap = 82-20-50 = 12px
          width:    50,
          height:   50,
          borderRadius: '50%',
          border:   'none',
          background: open ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.1)',
          backdropFilter: 'blur(6px)',
          color:    'rgba(147,197,253,.7)',
          cursor:   'pointer',
          zIndex:   200,
          display:  'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(0,0,0,.3)',
          transition: 'background .15s, color .15s, transform .15s, box-shadow .15s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background  = 'rgba(255,255,255,.2)'
          e.currentTarget.style.color       = '#fff'
          e.currentTarget.style.transform   = 'scale(1.08)'
          e.currentTarget.style.boxShadow   = '0 6px 28px rgba(0,0,0,.4)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background  = open ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.1)'
          e.currentTarget.style.color       = 'rgba(147,197,253,.7)'
          e.currentTarget.style.transform   = 'scale(1)'
          e.currentTarget.style.boxShadow   = '0 4px 20px rgba(0,0,0,.3)'
        }}
      >
        <FileJson size={20} />
      </button>
    </>
  )
}

function btnStyle(color, bg) {
  return {
    display: 'flex', alignItems: 'center', gap: 7,
    padding: '8px 12px', borderRadius: 9, border: 'none',
    background: bg, color, fontFamily: 'inherit',
    fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
    transition: 'filter .12s', width: '100%',
  }
}
