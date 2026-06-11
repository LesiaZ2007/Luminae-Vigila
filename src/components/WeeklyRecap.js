'use client'

import { useState, useEffect, useCallback } from 'react'
import { Flame } from 'lucide-react'
import dynamic from 'next/dynamic'

const Confetti = dynamic(() => import('@/components/Confetti'), { ssr: false })

// ── Streak ledger helpers ────────────────────────────────────────────────────

const STREAK_KEY = 'lv-streak'

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

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
  const d = new Date(dateStr)
  while (dateSet.has(d.toISOString().slice(0, 10))) {
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

function totalFocusHours(sessions, rangeStart, rangeEnd) {
  let ms = 0
  for (const s of sessions) {
    try {
      const at = new Date(s.completedAt ?? s.startedAt ?? s.date ?? 0)
      if (at >= rangeStart && at < rangeEnd) ms += s.durationMs ?? s.duration ?? 0
    } catch {}
  }
  return Math.round((ms / 3_600_000) * 10) / 10
}

// ── Component ────────────────────────────────────────────────────────────────

export default function WeeklyRecap({ todos = [], canvasAssignments = [] }) {
  const [data,       setData]       = useState(null)
  const [confetti,   setConfetti]   = useState(false)
  const [expanded,   setExpanded]   = useState(false)

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

    // Focus hours
    const focusHrs     = totalFocusHours(sessions, wkStart, wkEnd)
    const focusHrsLast = totalFocusHours(sessions, lwStart, lwEnd)

    // Streak
    const streak     = ledger.streak     ?? 0
    const bestStreak = ledger.bestStreak ?? 0

    setData({ totalCompleted, lastWeek, delta, focusHrs, focusHrsLast, streak, bestStreak })
  }, [todos, canvasAssignments])

  // Persist last-week count on Sunday
  useEffect(() => {
    const now = new Date()
    if (now.getDay() === 0) {
      const ledger = loadLedger()
      if (data && ledger.lastWeekUpdated !== now.toISOString().slice(0, 10)) {
        saveLedger({
          ...ledger,
          lastWeekCompleted: data.totalCompleted,
          lastWeekUpdated:   now.toISOString().slice(0, 10),
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

  const { totalCompleted, delta, focusHrs, streak, bestStreak } = data

  const deltaSign  = delta > 0 ? '+' : ''
  const deltaColor = delta >= 0 ? '#10b981' : '#ef4444'

  return (
    <>
      {confetti && <Confetti priority="medium" x={window.innerWidth / 2} y={120} />}
      <div
        onClick={() => setExpanded(v => !v)}
        style={{
          margin: '0 10px 8px',
          padding: '11px 13px',
          borderRadius: 13,
          background: 'rgba(0,0,0,0.18)',
          cursor: 'pointer',
          userSelect: 'none',
          transition: 'background .15s',
          flexShrink: 0,
        }}
        title={expanded ? 'Collapse weekly recap' : 'Expand weekly recap'}
      >
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'rgba(147,197,253,.55)' }}>
            Your week
          </div>
          {/* Streak pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: streak > 0 ? 'rgba(245,158,11,.18)' : 'rgba(255,255,255,.06)', borderRadius: 99, padding: '2px 7px 2px 5px' }}>
            <Flame size={11} style={{ color: streak > 0 ? '#f59e0b' : 'rgba(147,197,253,.3)' }} />
            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: streak > 0 ? '#f59e0b' : 'rgba(147,197,253,.3)' }}>
              {streak}d
            </span>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginTop: 7 }}>
          {/* Tasks completed */}
          <div>
            <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#fff', lineHeight: 1 }}>
              {totalCompleted}
            </div>
            <div style={{ fontSize: '0.58rem', color: 'rgba(147,197,253,.5)', fontWeight: 600, marginTop: 2 }}>
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
            <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#fff', lineHeight: 1 }}>
              {focusHrs}h
            </div>
            <div style={{ fontSize: '0.58rem', color: 'rgba(147,197,253,.5)', fontWeight: 600, marginTop: 2 }}>
              focused
            </div>
          </div>
        </div>

        {/* Expanded section */}
        {expanded && (
          <div style={{ marginTop: 10, paddingTop: 9, borderTop: '1px solid rgba(255,255,255,.08)', display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.67rem', color: 'rgba(147,197,253,.5)', fontWeight: 600 }}>Best streak</span>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: bestStreak > 0 ? '#f59e0b' : 'rgba(255,255,255,.3)' }}>{bestStreak}d</span>
            </div>
            {streak === bestStreak && bestStreak > 1 && (
              <div style={{ fontSize: '0.62rem', color: '#10b981', fontWeight: 700, textAlign: 'center', marginTop: 2 }}>
                Personal best!
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
