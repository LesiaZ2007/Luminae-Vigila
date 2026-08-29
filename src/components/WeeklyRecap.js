'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Flame, BellRing } from 'lucide-react'
import dynamic from 'next/dynamic'
import { enablePush, pushPermission } from '@/lib/pushClient'
import { todayStr, toDateStr } from '@/lib/localDate'
import SessionHistory, { buildCourseOptions } from '@/components/SessionHistory'

const Confetti = dynamic(() => import('@/components/Confetti'), { ssr: false })

// ── Streak ledger helpers ────────────────────────────────────────────────────

const STREAK_KEY = 'lv-streak'

// todayStr / toDateStr come from lib/localDate. This file used to define its own
// via toISOString(), which is UTC: a session finished after ~8pm Eastern was
// filed under *tomorrow*, breaking the streak walk below the very next day.

function loadLedger() {
  try {
    const raw = localStorage.getItem(STREAK_KEY)
    if (!raw) return { streak: 0, lastDate: null, bestStreak: 0, completionDates: [], lastWeekCompleted: 0 }
    return JSON.parse(raw)
  } catch {
    return { streak: 0, lastDate: null, bestStreak: 0, completionDates: [], lastWeekCompleted: 0 }
  }
}

function saveLedger(ledger) {
  try { localStorage.setItem(STREAK_KEY, JSON.stringify(ledger)) } catch {}
}

/**
 * updateStreak(date?: string) — call whenever a task is completed or a focus
 * session is recorded. date defaults to today. Exported for use in page.js.
 * Returns the updated ledger.
 */
export function updateStreak(date) {
  const dateStr = date ?? todayStr()
  const ledger  = loadLedger()

  // Already recorded this date
  if (ledger.completionDates.includes(dateStr)) return ledger

  const updated = { ...ledger }
  updated.completionDates = [...(ledger.completionDates ?? []), dateStr].slice(-365) // keep 1 year

  // Compute new streak: walk backwards from dateStr
  const dateSet = new Set(updated.completionDates)
  let streak = 0
  // Parsed and formatted as local throughout: `new Date('2026-08-03')` is UTC
  // midnight, so the very first comparison could miss and zero the streak.
  const d = new Date(`${dateStr}T00:00:00`)
  while (dateSet.has(toDateStr(d))) {
    streak++
    d.setDate(d.getDate() - 1)
  }

  updated.streak     = streak
  updated.lastDate   = dateStr
  updated.bestStreak = Math.max(ledger.bestStreak ?? 0, streak)
  saveLedger(updated)
  return updated
}

// ── Focus session helpers ─────────────────────────────────────────────────────

function parseStudySessions() {
  try {
    const raw = localStorage.getItem('lv-study-sessions')
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
  } catch { return [] }
}

function thisWeekRange() {
  const now   = new Date()
  const day   = now.getDay() // 0=Sun
  const start = new Date(now)
  start.setDate(now.getDate() - day)
  start.setHours(0, 0, 0, 0)
  const end   = new Date(start)
  end.setDate(start.getDate() + 7)
  return { start, end }
}

function lastWeekRange() {
  const { start } = thisWeekRange()
  const end   = new Date(start)
  const wkStart = new Date(start)
  wkStart.setDate(start.getDate() - 7)
  return { start: wkStart, end: start }
}

/**
 * Seconds of focus in a session.
 *
 * FocusTimer writes `durationSec` (see its shape comment) — this used to read
 * `durationMs ?? duration`, neither of which is ever present, so **every**
 * session counted as zero and the weekly total sat at 0h no matter how much you
 * focused. The other reader, StudyTimeCard, always used durationSec, which is why
 * the Study Time panel was right while this card was wrong.
 *
 * The ms/duration fallbacks are kept only to tolerate any older stored shape.
 */
function sessionSeconds(s) {
  if (Number.isFinite(s?.durationSec)) return s.durationSec
  if (Number.isFinite(s?.durationMs))  return s.durationMs / 1000
  if (Number.isFinite(s?.duration))    return s.duration / 1000
  return 0
}

/**
 * When a session happened, as a local Date.
 *
 * `date` is a bare 'YYYY-MM-DD'. `new Date('2026-08-03')` parses that as **UTC**
 * midnight, which is the previous evening anywhere west of Greenwich — enough to
 * push a Sunday session out of the week that just started.
 */
function sessionDate(s) {
  const raw = s?.completedAt ?? s?.startedAt ?? s?.date
  if (!raw) return null
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00` : raw
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

function totalFocusSeconds(sessions, rangeStart, rangeEnd) {
  let sec = 0
  for (const s of sessions) {
    const at = sessionDate(s)
    if (at && at >= rangeStart && at < rangeEnd) sec += sessionSeconds(s)
  }
  return sec
}

/**
 * Anything under an hour reads as "0h" when rounded to hours, which is exactly
 * how a real 25-minute session looked like nothing. Below an hour, show minutes.
 */
function fmtFocus(seconds) {
  if (seconds <= 0) return '0h'
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  return `${Math.round((seconds / 3600) * 10) / 10}h`
}

/** One level deep is enough — the recap data object is all primitives. */
function shallowEqual(a, b) {
  if (a === b) return true
  if (!a || !b) return false
  const ka = Object.keys(a), kb = Object.keys(b)
  return ka.length === kb.length && ka.every(k => a[k] === b[k])
}

// ── Component ────────────────────────────────────────────────────────────────

export default function WeeklyRecap({
  todos = [], canvasAssignments = [], digest = null,
  /** Bumped by the parent when a focus session completes, so this re-reads localStorage. */
  sessionsVersion = 0,
  /** Synced sessions from page.js. Falls back to localStorage when absent so the
      component still works standalone. */
  sessions: sessionsProp,
  /** (sessionId, { courseId, courseName }) => void — enables retroactive tagging. */
  onTagSession,
  /** 'panel' (themed surface) | 'zen' (on dark backdrop) */ variant = 'panel',
}) {
  const [data,       setData]       = useState(null)
  const [confetti,   setConfetti]   = useState(false)
  const [expanded,   setExpanded]   = useState(false)
  const [showAllSessions, setShowAllSessions] = useState(false)
  // Re-read on the same trigger as the totals, so a session you just finished
  // shows up in the list rather than only in the numbers above it.
  const localSessions = useMemo(() => parseStudySessions(), [sessionsVersion])
  // Prefer the synced array: tagging writes to page.js state, and re-reading
  // localStorage here would show the pre-edit value until the next version bump.
  const sessions = sessionsProp ?? localSessions
  const courseOptions = useMemo(() => buildCourseOptions(canvasAssignments), [canvasAssignments])
  const [notifPerm,  setNotifPerm]  = useState('default') // 'granted'|'denied'|'default'|'unsupported'
  const [notifBusy,  setNotifBusy]  = useState(false)

  useEffect(() => { setNotifPerm(pushPermission()) }, [])

  const onEnableNotifications = useCallback(async () => {
    setNotifBusy(true)
    const result = await enablePush()
    setNotifPerm(result === 'granted' ? 'granted' : pushPermission())
    setNotifBusy(false)
  }, [])

  const refresh = useCallback(() => {
    const { start: wkStart, end: wkEnd }   = thisWeekRange()
    const { start: lwStart, end: lwEnd }   = lastWeekRange()
    const sessions = parseStudySessions()

    // Tasks completed this week
    const completedThisWeek = todos.filter(t => {
      if (!t.completed) return false
      try {
        const d = new Date((t.completedAt ?? t.doneDate ?? t.updatedAt ?? ''))
        return d >= wkStart && d < wkEnd
      } catch { return false }
    }).length

    // Canvas done this week
    const canvasDoneThisWeek = canvasAssignments.filter(a => {
      if (!a.done || !a.doneDate) return false
      try {
        const d = new Date(a.doneDate + 'T00:00:00')
        return d >= wkStart && d < wkEnd
      } catch { return false }
    }).length

    const totalCompleted = completedThisWeek + canvasDoneThisWeek

    // Last week's count (stored in ledger)
    const ledger   = loadLedger()
    const lastWeek = ledger.lastWeekCompleted ?? 0
    const delta    = totalCompleted - lastWeek

    // Focus time — kept in seconds so sub-hour sessions survive to the formatter
    const focusSec     = totalFocusSeconds(sessions, wkStart, wkEnd)
    const focusSecLast = totalFocusSeconds(sessions, lwStart, lwEnd)

    // Streak
    const streak     = ledger.streak     ?? 0
    const bestStreak = ledger.bestStreak ?? 0

    const next = { totalCompleted, lastWeek, delta, focusSec, focusSecLast, streak, bestStreak }
    // Bail out when nothing actually changed.
    //
    // `todos` and `canvasAssignments` default to `[]`, and a default parameter
    // builds a *new* array on every render — so `refresh`'s identity churns every
    // render, so the effect below re-runs every render. Setting a fresh object
    // each time then renders again, forever. It only stays quiet in the app
    // because page.js happens to pass memoised arrays; a caller that omits a prop
    // or passes a literal would spin the tab. Returning `prev` makes React bail
    // out of the re-render and breaks the cycle at the source, whatever the
    // callers do.
    setData(prev => shallowEqual(prev, next) ? prev : next)
    // sessionsVersion is not read here — it exists so finishing a focus session
    // re-runs this. Without it the card kept showing the total from mount, and a
    // session you just completed didn't appear until something else changed.
  }, [todos, canvasAssignments, sessionsVersion])

  // Persist last-week count on Sunday
  useEffect(() => {
    const now = new Date()
    if (now.getDay() === 0) {
      const ledger = loadLedger()
      if (data && ledger.lastWeekUpdated !== toDateStr(now)) {
        saveLedger({
          ...ledger,
          lastWeekCompleted: data.totalCompleted,
          lastWeekUpdated:   toDateStr(now),
        })
      }
    }
  }, [data])

  // Confetti on new personal-best streak
  const prevBest = useState(() => {
    try { return JSON.parse(localStorage.getItem(STREAK_KEY) ?? '{}').bestStreak ?? 0 } catch { return 0 }
  })[0]

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (!data) return
    if (data.streak > 0 && data.streak === data.bestStreak && data.bestStreak > prevBest && data.bestStreak > 1) {
      setConfetti(true)
      setTimeout(() => setConfetti(false), 1600)
    }
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return null

  const { totalCompleted, delta, focusSec, streak, bestStreak } = data

  const deltaSign  = delta > 0 ? '+' : ''
  const deltaColor = delta >= 0 ? '#10b981' : '#ef4444'

  // Color palette — 'zen' renders light-on-dark to blend with the fullscreen timer backdrop
  const zen = variant === 'zen'
  const c = {
    label:  zen ? 'rgba(255,255,255,0.5)'  : 'var(--text-3)',
    value:  zen ? '#fff'                    : 'var(--text)',
    muted:  zen ? 'rgba(255,255,255,0.45)'  : 'var(--text-3)',
    border: zen ? 'rgba(255,255,255,0.14)'  : 'var(--border)',
    pill:   zen ? 'rgba(255,255,255,0.10)'  : 'var(--surface2)',
    digestBorderOn: zen ? 'rgba(147,197,253,.45)' : 'var(--blue)',
    digestBgOn:     zen ? 'rgba(147,197,253,.14)' : 'var(--blue-bg)',
    digestTextOn:   zen ? '#bcd9ff'               : 'var(--blue-text)',
    digestTextOff:  zen ? 'rgba(255,255,255,0.6)' : 'var(--text-2)',
  }

  return (
    <>
      {confetti && <Confetti priority="medium" x={window.innerWidth / 2} y={120} />}
      <div style={{ userSelect: 'none' }}>
        {/* Header row */}
        <div
          onClick={() => setExpanded(v => !v)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, cursor: 'pointer' }}
          title={expanded ? 'Collapse weekly recap' : 'Expand weekly recap'}
        >
          <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: c.label }}>
            Your week
          </div>
          {/* Streak pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: streak > 0 ? 'rgba(245,158,11,.16)' : c.pill, borderRadius: 99, padding: '2px 7px 2px 5px' }}>
            <Flame size={11} style={{ color: streak > 0 ? '#f59e0b' : c.muted }} />
            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: streak > 0 ? '#f59e0b' : c.muted }}>
              {streak}d
            </span>
          </div>
        </div>

        {/* Stats row */}
        <div
          onClick={() => setExpanded(v => !v)}
          style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginTop: 7, cursor: 'pointer' }}
        >
          {/* Tasks completed */}
          <div>
            <div style={{ fontSize: '1.15rem', fontWeight: 900, color: c.value, lineHeight: 1 }}>
              {totalCompleted}
            </div>
            <div style={{ fontSize: '0.58rem', color: c.muted, fontWeight: 600, marginTop: 2 }}>
              tasks done
            </div>
            {delta !== 0 && (
              <div style={{ fontSize: '0.6rem', fontWeight: 700, color: deltaColor, marginTop: 1 }}>
                {deltaSign}{delta} vs last wk
              </div>
            )}
          </div>

          {/* Focus hours */}
          <div>
            <div style={{ fontSize: '1.15rem', fontWeight: 900, color: c.value, lineHeight: 1 }}>
              {fmtFocus(focusSec)}
            </div>
            <div style={{ fontSize: '0.58rem', color: c.muted, fontWeight: 600, marginTop: 2 }}>
              focused
            </div>
          </div>
        </div>

        {/* Expanded section */}
        {expanded && (
          <div style={{ marginTop: 10, paddingTop: 9, borderTop: `1px solid ${c.border}`, display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.67rem', color: c.muted, fontWeight: 600 }}>Best streak</span>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: bestStreak > 0 ? '#f59e0b' : c.muted }}>{bestStreak}d</span>
            </div>
            {streak === bestStreak && bestStreak > 1 && (
              <div style={{ fontSize: '0.62rem', color: '#10b981', fontWeight: 700, textAlign: 'center', marginTop: 2 }}>
                Personal best!
              </div>
            )}

            {/* Past sessions. Also shown in the Courses > Study Time card, but
                that tab only exists once Canvas is connected — this is the copy
                that's always reachable, right next to the timer that made them. */}
            {sessions.length > 0 && (
              <div style={{ marginTop: 6, paddingTop: 8, borderTop: `1px solid ${c.border}` }}>
                <div style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: c.muted, marginBottom: 7 }}>
                  Past sessions
                </div>
                <SessionHistory
                  sessions={sessions}
                  maxDays={showAllSessions ? 999 : 3}
                  showAll={showAllSessions}
                  onShowAll={() => setShowAllSessions(true)}
                  courseOptions={courseOptions}
                  onTagSession={onTagSession}
                  compact
                />
              </div>
            )}
          </div>
        )}

        {/* Enable push notifications — must be triggered by this tap (mobile browsers
            silently ignore auto-requested permission prompts). */}
        {digest?.signedIn && notifPerm !== 'unsupported' && notifPerm !== 'granted' && (
          <div style={{ marginTop: 10, paddingTop: 9, borderTop: `1px solid ${c.border}` }}>
            <button
              onClick={onEnableNotifications}
              disabled={notifBusy || notifPerm === 'denied'}
              title={notifPerm === 'denied'
                ? 'Notifications are blocked — enable them in your browser/site settings'
                : 'Turn on reminder & digest push notifications on this device'}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%',
                padding: '7px 10px', borderRadius: 9,
                border: `1px solid ${c.digestBorderOn}`,
                background: c.digestBgOn, color: c.digestTextOn,
                fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 700,
                cursor: (notifBusy || notifPerm === 'denied') ? 'default' : 'pointer',
                opacity: notifBusy ? 0.6 : 1,
              }}>
              <BellRing size={13} strokeWidth={2.5} />
              <span>{notifPerm === 'denied' ? 'Notifications blocked in browser' : notifBusy ? 'Enabling…' : 'Enable notifications'}</span>
            </button>
          </div>
        )}

        {/* Sunday digest toggle (optional) */}
        {digest && (
          <div style={{ marginTop: 10, paddingTop: 9, borderTop: `1px solid ${c.border}` }}>
            {digest.signedIn ? (
              <button
                onClick={digest.onToggle}
                disabled={digest.saving}
                title={digest.enabled ? 'Disable Sunday week-ahead digest' : 'Enable Sunday week-ahead digest push'}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, width: '100%',
                  padding: '7px 10px', borderRadius: 9,
                  border: `1px solid ${digest.enabled ? c.digestBorderOn : c.border}`,
                  background: digest.enabled ? c.digestBgOn : 'transparent',
                  color: digest.enabled ? c.digestTextOn : c.digestTextOff,
                  fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 600,
                  cursor: digest.saving ? 'default' : 'pointer', opacity: digest.saving ? 0.6 : 1,
                }}>
                <span>📬 Weekly digest</span>
                <span style={{ fontSize: '0.62rem', fontWeight: 800, color: digest.enabled ? '#10b981' : c.muted }}>{digest.enabled ? 'ON' : 'OFF'}</span>
              </button>
            ) : (
              <div style={{ fontSize: '0.62rem', color: c.muted, textAlign: 'center' }}>
                Sign in to get a Sunday week-ahead digest
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
