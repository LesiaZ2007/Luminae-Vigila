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
 *   notes          — array of notes (rich-text notes from the Notes tab)
 *   classSchedule  — array of class entries (the My Classes tab's classes)
 *   classMeetings  — those classes expanded into dated meetings, for the ICS.
 *                    Passed in rather than derived: the app already expands them for
 *                    the calendar, and re-doing it here would mean a second copy of
 *                    the recurrence and exception rules to keep in step.
 *   onImport       — (data: { events, todos, todoCategories, notes, classSchedule }) => void
 *                    receives the fully-merged final arrays (not just the imported data)
 *   inline         — bool: render export/import controls inline (no FAB, no popup)
 *                    used in the mobile Settings tab so no floating circle appears
 */

import { useState, useRef } from 'react'
import { Download, Upload, X, FileJson, CheckCircle2 } from 'lucide-react'
import { parseIcs } from '@/lib/ics'
import { serializeIcs } from '@/lib/icsExport'

// status shape:
//   null              — idle
//   'done'            — finished (auto-closes)
//   { error: string } — parse error
//   { reviewing: true, source: 'json' | 'ics', parsed, newEvents, newTodos, newCats,
//     conflictEvents, conflictTodos, conflictCats }
//                     — showing merge summary, waiting for user choice

export default function ImportExportButton({
  events, todos, todoCategories, notes = [],
  classSchedule = [], classMeetings = [],
  onImport, isMobile, inline,
}) {
  const [open,             setOpen]             = useState(false)
  const [status,           setStatus]           = useState(null)
  const [conflictStrategy, setConflictStrategy] = useState('skip') // 'skip' | 'replace' | 'keepBoth'
  const fileRef = useRef(null)

  function reset() { setStatus(null); setConflictStrategy('skip') }

  function initiateExport(format = 'json') {
    if (format === 'ics') {
      /* Class meetings are expanded from the schedule rather than stored, so an
         export of `events` alone contained none of them — a term of classes was
         simply missing from the file. Exams went with them, being a transform of a
         meeting rather than an event of their own. */
      const icsData = serializeIcs([...events, ...classMeetings])
      const blob = new Blob([icsData], { type: 'text/calendar;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `luminae-vigila-${new Date().toISOString().slice(0, 10)}.ics`
      a.click()
      URL.revokeObjectURL(url)
      setStatus('done')
      setTimeout(() => { reset(); setOpen(false) }, 1800)
      return
    }

    const data = {
      /* Bumped because the shape gained a key. Older files have no `classSchedule`
         and import exactly as they did before — the reader defaults it. */
      version:    2,
      exportedAt: new Date().toISOString(),
      events,
      todos,
      todoCategories,
      notes,
      classSchedule,
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
        const text = ev.target.result
        const isIcs = file.name.toLowerCase().endsWith('.ics') || file.type === 'text/calendar'
        let importedEvents = []
        let importedTodos = []
        let importedCats = []
        let importedNotes = []
        let importedClasses = []
        let parsed = null

        if (isIcs) {
          importedEvents = parseIcs(text)
          if (!importedEvents.length) throw new Error('No calendar events were found in this ICS file.')
          parsed = { source: 'ics', events: importedEvents }
        } else {
          parsed = JSON.parse(text)
          // `notes` alone is a valid export (a backup taken before any events
          // or tasks existed), so accept a file that only carries notes.
          // A backup taken before any events or tasks existed is still a backup —
          // and a schedule-only one is now possible too.
          if (!parsed.events && !parsed.todos && !parsed.notes && !parsed.classSchedule)
            throw new Error('This file doesn\'t look like a luminaeVigila export.')

          importedEvents   = Array.isArray(parsed.events)         ? parsed.events         : []
          importedTodos    = Array.isArray(parsed.todos)          ? parsed.todos          : []
          importedCats     = Array.isArray(parsed.todoCategories) ? parsed.todoCategories : []
          importedNotes    = Array.isArray(parsed.notes)          ? parsed.notes          : []
          importedClasses  = Array.isArray(parsed.classSchedule)  ? parsed.classSchedule  : []
        }

        const localEventIds = new Set(events.map(x => x.id))
        const localTodoIds  = new Set(todos.map(x => x.id))
        const localCatIds   = new Set(todoCategories.map(x => x.id))
        const localNoteIds  = new Set(notes.map(x => x.id))
        const localClassIds = new Set(classSchedule.map(x => x.id))

        const newEvents       = importedEvents.filter(x => !localEventIds.has(x.id))
        const conflictEvents  = importedEvents.filter(x =>  localEventIds.has(x.id))
        const newTodos        = importedTodos.filter( x => !localTodoIds.has(x.id))
        const conflictTodos   = importedTodos.filter( x =>  localTodoIds.has(x.id))
        const newCats         = importedCats.filter(  x => !localCatIds.has(x.id))
        const conflictCats    = importedCats.filter(  x =>  localCatIds.has(x.id))
        const newNotes        = importedNotes.filter( x => !localNoteIds.has(x.id))
        const conflictNotes   = importedNotes.filter( x =>  localNoteIds.has(x.id))
        const newClasses      = importedClasses.filter(x => !localClassIds.has(x.id))
        const conflictClasses = importedClasses.filter(x =>  localClassIds.has(x.id))

        const hasConflicts = conflictEvents.length + conflictTodos.length + conflictCats.length
                           + conflictNotes.length + conflictClasses.length > 0

        if (!hasConflicts && newEvents.length + newTodos.length + newCats.length + newNotes.length + newClasses.length === 0) {
          setStatus({ error: 'Nothing new to import — all items already exist locally.' })
          return
        }

        setStatus({
          reviewing: true,
          source: isIcs ? 'ics' : 'json',
          parsed,
          newEvents, conflictEvents,
          newTodos,  conflictTodos,
          newCats,   conflictCats,
          newNotes,  conflictNotes,
          newClasses, conflictClasses,
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
    // ICS imports carry neither notes nor classes, so default these rather than assuming.
    const newNotes        = status.newNotes        ?? []
    const conflictNotes   = status.conflictNotes   ?? []
    const newClasses      = status.newClasses      ?? []
    const conflictClasses = status.conflictClasses ?? []

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
    const mergedNotes   = mergeList(notes,         newNotes,   conflictNotes,   conflictStrategy)
    const mergedClasses = mergeList(classSchedule, newClasses, conflictClasses, conflictStrategy)

    onImport({
      events: mergedEvents, todos: mergedTodos, todoCategories: mergedCats,
      notes: mergedNotes, classSchedule: mergedClasses,
    })
    setStatus('done')
    setTimeout(() => { reset(); setOpen(false) }, 1800)
  }

  /* ── Render ── */
  const isReviewing = status?.reviewing
  const safeArray = (arr) => Array.isArray(arr) ? arr : []
  const hasConflicts = isReviewing &&
    (safeArray(status.conflictEvents).length  + safeArray(status.conflictTodos).length +
     safeArray(status.conflictCats).length    + safeArray(status.conflictNotes).length +
     safeArray(status.conflictClasses).length > 0)

  /* Inline mode: render controls directly in the layout, no floating button */
  if (inline) {
    return (
      <>
        <input ref={fileRef} type="file" accept=".json,.ics" style={{ display: 'none' }} onChange={handleFileChange} />

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
              {(safeArray(status.newNotes).length > 0 || safeArray(status.conflictNotes).length > 0) && (
                <SummaryRow label="Notes" newCount={safeArray(status.newNotes).length} conflictCount={safeArray(status.conflictNotes).length} />
              )}
              {(safeArray(status.newClasses).length > 0 || safeArray(status.conflictClasses).length > 0) && (
                <SummaryRow label="Classes" newCount={safeArray(status.newClasses).length} conflictCount={safeArray(status.conflictClasses).length} />
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
            <button onClick={() => initiateExport('json')}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,.12)', background: 'transparent', color: 'rgba(147,197,253,.7)', fontFamily: 'inherit', fontSize: '0.84rem', fontWeight: 600, cursor: 'pointer' }}>
              <Download size={14} /> Export JSON backup
            </button>
            <button onClick={() => initiateExport('ics')}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,.12)', background: 'transparent', color: 'rgba(147,197,253,.7)', fontFamily: 'inherit', fontSize: '0.84rem', fontWeight: 600, cursor: 'pointer' }}>
              <Download size={14} /> Export ICS
            </button>
            <button onClick={() => fileRef.current?.click()}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,.12)', background: 'transparent', color: 'rgba(147,197,253,.7)', fontFamily: 'inherit', fontSize: '0.84rem', fontWeight: 600, cursor: 'pointer' }}>
              <Upload size={14} /> Import JSON / ICS
            </button>
          </div>
        )}
      </>
    )
  }

  return (
    <>
      <input ref={fileRef} type="file" accept=".json,.ics" style={{ display: 'none' }} onChange={handleFileChange} />

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
                Export everything as a JSON backup, or your calendar and class meetings as ICS. Import supports both.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button onClick={() => initiateExport('json')} style={btnStyle('var(--green)', 'var(--surface2)')}>
                  <Download size={13} /> Export JSON backup
                </button>
                <button onClick={() => initiateExport('ics')} style={btnStyle('var(--green)', 'var(--surface2)')}>
                  <Download size={13} /> Export ICS
                </button>
                <button onClick={() => fileRef.current?.click()} style={btnStyle('var(--blue)', 'var(--blue-bg)')}>
                  <Upload size={13} /> Import JSON / ICS
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
                {(safeArray(status.newNotes).length > 0 || safeArray(status.conflictNotes).length > 0) && (
                  <SummaryRow label="Notes"
                    newCount={safeArray(status.newNotes).length}
                    conflictCount={safeArray(status.conflictNotes).length} />
                )}
                {(safeArray(status.newClasses).length > 0 || safeArray(status.conflictClasses).length > 0) && (
                  <SummaryRow label="Classes"
                    newCount={safeArray(status.newClasses).length}
                    conflictCount={safeArray(status.conflictClasses).length} />
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
