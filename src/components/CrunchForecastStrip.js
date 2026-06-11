'use client'

/**
 * CrunchForecastStrip — a slim 14-day density bar above the calendar.
 *
 * One cell per day: weekday initial + intensity-coloured block.
 * Intensity = count of:
 *   - todos due that day (not completed)
 *   - Canvas assignments due that day (not done/hidden)
 *   - exam events that day
 *
 * Colors use var(--blue) at increasing opacities so all 6 accent themes work.
 * Clicking a day navigates the calendar to that date (via onDayClick).
 * Collapsible via a small toggle; collapsed state persists in localStorage.
 */

import { useState, useMemo, useEffect, useRef } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

function todayLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

const DAY_INITIALS = ['S','M','T','W','T','F','S']

// Map a load count to a CSS opacity value (0 = faint neutral, higher = accent)
function loadOpacity(count) {
  if (count === 0) return 0
  if (count === 1) return 0.18
  if (count === 2) return 0.38
  if (count === 3) return 0.58
  return 0.82 // 4+
}

export default function CrunchForecastStrip({
  events = [],
  todos = [],
  canvasAssignments = [],
  isMobile = false,
  onDayClick,          // (dateStr) => void
}) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('lv-crunch-collapsed') === '1' } catch { return false }
  })
  const [tooltip, setTooltip] = useState(null) // { dateStr, x, y, label }
  const stripRef = useRef(null)

  function toggleCollapse() {
    setCollapsed(v => {
      const next = !v
      try { localStorage.setItem('lv-crunch-collapsed', next ? '1' : '0') } catch {}
      return next
    })
  }

  // Build 14-day window starting from today
  const days = useMemo(() => {
    const today = todayLocal()
    return Array.from({ length: 14 }, (_, i) => {
      const dateStr = addDays(today, i)
      const d = new Date(dateStr + 'T12:00:00')
      return { dateStr, dow: d.getDay(), dayNum: d.getDate() }
    })
  }, [])

  // Count load for each day
  const dayLoads = useMemo(() => {
    const counts = {}

    // Todos due
    for (const t of todos) {
      if (t.completed || !t.dueDate) continue
      if (counts[t.dueDate] === undefined) counts[t.dueDate] = { tasks: 0, exams: 0, canvas: 0 }
      counts[t.dueDate].tasks++
    }

    // Canvas assignments due
    for (const a of canvasAssignments) {
      if (a.done || a.hidden || !a.dueAt) continue
      const date = a.dueAt.slice(0, 10)
      if (!counts[date]) counts[date] = { tasks: 0, exams: 0, canvas: 0 }
      counts[date].canvas++
    }

    // Exam events
    for (const ev of events) {
      if (!ev.start) continue
      const cat = ev.extendedProps?.category
      if (cat !== 'exam') continue
      const date = ev.start.slice(0, 10)
      if (!counts[date]) counts[date] = { tasks: 0, exams: 0, canvas: 0 }
      counts[date].exams++
    }

    return counts
  }, [events, todos, canvasAssignments])

  const today = todayLocal()

  if (isMobile) {
    // On mobile: collapsed by default, show just the strip row without the toggle label
    return (
      <div style={{
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        flexShrink: 0,
        overflow: 'hidden',
      }}>
        {!collapsed && (
          <div style={{ padding: '4px 6px 5px', display: 'flex', gap: 2 }}>
            {days.map(({ dateStr, dow, dayNum }) => {
              const load = dayLoads[dateStr] ?? { tasks: 0, exams: 0, canvas: 0 }
              const total = load.tasks + load.exams + load.canvas
              const isToday = dateStr === today
              const opacity = loadOpacity(total)

              return (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => onDayClick?.(dateStr)}
                  style={{
                    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                    padding: '3px 0',
                    borderRadius: 6,
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    minWidth: 0,
                  }}
                >
                  <span style={{ fontSize: '0.55rem', fontWeight: 700, color: isToday ? 'var(--blue)' : 'var(--text-3)', textTransform: 'uppercase' }}>
                    {DAY_INITIALS[dow]}
                  </span>
                  <div style={{
                    width: '100%',
                    height: 14,
                    borderRadius: 4,
                    background: total > 0
                      ? `rgba(var(--blue-rgb, 58,111,168), ${opacity})`
                      : 'var(--border)',
                    position: 'relative',
                    border: isToday ? '1.5px solid var(--blue)' : '1.5px solid transparent',
                    transition: 'background .15s',
                    // Fallback: use the CSS variable directly
                    ...(total > 0 && { background: `color-mix(in srgb, var(--blue) ${Math.round(opacity * 100)}%, transparent)` }),
                  }} />
                  {load.exams > 0 && (
                    <span style={{ fontSize: '0.45rem', color: '#ef4444', fontWeight: 800, lineHeight: 1 }}>!</span>
                  )}
                </button>
              )
            })}
          </div>
        )}
        <button
          type="button"
          onClick={toggleCollapse}
          style={{
            width: '100%', padding: '2px 8px', border: 'none', background: 'transparent',
            color: 'var(--text-3)', fontFamily: 'inherit', fontSize: '0.6rem', fontWeight: 600,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
            borderTop: collapsed ? 'none' : '1px solid var(--border)',
          }}
        >
          {collapsed ? <><ChevronDown size={10} /> 14-day forecast</> : <ChevronUp size={10} />}
        </button>
      </div>
    )
  }

  // Desktop: full strip with labels
  return (
    <div
      ref={stripRef}
      style={{
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        flexShrink: 0,
        position: 'relative',
        overflow: 'visible',
      }}
    >
      {/* Header row */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: collapsed ? '5px 14px' : '5px 14px 0',
      }}>
        <span style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)' }}>
          14-day crunch forecast
        </span>
        <button
          type="button"
          onClick={toggleCollapse}
          style={{
            border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer',
            padding: '2px 4px', borderRadius: 4, display: 'flex', alignItems: 'center',
            fontSize: '0.68rem', fontWeight: 600, fontFamily: 'inherit', gap: 3,
          }}
          title={collapsed ? 'Expand forecast' : 'Collapse forecast'}
        >
          {collapsed ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
        </button>
      </div>

      {!collapsed && (
        <div style={{ padding: '4px 14px 7px', display: 'flex', gap: 3, alignItems: 'flex-end' }}>
          {days.map(({ dateStr, dow, dayNum }) => {
            const load = dayLoads[dateStr] ?? { tasks: 0, exams: 0, canvas: 0 }
            const total = load.tasks + load.exams + load.canvas
            const isToday = dateStr === today
            const opacity = loadOpacity(total)

            // Tooltip label
            function buildLabel() {
              const parts = []
              if (load.tasks > 0)  parts.push(`${load.tasks} task${load.tasks !== 1 ? 's' : ''} due`)
              if (load.canvas > 0) parts.push(`${load.canvas} assignment${load.canvas !== 1 ? 's' : ''} due`)
              if (load.exams > 0)  parts.push(`${load.exams} exam${load.exams !== 1 ? 's' : ''}`)
              return parts.length > 0 ? parts.join(' · ') : 'Nothing due'
            }

            return (
              <button
                key={dateStr}
                type="button"
                onClick={() => onDayClick?.(dateStr)}
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  const stripRect = stripRef.current?.getBoundingClientRect()
                  setTooltip({
                    dateStr,
                    label: buildLabel(),
                    x: rect.left - (stripRect?.left ?? 0) + rect.width / 2,
                    y: rect.top - (stripRect?.top ?? 0),
                  })
                }}
                onMouseLeave={() => setTooltip(null)}
                style={{
                  flex: 1,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  padding: '2px 1px 2px',
                  borderRadius: 6,
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  minWidth: 0,
                  transition: 'background .12s',
                }}
                onFocus={(e) => e.currentTarget.style.outline = '2px solid var(--blue-ring)'}
                onBlur={(e) => e.currentTarget.style.outline = 'none'}
                title={buildLabel()}
              >
                {/* Weekday initial */}
                <span style={{
                  fontSize: '0.58rem', fontWeight: 700,
                  color: isToday ? 'var(--blue)' : 'var(--text-3)',
                  textTransform: 'uppercase',
                  lineHeight: 1,
                }}>
                  {DAY_INITIALS[dow]}
                </span>

                {/* Density block */}
                <div style={{
                  width: '100%',
                  height: 18,
                  borderRadius: 5,
                  background: total > 0
                    ? `color-mix(in srgb, var(--blue) ${Math.round(opacity * 100)}%, transparent)`
                    : 'color-mix(in srgb, var(--text-3) 12%, transparent)',
                  border: isToday
                    ? '1.5px solid var(--blue)'
                    : '1.5px solid transparent',
                  transition: 'background .15s',
                  position: 'relative',
                }}>
                  {/* Exam exclamation dot */}
                  {load.exams > 0 && (
                    <div style={{
                      position: 'absolute', top: 2, right: 3,
                      width: 4, height: 4, borderRadius: '50%',
                      background: '#ef4444',
                    }} />
                  )}
                </div>

                {/* Day number */}
                <span style={{
                  fontSize: '0.58rem',
                  fontWeight: isToday ? 800 : 500,
                  color: isToday ? 'var(--blue)' : 'var(--text-3)',
                  lineHeight: 1,
                }}>
                  {dayNum}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            left: tooltip.x,
            transform: 'translateX(-50%)',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '5px 10px',
            fontSize: '0.72rem',
            fontWeight: 600,
            color: 'var(--text)',
            whiteSpace: 'nowrap',
            boxShadow: 'var(--shadow-md)',
            zIndex: 50,
            pointerEvents: 'none',
          }}
        >
          {tooltip.label}
        </div>
      )}
    </div>
  )
}
