'use client'

/**
 * SessionHistory — every past focus session, newest first, grouped by day.
 *
 * Lives in its own file because it is needed in two places that can't share a
 * parent: the Study Time card in Courses, and the Focus Timer's own recap. The
 * Courses tab only exists once Canvas is connected, so putting the history
 * *only* there would hide it from anyone using the timer without Canvas.
 */
import { useMemo, useState, useRef, useEffect } from 'react'
import { Timer, Tag, Check } from 'lucide-react'

/**
 * Unique course list from Canvas assignments, for tagging.
 *
 * Exported so the Focus Timer's own picker and this history list can't drift
 * apart on what counts as a course.
 */
export function buildCourseOptions(canvasAssignments = []) {
  const seen = new Map()
  for (const a of canvasAssignments ?? []) {
    if (a?.courseId && !seen.has(String(a.courseId))) {
      seen.set(String(a.courseId), a.courseName || String(a.courseId))
    }
  }
  return [...seen].map(([value, label]) => ({ value, label }))
}

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

/**
 * TagPicker — retroactively assign a course to a session.
 *
 * Sessions get their course from whatever was selected in the timer when they
 * finished, which is easy to forget to set and impossible to correct afterwards
 * — leaving the time stuck under "Untagged" in every breakdown forever. This
 * makes it fixable.
 */
function TagPicker({ session, options, open, onOpen, onClose, onPick, fs }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = e => { if (!ref.current?.contains(e.target)) onClose() }
    const onKey  = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  const tagged = Boolean(session.courseId)

  return (
    <span ref={ref} style={{ position: 'relative', flexShrink: 0, display: 'flex' }}>
      <button
        onClick={onOpen}
        title={tagged ? `Tagged ${session.courseName} — click to change` : 'Tag this session with a course'}
        aria-label={tagged ? `Change course tag for this session` : 'Tag this session with a course'}
        style={{
          display: 'flex', alignItems: 'center', gap: 3,
          padding: '2px 6px', borderRadius: 6, cursor: 'pointer',
          border: `1px solid ${open ? 'var(--blue)' : 'var(--border)'}`,
          background: open ? 'var(--blue-bg)' : 'transparent',
          color: tagged ? 'var(--text-2)' : 'var(--text-3)',
          fontFamily: 'inherit', fontSize: `${fs - 0.12}rem`, fontWeight: 700,
        }}>
        <Tag size={10} />
        {!tagged && 'Tag'}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 60,
          minWidth: 150, maxHeight: 190, overflowY: 'auto',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, boxShadow: 'var(--shadow-modal)', padding: 4,
        }}>
          {/* Untagging has to be possible too — a wrong tag is worse than none. */}
          {[{ value: '', label: 'Untagged' }, ...options].map(opt => {
            const active = (session.courseId ?? '') === opt.value
            return (
              <button
                key={opt.value || '__none__'}
                onClick={() => onPick({
                  courseId:   opt.value || null,
                  courseName: opt.value ? opt.label : null,
                })}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                  padding: '6px 8px', borderRadius: 7, border: 'none', cursor: 'pointer',
                  background: active ? 'var(--blue-bg)' : 'transparent',
                  color: active ? 'var(--blue-text)' : 'var(--text-2)',
                  fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 600, textAlign: 'left',
                }}>
                <span style={{ width: 12, flexShrink: 0 }}>{active && <Check size={11} strokeWidth={3} />}</span>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {opt.label}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </span>
  )
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
 * @param sessions       raw lv-study-sessions rows
 * @param colorFor       (courseId) => css color; omit for a neutral accent
 * @param maxDays        days shown before the "show earlier" button (default 5)
 * @param showAll        when true, render every day
 * @param onShowAll      called by the "show earlier" button
 * @param compact        tighter type, for the narrow Focus Timer panel
 * @param courseOptions  [{ value, label }] — enables retroactive tagging
 * @param onTagSession   (sessionId, { courseId, courseName }) => void
 */
export default function SessionHistory({
  sessions = [], colorFor, maxDays = 5, showAll = false, onShowAll, compact = false,
  courseOptions = [], onTagSession,
}) {
  const days = useMemo(() => groupSessionsByDay(sessions), [sessions])
  // Only one row's picker is open at a time — a list of open dropdowns is
  // unreadable, and there is never a reason to retag two sessions at once.
  const [editingId, setEditingId] = useState(null)
  const canTag = Boolean(onTagSession) && courseOptions.length > 0

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
                  position: 'relative',
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

                  {canTag && (
                    <TagPicker
                      session={s}
                      options={courseOptions}
                      open={editingId === s.id}
                      onOpen={() => setEditingId(editingId === s.id ? null : s.id)}
                      onClose={() => setEditingId(null)}
                      onPick={choice => { onTagSession(s.id, choice); setEditingId(null) }}
                      fs={fs}
                    />
                  )}

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
