'use client'

/**
 * CoursesPanel — detailed Canvas course + assignment view.
 * Only rendered when Canvas assignments have been synced.
 *
 * Props:
 *   canvasAssignments  — array from page.js state
 *   onToggleCanvas     — mark an assignment done/not-done
 *   onOpenSettings     — open Canvas settings modal
 *   onSync             — trigger a Canvas sync
 *   syncing            — bool
 */

import { useState, useMemo } from 'react'
import { BookOpen, ExternalLink, CheckCircle2, Circle, RefreshCw, Settings2, ChevronDown, ChevronRight, AlertCircle, Clock } from 'lucide-react'
import { CanvasLogo } from '@/components/CanvasSettingsModal'

const CANVAS_COLOR  = '#E8751A'
const CANVAS_RGBA   = (a) => `rgba(232,117,26,${a})`

// ── helpers ──────────────────────────────────────────────────────────────────

function formatDue(dueAt) {
  if (!dueAt) return null
  const d   = new Date(dueAt)
  const now  = new Date()
  const diff = d - now
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24))

  if (diff < 0) {
    const daysPast = Math.abs(Math.floor(diff / (1000 * 60 * 60 * 24)))
    if (daysPast === 0) return { label: 'Due today',     urgent: true,  past: true }
    if (daysPast === 1) return { label: 'Due yesterday', urgent: false, past: true }
    return { label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), urgent: false, past: true }
  }
  if (days === 0) return { label: 'Due today',     urgent: true,  past: false }
  if (days === 1) return { label: 'Due tomorrow',  urgent: true,  past: false }
  if (days <= 7)  return { label: `Due in ${days} days`, urgent: false, past: false }
  return { label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), urgent: false, past: false }
}

function submissionLabel(a) {
  if (a.done) return { text: 'Done', color: '#10b981', bg: 'rgba(16,185,129,.12)' }
  if (a.submissionState === 'graded')    return { text: 'Graded',    color: '#10b981', bg: 'rgba(16,185,129,.12)' }
  if (a.submissionState === 'submitted') return { text: 'Submitted', color: '#60a5fa', bg: 'rgba(96,165,250,.12)' }
  const due = a.dueAt ? new Date(a.dueAt) : null
  if (due && due < new Date()) return { text: 'Missing', color: '#f87171', bg: 'rgba(248,113,113,.12)' }
  return null
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AssignmentRow({ a, onToggle }) {
  const [hovered, setHovered] = useState(false)
  const due   = formatDue(a.dueAt)
  const badge = submissionLabel(a)
  const isDone = a.done || a.submissionState === 'graded' || a.submissionState === 'submitted'

  return (
    <div
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 12px',
        borderRadius: 9, transition: 'background .12s',
        background: hovered ? 'rgba(255,255,255,.04)' : 'transparent',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Check button */}
      <button
        onClick={() => onToggle?.(a.id)}
        title={a.done ? 'Mark undone' : 'Mark done'}
        style={{
          flexShrink: 0, marginTop: 1, width: 18, height: 18, borderRadius: '50%', border: 'none',
          background: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center',
          color: isDone ? CANVAS_COLOR : 'rgba(147,197,253,.35)', transition: 'color .15s',
        }}
        onMouseEnter={e => e.currentTarget.style.color = CANVAS_COLOR}
        onMouseLeave={e => e.currentTarget.style.color = isDone ? CANVAS_COLOR : 'rgba(147,197,253,.35)'}
      >
        {isDone
          ? <CheckCircle2 size={17} strokeWidth={2} />
          : <Circle       size={17} strokeWidth={1.5} />}
      </button>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: '0.82rem', fontWeight: 600, lineHeight: 1.3,
            color: isDone ? 'rgba(255,255,255,.4)' : 'rgba(255,255,255,.85)',
            textDecoration: isDone ? 'line-through' : 'none',
            transition: 'color .15s',
          }}>
            {a.title}
          </span>

          {badge && (
            <span style={{
              fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.05em',
              textTransform: 'uppercase', padding: '1px 6px', borderRadius: 999,
              color: badge.color, background: badge.bg, flexShrink: 0,
            }}>
              {badge.text}
            </span>
          )}
        </div>

        {/* Meta row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 3, flexWrap: 'wrap' }}>
          {due && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 3,
              fontSize: '0.72rem', fontWeight: 500,
              color: due.past
                ? 'rgba(248,113,113,.7)'
                : due.urgent
                  ? 'rgba(251,191,36,.8)'
                  : 'rgba(147,197,253,.5)',
            }}>
              {due.urgent && !due.past && <AlertCircle size={10} />}
              {due.past && <Clock size={10} />}
              {due.label}
            </span>
          )}

          {a.pointsPossible != null && (
            <span style={{ fontSize: '0.72rem', color: 'rgba(147,197,253,.4)' }}>
              {a.score != null ? `${a.score}/${a.pointsPossible} pts` : `${a.pointsPossible} pts`}
            </span>
          )}
        </div>
      </div>

      {/* Canvas link */}
      {a.htmlUrl && hovered && (
        <a href={a.htmlUrl} target="_blank" rel="noopener noreferrer"
           title="Open in Canvas"
           style={{ flexShrink: 0, padding: 3, borderRadius: 5, color: CANVAS_RGBA(0.5), display: 'flex', transition: 'color .12s' }}
           onMouseEnter={e => e.currentTarget.style.color = CANVAS_COLOR}
           onMouseLeave={e => e.currentTarget.style.color = CANVAS_RGBA(0.5)}>
          <ExternalLink size={13} />
        </a>
      )}
    </div>
  )
}

function CourseCard({ courseName, assignments, onToggle, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)

  const total     = assignments.length
  const completed = assignments.filter(a => a.done || a.submissionState === 'graded' || a.submissionState === 'submitted').length
  const pct       = total > 0 ? Math.round((completed / total) * 100) : 0

  // Sort: upcoming first (by due date), then past/no-date
  const sorted = [...assignments].sort((a, b) => {
    if (!a.dueAt && !b.dueAt) return 0
    if (!a.dueAt) return 1
    if (!b.dueAt) return -1
    return new Date(a.dueAt) - new Date(b.dueAt)
  })

  return (
    <div style={{
      borderRadius: 12, overflow: 'hidden',
      border: '1px solid rgba(255,255,255,.08)',
      background: 'rgba(255,255,255,.02)',
      marginBottom: 14,
    }}>
      {/* Course header */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '11px 14px', background: 'none', border: 'none', cursor: 'pointer',
          fontFamily: 'inherit', textAlign: 'left',
        }}
      >
        {open ? <ChevronDown size={13} style={{ color: CANVAS_RGBA(0.7), flexShrink: 0 }} />
               : <ChevronRight size={13} style={{ color: CANVAS_RGBA(0.7), flexShrink: 0 }} />}

        <BookOpen size={13} style={{ color: CANVAS_RGBA(0.75), flexShrink: 0 }} />

        <span style={{ flex: 1, fontSize: '0.83rem', fontWeight: 700, color: 'rgba(255,255,255,.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {courseName}
        </span>

        {/* Progress pill */}
        <span style={{
          fontSize: '0.68rem', fontWeight: 700, flexShrink: 0,
          color: pct === 100 ? '#10b981' : CANVAS_RGBA(0.8),
          background: pct === 100 ? 'rgba(16,185,129,.12)' : CANVAS_RGBA(0.1),
          padding: '2px 8px', borderRadius: 999,
        }}>
          {completed}/{total}
        </span>
      </button>

      {/* Progress bar */}
      {total > 0 && (
        <div style={{ height: 2, background: 'rgba(255,255,255,.06)', margin: '0 14px' }}>
          <div style={{
            height: '100%', borderRadius: 1,
            background: pct === 100 ? '#10b981' : CANVAS_COLOR,
            width: `${pct}%`, transition: 'width .4s ease',
          }} />
        </div>
      )}

      {/* Assignment list */}
      {open && (
        <div style={{ padding: '6px 2px 4px' }}>
          {sorted.length === 0
            ? <div style={{ fontSize: '0.75rem', color: 'rgba(147,197,253,.35)', padding: '6px 14px' }}>No assignments</div>
            : sorted.map(a => <AssignmentRow key={a.id} a={a} onToggle={onToggle} />)
          }
        </div>
      )}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function CoursesPanel({ canvasAssignments = [], onToggleCanvas, onOpenSettings, onSync, syncing, fullPage = false }) {
  const [filter, setFilter] = useState('upcoming') // 'upcoming' | 'all' | 'done'

  // Group by course
  const byCourse = useMemo(() => {
    const map = {}
    for (const a of canvasAssignments) {
      if (!map[a.courseName]) map[a.courseName] = []
      map[a.courseName].push(a)
    }
    return map
  }, [canvasAssignments])

  // Filter assignments per course
  const now = new Date()
  const filterFn = (a) => {
    if (filter === 'done')     return a.done || a.submissionState === 'graded' || a.submissionState === 'submitted'
    if (filter === 'upcoming') return !(a.done || a.submissionState === 'graded' || a.submissionState === 'submitted')
    return true
  }

  const courseNames = Object.keys(byCourse).sort()
  const hasAny = canvasAssignments.length > 0

  if (!hasAny) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16, padding: 32, textAlign: 'center' }}>
        <CanvasLogo size={40} />
        <div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'rgba(255,255,255,.7)', marginBottom: 6 }}>Canvas not synced</div>
          <div style={{ fontSize: '0.82rem', color: 'rgba(147,197,253,.45)', lineHeight: 1.5 }}>Connect your Canvas account to see your courses and assignments here.</div>
        </div>
        <button
          onClick={onOpenSettings}
          style={{
            padding: '9px 20px', borderRadius: 10, border: `1px solid ${CANVAS_RGBA(0.4)}`,
            background: CANVAS_RGBA(0.1), color: CANVAS_COLOR, fontFamily: 'inherit',
            fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', transition: 'all .15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = CANVAS_RGBA(0.2); e.currentTarget.style.borderColor = CANVAS_COLOR }}
          onMouseLeave={e => { e.currentTarget.style.background = CANVAS_RGBA(0.1); e.currentTarget.style.borderColor = CANVAS_RGBA(0.4) }}
        >
          Connect Canvas
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px 12px',
        borderBottom: '1px solid rgba(255,255,255,.07)', flexShrink: 0,
      }}>
        <CanvasLogo size={18} />
        <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#fff', flex: 1, letterSpacing: '-0.01em' }}>
          My Courses
        </span>

        {/* Sync */}
        <button
          onClick={onSync}
          title="Sync Canvas"
          disabled={syncing}
          style={{ background: 'none', border: 'none', cursor: syncing ? 'wait' : 'pointer', padding: '4px 6px', borderRadius: 6, color: CANVAS_RGBA(0.5), display: 'flex', transition: 'color .13s' }}
          onMouseEnter={e => { if (!syncing) e.currentTarget.style.color = CANVAS_COLOR }}
          onMouseLeave={e => e.currentTarget.style.color = CANVAS_RGBA(0.5)}
        >
          <RefreshCw size={14} style={{ animation: syncing ? 'gc-spin 1s linear infinite' : 'none' }} />
        </button>
        <button
          onClick={onOpenSettings}
          title="Canvas settings"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 6, color: CANVAS_RGBA(0.5), display: 'flex', transition: 'color .13s' }}
          onMouseEnter={e => e.currentTarget.style.color = CANVAS_COLOR}
          onMouseLeave={e => e.currentTarget.style.color = CANVAS_RGBA(0.5)}
        >
          <Settings2 size={14} />
        </button>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '10px 16px 6px', flexShrink: 0 }}>
        {[
          { id: 'upcoming', label: 'Upcoming' },
          { id: 'all',      label: 'All'      },
          { id: 'done',     label: 'Done'     },
        ].map(tab => (
          <button key={tab.id} onClick={() => setFilter(tab.id)} style={{
            padding: '4px 12px', borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            fontSize: '0.75rem', fontWeight: 600, transition: 'all .13s',
            background: filter === tab.id ? CANVAS_RGBA(0.18) : 'transparent',
            color: filter === tab.id ? CANVAS_COLOR : 'rgba(147,197,253,.45)',
          }}>
            {tab.label}
          </button>
        ))}

        {/* Summary */}
        <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'rgba(147,197,253,.35)', alignSelf: 'center' }}>
          {canvasAssignments.filter(a => !a.done && a.submissionState !== 'graded' && a.submissionState !== 'submitted' && (!a.dueAt || new Date(a.dueAt) >= now)).length} pending
        </span>
      </div>

      {/* Course cards */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 16px 24px' }}>
        {courseNames.map(name => {
          const filtered = byCourse[name].filter(filterFn)
          if (filtered.length === 0 && filter !== 'all') return null
          return (
            <CourseCard
              key={name}
              courseName={name}
              assignments={filter === 'all' ? byCourse[name] : filtered}
              onToggle={onToggleCanvas}
            />
          )
        })}

        {courseNames.every(name => {
          const filtered = byCourse[name].filter(filterFn)
          return filtered.length === 0
        }) && filter !== 'all' && (
          <div style={{ textAlign: 'center', padding: '40px 16px', color: 'rgba(147,197,253,.35)', fontSize: '0.82rem' }}>
            {filter === 'done' ? 'No completed assignments yet.' : 'All caught up! 🎉'}
          </div>
        )}
      </div>
    </div>
  )
}
