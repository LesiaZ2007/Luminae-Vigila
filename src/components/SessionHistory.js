'use client'

/**
 * SessionHistory — every past focus session, newest first, grouped by day.
 *
 * Lives in its own file because it is needed in two places that can't share a
 * parent: the Study Time card in Courses, and the Focus Timer's own recap. The
 * Courses tab only exists once Canvas is connected, so putting the history
 * *only* there would hide it from anyone using the timer without Canvas.
 */
import { useMemo } from 'react'
import { Timer } from 'lucide-react'

/** Duration as '1h 20m' / '25m'. */
export function fmtDuration(sec) {
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

/**
 * Group sessions into days, newest first.
 *
 * Ordered on `endedAt` where present, falling back to the bare date. Sessions
 * saved before endedAt existed still land on the right day — they just can't be
 * ordered within it.
 */
export function groupSessionsByDay(sessions = []) {
  const sorted = [...sessions].sort((a, b) =>
    String(b.endedAt ?? b.date ?? '').localeCompare(String(a.endedAt ?? a.date ?? ''))
  )
  const days = []
  for (const s of sorted) {
    const day = s.date ?? String(s.endedAt ?? '').slice(0, 10)
    if (!day) continue
    let group = days[days.length - 1]
    if (!group || group.day !== day) {
      group = { day, sessions: [], totalSec: 0 }
      days.push(group)
    }
    group.sessions.push(s)
    group.totalSec += s.durationSec ?? 0
  }
  return days
}

/** 'Today' / 'Yesterday' / 'Mon, Aug 3' — a bare date reads as noise in a list. */
export function formatDayLabel(dayStr) {
  // Parsed with an explicit time: 'YYYY-MM-DD' alone is UTC midnight, which is
  // the previous day locally and would label today's sessions "Yesterday".
  const d = new Date(`${dayStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return dayStr

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((today - d) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

/** End time of a session, e.g. '3:45 PM'. */
function formatClock(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/**
 * @param sessions   raw lv-study-sessions rows
 * @param colorFor   (courseId) => css color; omit for a neutral accent
 * @param maxDays    days shown before the "show earlier" button (default 5)
 * @param showAll    when true, render every day
 * @param onShowAll  called by the "show earlier" button
 * @param compact    tighter type, for the narrow Focus Timer panel
 */
export default function SessionHistory({
  sessions = [], colorFor, maxDays = 5, showAll = false, onShowAll, compact = false,
}) {
  const days = useMemo(() => groupSessionsByDay(sessions), [sessions])

  if (days.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '16px 10px', color: 'var(--text-3)', fontSize: '0.78rem' }}>
        <Timer size={24} style={{ opacity: 0.3, marginBottom: 6 }} />
        <div>No focus sessions yet.</div>
        <div style={{ fontSize: '0.7rem', marginTop: 4 }}>Finish one in the Focus Timer and it will appear here.</div>
      </div>
    )
  }

  // Capped until asked for more: a term's worth of sessions inside a
  // collapsible card is a scroll trap, and the recent ones are what you came for.
  const shown  = showAll ? days : days.slice(0, maxDays)
  const hidden = days.length - shown.length
  const fs     = compact ? 0.7 : 0.74

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 9 : 12 }}>
      {shown.map(group => (
        <div key={group.day}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: `${fs - 0.06}rem`, fontWeight: 800, color: 'var(--text-2)', letterSpacing: '0.02em' }}>
              {formatDayLabel(group.day)}
            </span>
            <span style={{ fontSize: `${fs - 0.08}rem`, fontWeight: 700, color: 'var(--text-3)' }}>
              {fmtDuration(group.totalSec)}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {group.sessions.map(s => {
              const color = (s.courseId && colorFor?.(s.courseId)) || '#94a3b8'
              // What you worked on beats what it was tagged as — the tag is for
              // aggregation, the title is what makes the row recognisable.
              const subject = s.targetTitle || s.courseName || 'Untagged'
              return (
                <div key={s.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 9px', borderRadius: 8,
                  background: 'var(--surface2)', borderLeft: `3px solid ${color}`,
                }}>
                  <span style={{
                    flex: 1, minWidth: 0, fontSize: `${fs}rem`, fontWeight: 600, color: 'var(--text-2)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {subject}
                    {s.targetTitle && s.courseName && (
                      <span style={{ color: 'var(--text-3)', fontWeight: 500 }}> · {s.courseName}</span>
                    )}
                  </span>
                  {s.endedAt && (
                    <span style={{ fontSize: `${fs - 0.1}rem`, color: 'var(--text-3)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                      {formatClock(s.endedAt)}
                    </span>
                  )}
                  <span style={{ fontSize: `${fs - 0.04}rem`, fontWeight: 700, color: 'var(--text-2)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                    {fmtDuration(s.durationSec ?? 0)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {hidden > 0 && (
        <button onClick={onShowAll}
          style={{
            padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--text-2)',
            fontFamily: 'inherit', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer',
          }}>
          Show {hidden} earlier day{hidden !== 1 ? 's' : ''}
        </button>
      )}
    </div>
  )
}
