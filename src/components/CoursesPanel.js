'use client'

/**
 * CoursesPanel — detailed Canvas course + assignment view.
 *
 * Props:
 *   canvasAssignments  — array from page.js state
 *   courseColors       — { [courseId]: hexColor }  (from lv-canvas-prefs)
 *   onToggleCanvas     — mark an assignment done/not-done
 *   onUpdateCanvasNotes — (id, notes) => void
 *   onOpenSettings     — open Canvas settings modal
 *   onSync             — trigger a Canvas sync
 *   syncing            — bool
 */

import { useState, useMemo, useCallback, useEffect } from 'react'
import {
  BookOpen, RefreshCw, Settings2, ChevronDown, ChevronRight,
  AlertCircle, Clock, GraduationCap, TrendingUp, Star, Timer,
} from 'lucide-react'
import { CanvasLogo } from '@/components/CanvasSettingsModal'
import AssignmentDetailModal from '@/components/AssignmentDetailModal'
import GpaPanel from '@/components/GpaPanel'

// ── Constants ─────────────────────────────────────────────────────────────────

const CANVAS_COLOR = '#E8751A'

export const COURSE_PALETTE = [
  '#3a6fa8','#10b981','#8b5cf6','#f59e0b',
  '#ef4444','#06b6d4','#ec4899','#84cc16',
]

export function getCourseColor(courseId, courseColors) {
  if (courseColors?.[courseId]) return courseColors[courseId]
  // Auto-assign from palette using courseId modulo
  const idx = Math.abs(Number(courseId) || 0) % COURSE_PALETTE.length
  return COURSE_PALETTE[idx]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDue(dueAt) {
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

function isCompleted(a) {
  return a.done || a.submissionState === 'graded' || a.submissionState === 'submitted'
}

function getThisWeekBounds() {
  const now = new Date()
  const day = now.getDay() // 0=Sun
  const mon = new Date(now); mon.setDate(now.getDate() - ((day + 6) % 7)); mon.setHours(0,0,0,0)
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23,59,59,999)
  return { mon, sun }
}

// ── AssignmentRow ─────────────────────────────────────────────────────────────

function AssignmentRow({ a, courseColor, onToggle, onClickDetail, selectMode, isSelected, onToggleSelect }) {
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

// ── CourseCard ────────────────────────────────────────────────────────────────

function CourseCard({ courseId, courseName, assignments, courseColor, onToggle, onClickDetail, defaultOpen = true, selectMode, selectedIds, onToggleSelect }) {
  const [open, setOpen] = useState(defaultOpen)
  const color = courseColor ?? CANVAS_COLOR

  const total     = assignments.length
  const completed = assignments.filter(isCompleted).length
  const pct       = total > 0 ? Math.round((completed / total) * 100) : 0

  const sorted = [...assignments].sort((a, b) => {
    if (!a.dueAt && !b.dueAt) return 0
    if (!a.dueAt) return 1
    if (!b.dueAt) return -1
    return new Date(a.dueAt) - new Date(b.dueAt)
  })

  return (
    <div style={{
      borderRadius: 12, overflow: 'hidden', marginBottom: 14,
      border: '1px solid var(--border)',
      background: 'var(--surface2)',
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
        {open
          ? <ChevronDown  size={13} style={{ color, flexShrink: 0, opacity: 0.7 }} />
          : <ChevronRight size={13} style={{ color, flexShrink: 0, opacity: 0.7 }} />}

        {/* Color dot */}
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0 }} />

        <span style={{ flex: 1, fontSize: '0.83rem', fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {courseName}
        </span>

        {/* Progress pill */}
        <span style={{
          fontSize: '0.68rem', fontWeight: 700, flexShrink: 0,
          color: pct === 100 ? '#10b981' : color,
          background: pct === 100 ? 'rgba(16,185,129,.12)' : `${color}1a`,
          padding: '2px 8px', borderRadius: 999,
        }}>
          {completed}/{total}
        </span>
      </button>

      {/* Progress bar */}
      {total > 0 && (
        <div style={{ height: 2, background: 'var(--border)', margin: '0 14px' }}>
          <div style={{
            height: '100%', borderRadius: 1,
            background: pct === 100 ? '#10b981' : color,
            width: `${pct}%`, transition: 'width .4s ease',
          }} />
        </div>
      )}

      {/* Assignment list */}
      {open && (
        <div style={{ padding: '6px 2px 4px' }}>
          {sorted.length === 0
            ? <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', padding: '6px 14px' }}>No assignments</div>
            : sorted.map(a => (
                <AssignmentRow
                  key={a.id} a={a}
                  courseColor={color}
                  onToggle={onToggle}
                  onClickDetail={onClickDetail}
                  selectMode={selectMode}
                  isSelected={selectedIds?.has(a.id)}
                  onToggleSelect={onToggleSelect}
                />
              ))
          }
        </div>
      )}
    </div>
  )
}

// ── StudyTimeCard ─────────────────────────────────────────────────────────────

function getWeekStr(offsetWeeks = 0) {
  const now = new Date()
  const day = now.getDay()
  const mon = new Date(now); mon.setDate(now.getDate() - ((day + 6) % 7) + offsetWeeks * 7); mon.setHours(0, 0, 0, 0)
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23, 59, 59, 999)
  return { mon, sun }
}

function loadStudySessions() {
  try { return JSON.parse(localStorage.getItem('lv-study-sessions') ?? '[]') } catch { return [] }
}

function fmtHours(sec) {
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function StudyTimeCard({ courseColors }) {
  const [sessions, setSessions] = useState([])

  // Load from localStorage on mount
  useEffect(() => {
    setSessions(loadStudySessions())
  }, [])

  const { thisWeek, lastWeekTotal, maxSec } = useMemo(() => {
    const { mon: thisMonday, sun: thisSunday } = getWeekStr(0)
    const { mon: lastMonday, sun: lastSunday } = getWeekStr(-1)

    // Aggregate by course for this week
    const byCourse = {}
    let lastWeekTotal = 0

    for (const s of sessions) {
      const d = new Date(s.date + 'T00:00:00')
      if (d >= thisMonday && d <= thisSunday) {
        const key = s.courseId ?? '__none__'
        const name = s.courseName ?? 'Untagged'
        if (!byCourse[key]) byCourse[key] = { courseId: s.courseId, courseName: name, totalSec: 0 }
        byCourse[key].totalSec += s.durationSec
      } else if (d >= lastMonday && d <= lastSunday) {
        lastWeekTotal += s.durationSec
      }
    }

    const thisWeek = Object.values(byCourse).sort((a, b) => b.totalSec - a.totalSec)
    const maxSec = thisWeek.reduce((m, c) => Math.max(m, c.totalSec), 0)

    return { thisWeek, lastWeekTotal, maxSec }
  }, [sessions])

  const thisWeekTotal = thisWeek.reduce((s, c) => s + c.totalSec, 0)
  const [open, setOpen] = useState(false)

  if (sessions.length === 0) return null  // nothing to show until first session

  const weekOverWeek = thisWeekTotal - lastWeekTotal
  const accentColor = '#8b5cf6'

  return (
    <div style={{ marginBottom: 14 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px', borderRadius: open ? '12px 12px 0 0' : 12,
          border: '1px solid var(--border)', background: 'var(--surface2)',
          cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
        }}
      >
        {open ? <ChevronDown size={13} style={{ color: accentColor, flexShrink: 0, opacity: 0.8 }} />
               : <ChevronRight size={13} style={{ color: accentColor, flexShrink: 0, opacity: 0.8 }} />}
        <Timer size={13} style={{ color: accentColor, flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: '0.82rem', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>
          Study Time
        </span>
        {/* This week total pill */}
        <span style={{ fontSize: '0.68rem', fontWeight: 800, flexShrink: 0, padding: '2px 9px', borderRadius: 999, background: 'rgba(139,92,246,.12)', color: accentColor }}>
          {fmtHours(thisWeekTotal)} this week
        </span>
        {/* Week-over-week delta */}
        {lastWeekTotal > 0 && (
          <span style={{ fontSize: '0.64rem', fontWeight: 700, flexShrink: 0, color: weekOverWeek >= 0 ? '#10b981' : '#ef4444' }}>
            {weekOverWeek >= 0 ? '+' : ''}{fmtHours(Math.abs(weekOverWeek))} vs last week
          </span>
        )}
      </button>

      {open && (
        <div style={{ border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 12px 12px', background: 'var(--surface)', padding: '12px 14px 14px' }}>
          {thisWeek.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '16px 10px', color: 'var(--text-3)', fontSize: '0.78rem' }}>
              <Timer size={24} style={{ opacity: 0.3, marginBottom: 6 }} />
              <div>No study sessions logged this week.</div>
              <div style={{ fontSize: '0.7rem', marginTop: 4 }}>Tag a course in the Focus Timer to track study time.</div>
            </div>
          ) : (
            <>
              {thisWeek.map(c => {
                const barPct = maxSec > 0 ? (c.totalSec / maxSec) * 100 : 0
                const color = c.courseId ? getCourseColor(c.courseId, courseColors) : '#94a3b8'
                return (
                  <div key={c.courseId ?? '__none__'} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                        {c.courseName}
                      </span>
                      <span style={{ fontSize: '0.73rem', fontWeight: 700, color: 'var(--text-2)', flexShrink: 0, marginLeft: 8 }}>
                        {fmtHours(c.totalSec)}
                      </span>
                    </div>
                    {/* Horizontal bar */}
                    <div style={{ height: 6, borderRadius: 999, background: 'var(--border)' }}>
                      <div style={{ height: '100%', borderRadius: 999, background: color, width: `${barPct}%`, transition: 'width .4s ease' }} />
                    </div>
                  </div>
                )
              })}
              <div style={{ fontSize: '0.68rem', color: 'var(--text-3)', marginTop: 8, textAlign: 'right' }}>
                Total: {fmtHours(thisWeekTotal)} this week
                {lastWeekTotal > 0 && ` · ${fmtHours(lastWeekTotal)} last week`}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── GradesPanel ───────────────────────────────────────────────────────────────

function GradesPanel({ canvasAssignments, courseColors, courseIds }) {
  const [grades,  setGrades]  = useState(null)   // null = not loaded, [] = loaded
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const load = useCallback(async () => {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch(`/api/canvas/grades?courseIds=${courseIds.join(',')}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setGrades(data.grades ?? [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [courseIds.join(',')]) // eslint-disable-line

  // Auto-load on mount
  useState(() => { load() }, []) // eslint-disable-line

  // Actually trigger load via useEffect
  const [didMount, setDidMount] = useState(false)
  if (!didMount) { setDidMount(true); load() }

  const now = Date.now()

  // Group assignments by courseId for recent graded
  const byCourse = useMemo(() => {
    const map = {}
    for (const a of canvasAssignments) {
      if (!map[a.courseId]) map[a.courseId] = []
      map[a.courseId].push(a)
    }
    return map
  }, [canvasAssignments])

  // Projected grade calculation
  function projected(courseId) {
    const assignments = byCourse[courseId] ?? []
    const graded = assignments.filter(a => a.score != null && a.pointsPossible != null)
    if (!graded.length) return null
    const avgPct = graded.reduce((s, a) => s + a.score / a.pointsPossible, 0) / graded.length
    const totalPossible = assignments.filter(a => a.pointsPossible != null).reduce((s, a) => s + a.pointsPossible, 0)
    if (!totalPossible) return null
    const earnedSoFar = graded.reduce((s, a) => s + a.score, 0)
    const ungradedPossible = totalPossible - graded.reduce((s, a) => s + a.pointsPossible, 0)
    const projected = earnedSoFar + avgPct * ungradedPossible
    return Math.round((projected / totalPossible) * 100)
  }

  // Recent graded (sorted by gradedAt desc, cap 6)
  function recentGraded(courseId) {
    return (byCourse[courseId] ?? [])
      .filter(a => a.submissionState === 'graded' && a.score != null)
      .sort((a, b) => {
        const ta = a.gradedAt ? new Date(a.gradedAt).getTime() : 0
        const tb = b.gradedAt ? new Date(b.gradedAt).getTime() : 0
        return tb - ta
      })
      .slice(0, 6)
  }

  const gradeMap = useMemo(() => {
    if (!grades) return {}
    return Object.fromEntries(grades.map(g => [g.courseId, g]))
  }, [grades])

  // Build list of unique courses from assignments
  const courses = useMemo(() => {
    const seen = new Set()
    const list = []
    for (const a of canvasAssignments) {
      if (!seen.has(a.courseId)) { seen.add(a.courseId); list.push({ id: a.courseId, name: a.courseName }) }
    }
    return list
  }, [canvasAssignments])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', padding: '10px 16px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, paddingTop: 4 }}>
        <GraduationCap size={15} style={{ color: 'var(--text-3)' }} />
        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-2)', letterSpacing: '-0.01em' }}>Grades</span>
        <button
          onClick={load}
          title="Refresh grades"
          style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 3, borderRadius: 5, display: 'flex' }}
        >
          <RefreshCw size={11} style={{ animation: loading ? 'gc-spin 1s linear infinite' : 'none' }} />
        </button>
      </div>

      {error && (
        <div style={{ fontSize: '0.75rem', color: 'var(--red)', padding: '8px 10px', borderRadius: 8, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', marginBottom: 10 }}>
          {error === 'Not connected' ? 'Connect Canvas to see grades.' : `Error: ${error}`}
        </div>
      )}

      {loading && !grades && (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', padding: '8px 0' }}>Loading grades…</div>
      )}

      {courses.map(course => {
        const color = getCourseColor(course.id, courseColors)
        const g     = gradeMap[course.id]
        const proj  = projected(course.id)
        const recent = recentGraded(course.id)

        return (
          <div key={course.id} style={{ marginBottom: 14, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', overflow: 'hidden' }}>
            {/* Course header */}
            <div style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{course.name}</span>
            </div>

            <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {/* Current grade */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: '1.3rem', fontWeight: 800, color: g?.currentScore != null ? color : 'var(--text-3)', lineHeight: 1 }}>
                  {g?.currentScore != null ? `${Math.round(g.currentScore)}%` : '—'}
                </span>
                {g?.currentGrade && (
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: color }}>{g.currentGrade}</span>
                )}
                <span style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginLeft: 'auto' }}>Current</span>
              </div>

              {/* Projected */}
              {proj != null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <TrendingUp size={11} style={{ color: 'var(--text-3)' }} />
                  <span style={{ fontSize: '0.73rem', color: 'var(--text-3)' }}>Projected: <strong style={{ color: 'var(--text-2)' }}>{proj}%</strong></span>
                </div>
              )}

              {/* Recent graded */}
              {recent.length > 0 && (
                <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {recent.map(a => {
                    const isNew = a.gradedAt && (now - new Date(a.gradedAt).getTime() < 24 * 3600_000)
                    return (
                      <div key={a.id} style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', borderRadius: 6,
                        background: isNew ? 'rgba(234,179,8,.08)' : 'transparent',
                        border: isNew ? '1px solid rgba(234,179,8,.2)' : '1px solid transparent',
                      }}>
                        {isNew && <Star size={9} style={{ color: '#eab308', flexShrink: 0 }} />}
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</span>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-2)', flexShrink: 0 }}>{a.score}/{a.pointsPossible}</span>
                        {isNew && <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#eab308', textTransform: 'uppercase', flexShrink: 0 }}>New</span>}
                      </div>
                    )
                  })}
                </div>
              )}

              {!grades && !loading && (
                <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 2 }}>—</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── ComingUpSection ───────────────────────────────────────────────────────────

function ComingUpSection({ courses, courseColors, onToggle, onClickDetail, selectMode, selectedIds, onToggleSelect }) {
  const [open, setOpen] = useState(false)
  const total = courses.reduce((s, c) => s + c.assignments.length, 0)

  return (
    <div style={{ marginTop: 8 }}>
      {/* Section header */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          padding: '6px 4px', marginBottom: 6,
        }}
      >
        {open ? <ChevronDown size={13} style={{ color: 'var(--text-3)' }} /> : <ChevronRight size={13} style={{ color: 'var(--text-3)' }} />}
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          Coming Up
        </span>
        <span style={{ fontSize: '0.68rem', color: 'var(--text-3)', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 999, padding: '1px 7px', marginLeft: 2 }}>
          {total}
        </span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)', marginLeft: 6 }} />
      </button>

      {open && courses.map(course => (
        <CourseCard
          key={course.id}
          courseId={course.id}
          courseName={course.name}
          assignments={course.assignments}
          courseColor={getCourseColor(course.id, courseColors)}
          onToggle={onToggle}
          onClickDetail={onClickDetail}
          defaultOpen={false}
          selectMode={selectMode}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
        />
      ))}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function CoursesPanel({
  canvasAssignments = [],
  courseColors = {},
  onToggleCanvas,
  onUpdateCanvasNotes,
  onOpenSettings,
  onSync,
  syncing,
}) {
  const [tab,          setTab]          = useState('thisweek') // 'thisweek' | 'upcoming'
  const [gradesOpen,   setGradesOpen]   = useState(false)
  const [detailAssign, setDetailAssign] = useState(null)
  const [selectMode,   setSelectMode]   = useState(false)
  const [selectedIds,  setSelectedIds]  = useState(new Set())

  function handleToggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleBulkMarkDone() {
    selectedIds.forEach(id => {
      // Only toggle undone ones to avoid toggling done → undone
      const a = canvasAssignments.find(a => a.id === id)
      if (a && !isCompleted(a)) onToggleCanvas?.(id)
    })
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  function handleExitSelect() {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  // ── Group by course ──
  const byCourse = useMemo(() => {
    const map = {}
    for (const a of canvasAssignments) {
      const key = a.courseId
      if (!map[key]) map[key] = { id: a.courseId, name: a.courseName, assignments: [] }
      map[key].assignments.push(a)
    }
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name))
  }, [canvasAssignments])

  // ── Top summary bar: due today + tomorrow ──
  const dueSoon = useMemo(() => {
    const now = new Date()
    const cutoff = new Date(now); cutoff.setHours(23, 59, 59, 999); cutoff.setDate(cutoff.getDate() + 1)
    const items = canvasAssignments.filter(a => {
      if (!a.dueAt) return false
      const d = new Date(a.dueAt)
      return d >= now && d <= cutoff
    })
    const done  = items.filter(isCompleted).length
    return { items, done, total: items.length }
  }, [canvasAssignments])

  // ── This week bounds ──
  const { mon: weekStart, sun: weekEnd } = getThisWeekBounds()

  // ── Tab filter ──
  const filteredByCourse = useMemo(() => {
    return byCourse.map(course => {
      let assignments
      if (tab === 'thisweek') {
        assignments = course.assignments.filter(a => {
          if (!a.dueAt) return false
          const d = new Date(a.dueAt)
          return d >= weekStart && d <= weekEnd
        })
      } else {
        assignments = [...course.assignments]
      }
      return { ...course, assignments }
    }).filter(c => c.assignments.length > 0)
  }, [byCourse, tab, weekStart.getTime(), weekEnd.getTime()]) // eslint-disable-line

  // ── Assignments beyond this week (for the "Coming Up" section in This Week tab) ──
  const futureByCourse = useMemo(() => {
    if (tab !== 'thisweek') return []
    return byCourse.map(course => {
      const assignments = course.assignments.filter(a => {
        if (!a.dueAt) return false
        const d = new Date(a.dueAt)
        return d > weekEnd && !isCompleted(a)
      })
      return { ...course, assignments }
    }).filter(c => c.assignments.length > 0)
  }, [byCourse, tab, weekEnd.getTime()]) // eslint-disable-line

  const courseIds = useMemo(() => byCourse.map(c => c.id), [byCourse])

  const hasAny = canvasAssignments.length > 0

  if (!hasAny) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16, padding: 32, textAlign: 'center' }}>
        <CanvasLogo size={40} />
        <div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-2)', marginBottom: 6 }}>Canvas not synced</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-3)', lineHeight: 1.5 }}>Connect your Canvas account to see your courses and assignments here.</div>
        </div>
        <button
          onClick={onOpenSettings}
          style={{
            padding: '9px 20px', borderRadius: 10,
            border: `1px solid ${CANVAS_COLOR}66`,
            background: `${CANVAS_COLOR}18`,
            color: CANVAS_COLOR,
            fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', transition: 'all .15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = `${CANVAS_COLOR}30`; e.currentTarget.style.borderColor = CANVAS_COLOR }}
          onMouseLeave={e => { e.currentTarget.style.background = `${CANVAS_COLOR}18`; e.currentTarget.style.borderColor = `${CANVAS_COLOR}66` }}
        >
          Connect Canvas
        </button>
      </div>
    )
  }

  // Dominant color for due-soon bar (first course's color)
  const barColor = byCourse[0] ? getCourseColor(byCourse[0].id, courseColors) : CANVAS_COLOR

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px 12px',
          borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <CanvasLogo size={18} />
          <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text)', flex: 1, letterSpacing: '-0.01em' }}>
            My Courses
          </span>

          {/* Bulk select toggle */}
          <button
            onClick={() => selectMode ? handleExitSelect() : setSelectMode(true)}
            title={selectMode ? 'Exit selection' : 'Select assignments'}
            style={{
              background: selectMode ? 'rgba(147,197,253,.15)' : 'none',
              border: selectMode ? '1px solid rgba(147,197,253,.35)' : '1px solid transparent',
              cursor: 'pointer', padding: '4px 8px', borderRadius: 6,
              color: selectMode ? '#93c5fd' : 'var(--text-3)',
              fontSize: '0.7rem', fontWeight: 700, fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 4, transition: 'all .13s',
            }}
          >
            {selectMode ? 'Cancel' : 'Select'}
          </button>

          {/* Grades toggle */}
          <button
            onClick={() => setGradesOpen(v => !v)}
            title={gradesOpen ? 'Hide grades' : 'Show grades'}
            style={{
              background: gradesOpen ? `${barColor}18` : 'none',
              border: gradesOpen ? `1px solid ${barColor}44` : '1px solid transparent',
              cursor: 'pointer', padding: '4px 6px', borderRadius: 6,
              color: gradesOpen ? barColor : 'var(--text-3)', display: 'flex', transition: 'all .13s',
            }}
          >
            <GraduationCap size={14} />
          </button>

          {/* Sync */}
          <button
            onClick={onSync} title="Sync Canvas" disabled={syncing}
            style={{ background: 'none', border: 'none', cursor: syncing ? 'wait' : 'pointer', padding: '4px 6px', borderRadius: 6, color: 'var(--text-3)', display: 'flex', transition: 'color .13s' }}
            onMouseEnter={e => { if (!syncing) e.currentTarget.style.color = CANVAS_COLOR }}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}
          >
            <RefreshCw size={14} style={{ animation: syncing ? 'gc-spin 1s linear infinite' : 'none' }} />
          </button>
          <button
            onClick={onOpenSettings} title="Canvas settings"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 6, color: 'var(--text-3)', display: 'flex', transition: 'color .13s' }}
            onMouseEnter={e => e.currentTarget.style.color = CANVAS_COLOR}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}
          >
            <Settings2 size={14} />
          </button>
        </div>

        {/* Main area: assignments + optional grades panel */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>

          {/* ── Left: assignments ── */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}>

            {/* Due-soon summary bar */}
            <div style={{ padding: '10px 16px 6px', flexShrink: 0 }}>
              {dueSoon.total === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 10, background: 'rgba(16,185,129,.08)', border: '1px solid rgba(16,185,129,.18)' }}>
                  <span style={{ fontSize: '0.8rem' }}>🎉</span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#10b981' }}>All clear for today &amp; tomorrow!</span>
                </div>
              ) : (
                <div style={{ padding: '8px 12px', borderRadius: 10, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-2)' }}>
                      📋 Due today &amp; tomorrow
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>
                      {dueSoon.done}/{dueSoon.total} done
                    </span>
                  </div>
                  <div style={{ height: 5, borderRadius: 999, background: 'var(--border)' }}>
                    <div style={{
                      height: '100%', borderRadius: 999,
                      background: dueSoon.done === dueSoon.total ? '#10b981' : barColor,
                      width: `${dueSoon.total > 0 ? Math.round((dueSoon.done / dueSoon.total) * 100) : 0}%`,
                      transition: 'width .4s ease',
                    }} />
                  </div>
                </div>
              )}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, padding: '4px 16px 6px', flexShrink: 0, alignItems: 'center' }}>
              {[
                { id: 'thisweek', label: 'This Week' },
                { id: 'upcoming', label: 'Upcoming'  },
              ].map(t => (
                <button key={t.id} onClick={() => setTab(t.id)} style={{
                  padding: '4px 12px', borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: '0.75rem', fontWeight: 600, transition: 'all .13s',
                  background: tab === t.id ? `${barColor}22` : 'transparent',
                  color: tab === t.id ? barColor : 'var(--text-3)',
                }}>
                  {t.label}
                </button>
              ))}

              <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-3)', alignSelf: 'center' }}>
                {canvasAssignments.filter(a => !isCompleted(a) && (!a.dueAt || new Date(a.dueAt) >= new Date())).length} pending
              </span>
            </div>

            {/* Course cards */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '6px 16px 24px' }}>
              {/* GPA / Grades collapsible card */}
              <GpaPanel
                canvasAssignments={canvasAssignments}
                courseColors={courseColors}
              />

              {/* Study Time card */}
              <StudyTimeCard courseColors={courseColors} />

              {filteredByCourse.length === 0 && futureByCourse.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-3)', fontSize: '0.82rem' }}>
                  {tab === 'thisweek' ? 'No assignments due this week 🎉' : 'No assignments found.'}
                </div>
              ) : (
                <>
                  {/* This week's assignments */}
                  {filteredByCourse.map(course => (
                    <CourseCard
                      key={course.id}
                      courseId={course.id}
                      courseName={course.name}
                      assignments={course.assignments}
                      courseColor={getCourseColor(course.id, courseColors)}
                      onToggle={onToggleCanvas}
                      onClickDetail={setDetailAssign}
                      selectMode={selectMode}
                      selectedIds={selectedIds}
                      onToggleSelect={handleToggleSelect}
                    />
                  ))}

                  {/* Coming Up section (only in This Week tab) */}
                  {tab === 'thisweek' && futureByCourse.length > 0 && (
                    <ComingUpSection
                      courses={futureByCourse}
                      courseColors={courseColors}
                      onToggle={onToggleCanvas}
                      onClickDetail={setDetailAssign}
                      selectMode={selectMode}
                      selectedIds={selectedIds}
                      onToggleSelect={handleToggleSelect}
                    />
                  )}
                </>
              )}
            </div>
          </div>

          {/* ── Bulk action bar (sticky bottom) ── */}
          {selectMode && selectedIds.size > 0 && (
            <div style={{
              flexShrink: 0,
              borderTop: '1px solid var(--border)',
              background: 'var(--surface)',
              padding: '10px 16px',
              display: 'flex', gap: 8, alignItems: 'center',
            }}>
              <span style={{ flex: 1, fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-2)' }}>
                {selectedIds.size} selected
              </span>
              <button
                onClick={handleBulkMarkDone}
                style={{
                  padding: '6px 14px', borderRadius: 8, border: 'none',
                  background: barColor, color: '#fff',
                  fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                  transition: 'opacity .13s',
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                Mark done
              </button>
              <button
                onClick={handleExitSelect}
                style={{
                  padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)',
                  background: 'var(--surface2)', color: 'var(--text-2)',
                  fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          )}

          {/* ── Right: grades panel ── */}
          {gradesOpen && (
            <div style={{
              width: 260, flexShrink: 0,
              borderLeft: '1px solid var(--border)',
              overflow: 'hidden', display: 'flex', flexDirection: 'column',
            }}>
              <GradesPanel
                canvasAssignments={canvasAssignments}
                courseColors={courseColors}
                courseIds={courseIds}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Assignment detail modal ── */}
      {detailAssign && (
        <AssignmentDetailModal
          assignment={detailAssign}
          courseColor={getCourseColor(detailAssign.courseId, courseColors)}
          onClose={() => setDetailAssign(null)}
          onToggleDone={id => { onToggleCanvas?.(id); setDetailAssign(prev => prev?.id === id ? { ...prev, done: !prev.done } : prev) }}
          onUpdateNotes={(id, notes) => { onUpdateCanvasNotes?.(id, notes); setDetailAssign(prev => prev?.id === id ? { ...prev, notes } : prev) }}
        />
      )}
    </>
  )
}
