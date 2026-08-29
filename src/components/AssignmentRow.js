'use client'

/**
 * One Canvas assignment, as a row.
 *
 * Lifted out of CoursesPanel when the Courses tab was folded into My Classes — the
 * row outlived the panel it was written for, and it is now the only rendering of a
 * Canvas assignment in the app.
 */

import { useState } from 'react'
import { AlertCircle, Clock } from 'lucide-react'
import { CANVAS_COLOR } from '@/lib/courseColors'

/** How a due date reads relative to now. */
export function formatDue(dueAt) {
  if (!dueAt) return null
  const d    = new Date(dueAt)
  const now  = new Date()
  const diff = d - now
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24))

  if (diff < 0) {
    const daysPast = Math.abs(Math.floor(diff / (1000 * 60 * 60 * 24)))
    if (daysPast === 0) return { label: 'Due today',     urgent: true,  past: true }
    if (daysPast === 1) return { label: 'Due yesterday', urgent: false, past: true }
    return { label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), urgent: false, past: true }
  }
  if (days === 0) return { label: 'Due today',    urgent: true,  past: false }
  if (days === 1) return { label: 'Due tomorrow', urgent: true,  past: false }
  if (days <= 7)  return { label: `Due in ${days} days`, urgent: false, past: false }
  return { label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), urgent: false, past: false }
}

/**
 * Done enough to stop nagging about.
 *
 * Submitted counts as well as graded: the work is out of your hands either way, and
 * an assignment you handed in on Tuesday should not still read as outstanding while
 * it waits to be marked.
 */
export function isCompleted(a) {
  return a.done || a.submissionState === 'graded' || a.submissionState === 'submitted'
}

export default function AssignmentRow({ a, courseColor, onToggle, onClickDetail, selectMode, isSelected, onToggleSelect }) {
  const [hovered, setHovered] = useState(false)
  const color   = courseColor ?? CANVAS_COLOR
  const due     = formatDue(a.dueAt)
  const done    = isCompleted(a)
  const showCrossed = done  // always show strikethrough + muted when done

  function handleRowClick() {
    if (selectMode) { onToggleSelect?.(a.id); return }
    onClickDetail?.(a)
  }

  return (
    <div
      onClick={handleRowClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 12px',
        borderRadius: 9, transition: 'background .12s', cursor: 'pointer',
        background: isSelected ? `${color}18` : hovered ? 'var(--surface2)' : 'transparent',
        outline: isSelected ? `1.5px solid ${color}44` : 'none',
      }}
    >
      {/* Select checkbox OR regular check button */}
      {selectMode ? (
        <button
          onClick={e => { e.stopPropagation(); onToggleSelect?.(a.id) }}
          title={isSelected ? 'Deselect' : 'Select'}
          style={{
            flexShrink: 0, marginTop: 1, width: 18, height: 18, borderRadius: 4, border: `2px solid ${isSelected ? color : 'var(--text-3)'}`,
            background: isSelected ? color : 'none', cursor: 'pointer', padding: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .13s',
          }}
        >
          {isSelected && (
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
          )}
        </button>
      ) : (
        <button
          onClick={e => { e.stopPropagation(); onToggle?.(a.id) }}
          title={a.done ? 'Mark undone' : 'Mark done'}
          style={{
            flexShrink: 0, marginTop: 1, width: 18, height: 18, borderRadius: '50%', border: 'none',
            background: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center',
            color: done ? color : 'var(--text-3)', transition: 'color .15s',
          }}
          onMouseEnter={e => { e.stopPropagation(); e.currentTarget.style.color = color }}
          onMouseLeave={e => { e.stopPropagation(); e.currentTarget.style.color = done ? color : 'var(--text-3)' }}
        >
          {done
            ? <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            : <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/></svg>}
        </button>
      )}

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: '0.82rem', fontWeight: 600, lineHeight: 1.3,
            color: showCrossed ? 'var(--text-3)' : 'var(--text)',
            textDecoration: showCrossed ? 'line-through' : 'none',
            transition: 'color .15s',
          }}>
            {a.title}
          </span>

          {/* Submission badge */}
          {a.submissionState === 'graded' && (
            <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', padding: '1px 6px', borderRadius: 999, color: '#10b981', background: 'rgba(16,185,129,.12)', flexShrink: 0 }}>Graded</span>
          )}
          {a.submissionState === 'submitted' && !a.done && (
            <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', padding: '1px 6px', borderRadius: 999, color: '#60a5fa', background: 'rgba(96,165,250,.12)', flexShrink: 0 }}>Submitted</span>
          )}
          {!done && a.dueAt && new Date(a.dueAt) < new Date() && (
            <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', padding: '1px 6px', borderRadius: 999, color: '#f87171', background: 'rgba(248,113,113,.12)', flexShrink: 0 }}>Missing</span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 3, flexWrap: 'wrap' }}>
          {due && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 3,
              fontSize: '0.72rem', fontWeight: 500,
              color: due.past ? 'var(--red)' : due.urgent ? 'var(--amber)' : 'var(--text-3)',
            }}>
              {due.urgent && !due.past && <AlertCircle size={10} />}
              {due.past  && <Clock size={10} />}
              {due.label}
            </span>
          )}
          {a.pointsPossible != null && (
            <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>
              {a.score != null ? `${a.score}/${a.pointsPossible} pts` : `${a.pointsPossible} pts`}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
