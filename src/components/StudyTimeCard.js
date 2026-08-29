'use client'

/**
 * Focus-timer hours, per course, this week against last.
 *
 * Lifted out of CoursesPanel when the Courses tab was folded into My Classes. It is
 * an account-wide roll-up rather than anything per-class, so it sits at the top of
 * the panel beside the GPA card — each class card carries its own seven-day total.
 *
 * Sessions are tagged with a *Canvas* course id, which is why this only has anything
 * to say once Canvas is connected and the timer has been used.
 */

import { useState, useMemo, useEffect } from 'react'
import { ChevronDown, ChevronRight, Timer } from 'lucide-react'
import SessionHistory, { buildCourseOptions } from '@/components/SessionHistory'
import { getCourseColor } from '@/lib/courseColors'

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

export default function StudyTimeCard({ courseColors, studySessions, canvasAssignments = [], onTagSession }) {
  // Use prop when provided (synced state from page.js); fall back to localStorage
  // for backwards compat and for the case where the component is used standalone.
  const [localSessions, setLocalSessions] = useState([])
  useEffect(() => {
    if (!studySessions) setLocalSessions(loadStudySessions())
  }, [studySessions])
  const sessions = studySessions ?? localSessions
  const courseOptions = useMemo(() => buildCourseOptions(canvasAssignments), [canvasAssignments])

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
  // 'week' = the per-course bars; 'history' = every past session, newest first.
  const [tab, setTab] = useState('week')
  const [showAll, setShowAll] = useState(false)

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
          {/* This week / All sessions */}
          <div style={{ display: 'flex', gap: 3, padding: 3, borderRadius: 9, background: 'var(--surface2)', marginBottom: 12 }}>
            {[{ id: 'week', label: 'This week' }, { id: 'history', label: `All sessions (${sessions.length})` }].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{
                  flex: 1, padding: '6px 8px', borderRadius: 7, border: 'none', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: '0.7rem', fontWeight: 700,
                  background: tab === t.id ? accentColor : 'transparent',
                  color: tab === t.id ? '#fff' : 'var(--text-3)',
                  transition: 'background .12s, color .12s',
                }}>
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'history' ? (
            <SessionHistory
              sessions={sessions}
              colorFor={id => getCourseColor(id, courseColors)}
              showAll={showAll}
              onShowAll={() => setShowAll(true)}
              courseOptions={courseOptions}
              onTagSession={onTagSession}
            />
          ) : thisWeek.length === 0 ? (
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
