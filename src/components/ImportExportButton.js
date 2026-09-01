'use client'

/**
 * ImportExportButton — JSON backup and ICS export of local data.
 *
 * Import is non-destructive by default:
 *   - New items (ID not found locally) are always added
 *   - Duplicate items (same ID) show a merge prompt:
 *       Skip     — keep your local version, discard the imported one
 *       Replace  — overwrite your local version with the imported one
 *       Keep both — import gets a new ID and is added alongside yours
 *
 * ## Why this is driven by a list
 *
 * Every collection used to be named by hand — `newEvents`, `conflictTodos`,
 * `mergedCats` — in six places each. Adding a collection meant remembering all six,
 * and twice running nobody did: the class schedule went missing from what called
 * itself a backup, and so did event categories, custom lists and study sessions.
 *
 * So the collections come from `BACKUP_COLLECTIONS` in lib/backup.js and everything
 * here loops over it. Adding one to that list is now the whole change.
 *
 * Props:
 *   collections   — { events, todos, todoCategories, eventCategories, notes,
 *                     classSchedule, customLists, studySessions } — raw arrays,
 *                   tombstones included, so a restore does not resurrect deletions
 *   eventPrefs    — { [eventId]: { hidden, color } }, a settings blob rather than a list
 *   classMeetings — the class schedule expanded into dated meetings, for the ICS.
 *                   Passed in rather than derived: the app already expands them for
 *                   the calendar, and redoing it here would mean a second copy of the
 *                   recurrence and exception rules to keep in step.
 *   onImport      — ({ collections, eventPrefs, preferences }) => void
 *                   receives the fully-merged final state, not just what was imported
 *   inline        — render controls inline (no FAB), used in the mobile Settings tab
 */

import { useState, useRef } from 'react'
import { Download, Upload, X, FileJson, CheckCircle2 } from 'lucide-react'
import { parseIcs }     from '@/lib/ics'
import { serializeIcs } from '@/lib/icsExport'
import {
  BACKUP_COLLECTIONS, buildBackup, readBackup, looksLikeBackup,
  readLocalPrefs, applyLocalPrefs,
} from '@/lib/backup'

const EMPTY = []

/** The one place that knows where the settings blobs live, guarded for SSR. */
function storage() {
  return typeof window !== 'undefined' ? window.localStorage : null
}

export default function ImportExportButton({
  collections = {},
  eventPrefs = {},
  classMeetings = EMPTY,
  onImport, isMobile, inline,
}) {
  const [open,             setOpen]             = useState(false)
  const [status,           setStatus]           = useState(null)
  const [conflictStrategy, setConflictStrategy] = useState('skip')
  const fileRef = useRef(null)

  function reset() { setStatus(null); setConflictStrategy('skip') }

  const listOf = key => (Array.isArray(collections[key]) ? collections[key] : EMPTY)

  function download(blob, extension) {
    const url = URL.createObjectURL(blob)
    const a   = document.createElement('a')
    a.href     = url
    a.download = `luminae-vigila-${new Date().toISOString().slice(0, 10)}.${extension}`
    a.click()
    URL.revokeObjectURL(url)
    setStatus('done')
    setTimeout(() => { reset(); setOpen(false) }, 1800)
  }

  function initiateExport(format = 'json') {
    if (format === 'ics') {
      /* Class meetings are expanded from the schedule rather than stored, so an
         export of `events` alone contained none of them. Deleted events drop out: a
         tombstone records a deletion, and no calendar wants to import one. */
      const events = listOf('events').filter(e => !e?.deletedAt)
      download(
        new Blob([serializeIcs([...events, ...classMeetings])], { type: 'text/calendar;charset=utf-8' }),
        'ics',
      )
      return
    }

    const data = buildBackup({
      collections,
      eventPrefs,
      /* Read at export time rather than held in state: several components write these
         blobs straight to localStorage, so storage is the only source never behind. */
      prefs: readLocalPrefs(storage()),
      exportedAt: new Date().toISOString(),
    })
    download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'json')
  }

  /* ── File picked → parse & analyse conflicts ── */
  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const text  = ev.target.result
        const isIcs = file.name.toLowerCase().endsWith('.ics') || file.type === 'text/calendar'

        let imported = {}
        let eventPrefsIn
        let preferencesIn

        if (isIcs) {
          const events = parseIcs(text)
          if (!events.length) throw new Error('No calendar events were found in this ICS file.')
          imported = { events }
        } else {
          const parsed = JSON.parse(text)
          if (!looksLikeBackup(parsed)) throw new Error('This file doesn\'t look like a luminaeVigila export.')
          const read    = readBackup(parsed)
          imported      = read.collections
          eventPrefsIn  = read.eventPrefs
          preferencesIn = read.preferences
        }

        // Diff every collection the same way, so none can be forgotten.
        const groups = {}
        let newTotal = 0, conflictTotal = 0
        for (const { key } of BACKUP_COLLECTIONS) {
          const incoming = Array.isArray(imported[key]) ? imported[key] : EMPTY
          const localIds = new Set(listOf(key).map(x => x?.id))
          const fresh    = incoming.filter(x => !localIds.has(x?.id))
          const clashing = incoming.filter(x =>  localIds.has(x?.id))
          groups[key] = { fresh, clashing }
          newTotal      += fresh.length
          conflictTotal += clashing.length
        }

        const hasSettings = !!eventPrefsIn || !!preferencesIn

        if (newTotal + conflictTotal === 0 && !hasSettings) {
          setStatus({ error: 'Nothing new to import — all items already exist locally.' })
          return
        }

        setStatus({
          reviewing: true,
          source: isIcs ? 'ics' : 'json',
          groups, newTotal, conflictTotal,
          eventPrefs:  eventPrefsIn,
          preferences: preferencesIn,
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

    function mergeList(local, fresh, clashing, strategy) {
      let result = [...local, ...fresh]
      for (const item of clashing) {
        if (strategy === 'replace') {
          result = result.map(x => (x.id === item.id ? item : x))
        } else if (strategy === 'keepBoth') {
          result = [...result, { ...item, id: `imported-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }]
        }
        // 'skip' keeps the local copy untouched.
      }
      return result
    }

    const merged = {}
    for (const { key } of BACKUP_COLLECTIONS) {
      const { fresh, clashing } = status.groups[key] ?? { fresh: EMPTY, clashing: EMPTY }
      merged[key] = mergeList(listOf(key), fresh, clashing, conflictStrategy)
    }

    // Settings restore wholesale — merging them record-by-record is meaningless.
    if (status.preferences) applyLocalPrefs(status.preferences, storage())

    onImport({
      collections: merged,
      /* Left undefined when the file said nothing about them, so a silent {} cannot
         wipe hidden-event settings the file simply had no opinion on. */
      eventPrefs:  status.eventPrefs,
      preferences: status.preferences,
    })
    setStatus('done')
    setTimeout(() => { reset(); setOpen(false) }, 1800)
  }

  /* ── Render ── */
  const isReviewing  = status?.reviewing
  const hasConflicts = isReviewing && status.conflictTotal > 0

  const summaryRows = isReviewing
    ? BACKUP_COLLECTIONS
        .map(({ key, label }) => ({ label, ...(status.groups[key] ?? { fresh: EMPTY, clashing: EMPTY }) }))
        .filter(row => row.fresh.length > 0 || row.clashing.length > 0)
    : EMPTY

  const settingsRestored = isReviewing && (!!status.eventPrefs || !!status.preferences)

  const strategyOptions = [
    { value: 'skip',     label: 'Keep mine',    desc: 'Ignore imported duplicates' },
    { value: 'replace',  label: 'Replace mine', desc: 'Overwrite with imported version' },
    { value: 'keepBoth', label: 'Keep both',    desc: 'Add imported as a new copy' },
  ]

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
              {summaryRows.map(row => (
                <SummaryRow key={row.label} label={row.label} newCount={row.fresh.length} conflictCount={row.clashing.length} />
              ))}
              {settingsRestored && (
                <div style={{ fontSize: '0.7rem', color: 'rgba(147,197,253,.6)' }}>Settings will be restored.</div>
              )}
            </div>
            {hasConflicts && (
              <div>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'rgba(147,197,253,.5)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                  For duplicates
                </div>
                {strategyOptions.map(opt => (
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
          /* The summary can now run to eight rows plus the duplicate picker, which is
             taller than the old four ever were. */
          maxHeight: 'calc(100vh - 140px)',
          overflowY: 'auto',
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

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {summaryRows.map(row => (
                  <SummaryRow key={row.label} label={row.label} newCount={row.fresh.length} conflictCount={row.clashing.length} />
                ))}
                {settingsRestored && (
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>Settings will be restored.</div>
                )}
              </div>

              {/* Conflict strategy picker */}
              {hasConflicts && (
                <div>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                    For duplicates
                  </div>
                  {strategyOptions.map(opt => (
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
