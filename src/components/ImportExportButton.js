'use client'

/**
 * ImportExportButton — floating circle button for JSON import/export of local data.
 *
 * Import is non-destructive by default:
 *   - New items (ID not found locally) are always added
 *   - Duplicate items (same ID) show a merge prompt:
 *       Skip     — keep your local version, discard the imported one
 *       Replace  — overwrite your local version with the imported one
 *       Keep both — import gets a new ID and is added alongside yours
 *
 * Props:
 *   events         — array of local calendar events
 *   todos          — array of local todos
 *   todoCategories — array of todo category objects
 *   onImport       — (data: { events, todos, todoCategories }) => void
 *                    receives the fully-merged final arrays (not just the imported data)
 *   inline         — bool: render export/import controls inline (no FAB, no popup)
 *                    used in the mobile Settings tab so no floating circle appears
 */

import { useState, useRef } from 'react'
import { Download, Upload, X, FileJson, CheckCircle2 } from 'lucide-react'

// status shape:
//   null              — idle
//   'done'            — finished (auto-closes)
//   { error: string } — parse error
//   { reviewing: true, parsed, newEvents, newTodos, newCats,
//     conflictEvents, conflictTodos, conflictCats }
//                     — showing merge summary, waiting for user choice

export default function ImportExportButton({ events, todos, todoCategories, onImport, isMobile, inline }) {
  const [open,             setOpen]             = useState(false)
  const [status,           setStatus]           = useState(null)
  const [conflictStrategy, setConflictStrategy] = useState('skip') // 'skip' | 'replace' | 'keepBoth'
  const fileRef = useRef(null)

  function reset() { setStatus(null); setConflictStrategy('skip') }

  /* ── Export ── */
  function handleExport() {
    const data = {
      version:    1,
      exportedAt: new Date().toISOString(),
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
    setTimeout(() => { reset(); setOpen(false) }, 1800)
  }

  /* ── File picked → parse & analyse conflicts ── */
  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result)
        if (!parsed.events && !parsed.todos)
          throw new Error('This file doesn\'t look like a luminaeVigila export.')

        const importedEvents = Array.isArray(parsed.events)         ? parsed.events         : []
        const importedTodos  = Array.isArray(parsed.todos)          ? parsed.todos          : []
        const importedCats   = Array.isArray(parsed.todoCategories)  ? parsed.todoCategories : []

        const localEventIds = new Set(events.map(x => x.id))
        const localTodoIds  = new Set(todos.map(x => x.id))
        const localCatIds   = new Set(todoCategories.map(x => x.id))

        const newEvents       = importedEvents.filter(x => !localEventIds.has(x.id))
        const conflictEvents  = importedEvents.filter(x =>  localEventIds.has(x.id))
        const newTodos        = importedTodos.filter( x => !localTodoIds.has(x.id))
        const conflictTodos   = importedTodos.filter( x =>  localTodoIds.has(x.id))
        const newCats         = importedCats.filter(  x => !localCatIds.has(x.id))
        const conflictCats    = importedCats.filter(  x =>  localCatIds.has(x.id))

        const hasConflicts = conflictEvents.length + conflictTodos.length + conflictCats.length > 0

        if (!hasConflicts && newEvents.length + newTodos.length + newCats.length === 0) {
          // Nothing to import at all
          setStatus({ error: 'Nothing new to import — all items already exist locally.' })
          return
        }

        setStatus({
          reviewing: true,
          parsed,
          newEvents, conflictEvents,
          newTodos,  conflictTodos,
          newCats,   conflictCats,
        })
      } catch (err) {
        setStatus({ error: err.message || 'Invalid file format.' })
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  /* ── Apply merge with chosen strategy ── */
  function handleConfirmImport() {
    if (!status?.reviewing) return
    const { newEvents, conflictEvents, newTodos, conflictTodos, newCats, conflictCats } = status

    function mergeList(localList, newItems, conflictItems, strategy) {
      let result = [...localList]

      // Always add brand-new items
      result = [...result, ...newItems]

      // Handle conflicts
      for (const item of conflictItems) {
        if (strategy === 'skip') {
          // Keep local — don't touch it
        } else if (strategy === 'replace') {
          result = result.map(x => x.id === item.id ? item : x)
        } else if (strategy === 'keepBoth') {
          // Give the imported item a fresh ID and append it
          result = [...result, { ...item, id: `imported-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }]
        }
      }
      return result
    }

    const mergedEvents = mergeList(events,        newEvents, conflictEvents, conflictStrategy)
    const mergedTodos  = mergeList(todos,          newTodos,  conflictTodos,  conflictStrategy)
    const mergedCats   = mergeList(todoCategories, newCats,   conflictCats,   conflictStrategy)

    onImport({ events: mergedEvents, todos: mergedTodos, todoCategories: mergedCats })
    setStatus('done')
    setTimeout(() => { reset(); setOpen(false) }, 1800)
  }

  /* ── Render ── */
  const isReviewing = status?.reviewing
  const hasConflicts = isReviewing &&
    (status.conflictEvents.length + status.conflictTodos.length + status.conflictCats.length > 0)

  /* Inline mode: render controls directly in the layout, no floating button */
  if (inline) {
    return (
      <>
        <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleFileChange} />

        {status === 'done' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--green, #10b981)', fontSize: '0.78rem', fontWeight: 600, padding: '4px 0' }}>
            <CheckCircle2 size={14} /> Done!
          </div>
        )}

        {status?.error && (
          <div style={{ fontSize: '0.72rem', color: 'var(--red)', lineHeight: 1.45, padding: '4px 0' }}>
            ⚠ {status.error}
            <button onClick={reset} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(147,197,253,.7)', fontFamily: 'inherit', fontSize: '0.72rem' }}>
              Retry
            </button>
          </div>
        )}

        {isReviewing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 0' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(status.newEvents.length > 0 || status.conflictEvents.length > 0) && (
                <SummaryRow label="Events" newCount={status.newEvents.length} conflictCount={status.conflictEvents.length} />
              )}
              {(status.newTodos.length > 0 || status.conflictTodos.length > 0) && (
                <SummaryRow label="Tasks" newCount={status.newTodos.length} conflictCount={status.conflictTodos.length} />
              )}
              {(status.newCats.length > 0 || status.conflictCats.length > 0) && (
                <SummaryRow label="Categories" newCount={status.newCats.length} conflictCount={status.conflictCats.length} />
              )}
            </div>
            {hasConflicts && (
              <div>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'rgba(147,197,253,.5)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                  For duplicates
                </div>
                {[
                  { value: 'skip',     label: 'Keep mine',    desc: 'Ignore imported duplicates' },
                  { value: 'replace',  label: 'Replace mine', desc: 'Overwrite with imported version' },
                  { value: 'keepBoth', label: 'Keep both',    desc: 'Add imported as a new copy' },
                ].map(opt => (
                  <label key={opt.value} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, cursor: 'pointer', marginBottom: 5 }}>
                    <input type="radio" name="conflictStrategy" value={opt.value}
                           checked={conflictStrategy === opt.value}
                           onChange={() => setConflictStrategy(opt.value)}
                           style={{ marginTop: 2, accentColor: 'var(--blue)', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: '0.76rem', fontWeight: 600, color: conflictStrategy === opt.value ? '#fff' : 'rgba(255,255,255,.6)', lineHeight: 1.2 }}>
                        {opt.label}
                      </div>
                      <div style={{ fontSize: '0.65rem', color: 'rgba(147,197,253,.5)', lineHeight: 1.3 }}>
                        {opt.desc}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={reset}
                      style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,.12)', background: 'transparent', color: 'rgba(147,197,253,.7)', fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleConfirmImport}
                      style={{ flex: 1.5, padding: '8px 10px', borderRadius: 8, border: 'none', background: 'var(--blue)', color: '#fff', fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>
                Import
              </button>
            </div>
          </div>
        )}

        {!status && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button onClick={handleExport}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,.12)', background: 'transparent', color: 'rgba(147,197,253,.7)', fontFamily: 'inherit', fontSize: '0.84rem', fontWeight: 600, cursor: 'pointer' }}>
              <Download size={14} /> Export data
            </button>
            <button onClick={() => fileRef.current?.click()}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,.12)', background: 'transparent', color: 'rgba(147,197,253,.7)', fontFamily: 'inherit', fontSize: '0.84rem', fontWeight: 600, cursor: 'pointer' }}>
              <Upload size={14} /> Import data
            </button>
          </div>
        )}
      </>
    )
  }

  return (
    <>
      <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleFileChange} />

      {/* Popup */}
      {open && (
        <div style={{
          position: 'fixed',
          bottom:   isMobile ? 148 : 86,
          right:    82,
          zIndex:   199,
          background: 'var(--surface)',
          border:   '1px solid var(--border)',
          borderRadius: 14,
          padding: '12px 14px',
          boxShadow: 'var(--shadow-modal)',
          width: isReviewing ? 260 : 200,
          maxWidth: 'calc(100vw - 32px)',
          backdropFilter: 'blur(8px)',
          transition: 'width .2s',
        }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text)' }}>
              {isReviewing ? 'Review import' : 'Local data'}
            </span>
            <button onClick={() => { setOpen(false); reset() }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, display: 'flex' }}>
              <X size={13} />
            </button>
          </div>

          {/* Done */}
          {status === 'done' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--green)', fontSize: '0.78rem', fontWeight: 600 }}>
              <CheckCircle2 size={14} /> Done!
            </div>
          )}

          {/* Error */}
          {status?.error && (
            <>
              <div style={{ fontSize: '0.72rem', color: 'var(--red)', lineHeight: 1.45, marginBottom: 10 }}>
                ⚠ {status.error}
              </div>
              <button onClick={reset} style={btnStyle('var(--text-2)', 'var(--surface2)')}>
                Try again
              </button>
            </>
          )}

          {/* Idle — main menu */}
          {!status && (
            <>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-3)', margin: '0 0 12px', lineHeight: 1.45 }}>
                Exports local events &amp; tasks (not Google Calendar or Canvas data).
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button onClick={handleExport} style={btnStyle('var(--green)', 'var(--surface2)')}>
                  <Download size={13} /> Export as JSON
                </button>
                <button onClick={() => fileRef.current?.click()} style={btnStyle('var(--blue)', 'var(--blue-bg)')}>
                  <Upload size={13} /> Import from JSON
                </button>
              </div>
            </>
          )}

          {/* Reviewing — merge summary */}
          {isReviewing && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

              {/* Summary rows */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(status.newEvents.length > 0 || status.conflictEvents.length > 0) && (
                  <SummaryRow label="Events"
                    newCount={status.newEvents.length}
                    conflictCount={status.conflictEvents.length} />
                )}
                {(status.newTodos.length > 0 || status.conflictTodos.length > 0) && (
                  <SummaryRow label="Tasks"
                    newCount={status.newTodos.length}
                    conflictCount={status.conflictTodos.length} />
                )}
                {(status.newCats.length > 0 || status.conflictCats.length > 0) && (
                  <SummaryRow label="Categories"
                    newCount={status.newCats.length}
                    conflictCount={status.conflictCats.length} />
                )}
              </div>

              {/* Conflict strategy picker */}
              {hasConflicts && (
                <div>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                    For duplicates
                  </div>
                  {[
                    { value: 'skip',     label: 'Keep mine',    desc: 'Ignore imported duplicates' },
                    { value: 'replace',  label: 'Replace mine', desc: 'Overwrite with imported version' },
                    { value: 'keepBoth', label: 'Keep both',    desc: 'Add imported as a new copy' },
                  ].map(opt => (
                    <label key={opt.value} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, cursor: 'pointer', marginBottom: 5 }}>
                      <input
                        type="radio"
                        name="conflictStrategy"
                        value={opt.value}
                        checked={conflictStrategy === opt.value}
                        onChange={() => setConflictStrategy(opt.value)}
                        style={{ marginTop: 2, accentColor: 'var(--blue)', flexShrink: 0 }}
                      />
                      <div>
                        <div style={{ fontSize: '0.76rem', fontWeight: 600, color: conflictStrategy === opt.value ? 'var(--text)' : 'var(--text-2)', lineHeight: 1.2 }}>
                          {opt.label}
                        </div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-3)', lineHeight: 1.3 }}>
                          {opt.desc}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                <button onClick={reset}
                        style={{ ...btnStyle('var(--text-2)', 'var(--surface2)'), flex: 1, justifyContent: 'center' }}>
                  Cancel
                </button>
                <button onClick={handleConfirmImport}
                        style={{ ...btnStyle('var(--blue-text)', 'var(--blue-bg)'), flex: 1.5, justifyContent: 'center', fontWeight: 700, border: '1px solid var(--blue-ring)' }}>
                  Import
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => { setOpen(v => !v); if (open) reset() }}
        title="Import / Export local data"
        style={{
          position: 'fixed',
          bottom:   isMobile ? 76 : 24,
          right:    82,
          width:    50, height: 50,
          borderRadius: '50%', border: '1px solid var(--border)',
          background: open ? 'var(--blue-bg)' : 'var(--surface)',
          color:    open ? 'var(--blue)' : 'var(--text-2)',
          cursor:   'pointer', zIndex: 200,
          display:  'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: 'var(--shadow-md)',
          transition: 'background .15s, color .15s, transform .15s, box-shadow .15s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'var(--blue-bg)'
          e.currentTarget.style.color      = 'var(--blue)'
          e.currentTarget.style.transform  = 'scale(1.08)'
          e.currentTarget.style.boxShadow  = 'var(--shadow-lg)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = open ? 'var(--blue-bg)' : 'var(--surface)'
          e.currentTarget.style.color      = open ? 'var(--blue)' : 'var(--text-2)'
          e.currentTarget.style.transform  = 'scale(1)'
          e.currentTarget.style.boxShadow  = 'var(--shadow-md)'
        }}
      >
        <FileJson size={20} />
      </button>
    </>
  )
}

function SummaryRow({ label, newCount, conflictCount }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.73rem' }}>
      <span style={{ color: 'var(--text)', fontWeight: 600 }}>{label}</span>
      <span style={{ display: 'flex', gap: 6 }}>
        {newCount > 0 && (
          <span style={{ color: 'var(--green)', fontWeight: 700 }}>+{newCount} new</span>
        )}
        {conflictCount > 0 && (
          <span style={{ color: 'var(--amber)', fontWeight: 700 }}>{conflictCount} duplicate{conflictCount !== 1 ? 's' : ''}</span>
        )}
      </span>
    </div>
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
