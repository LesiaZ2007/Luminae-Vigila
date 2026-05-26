'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function isSameWeek(dateA, dateB) {
  if (!dateA || !dateB) return false
  const sundayA = new Date(dateA); sundayA.setDate(sundayA.getDate() - sundayA.getDay()); sundayA.setHours(0,0,0,0)
  const sundayB = new Date(dateB); sundayB.setDate(sundayB.getDate() - sundayB.getDay()); sundayB.setHours(0,0,0,0)
  return sundayA.getTime() === sundayB.getTime()
}

export default function MiniMonthCalendar({ currentDate, highlightWeekOf, onDayClick }) {
  const today = new Date(); today.setHours(0,0,0,0)
  const [viewDate, setViewDate] = useState(() => {
    const d = new Date(currentDate || today)
    d.setDate(1); d.setHours(0,0,0,0)
    return d
  })

  // Build the grid: first Sunday on or before the 1st, fill 35 or 42 cells
  function buildGrid(firstOfMonth) {
    const first = new Date(firstOfMonth)
    first.setDate(1)
    const startDay = first.getDay() // 0=Sun
    const start = new Date(first)
    start.setDate(1 - startDay)

    const cells = []
    const cur = new Date(start)
    const weeks = startDay + new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth() + 1, 0).getDate() > 35 ? 6 : 5
    for (let i = 0; i < weeks * 7; i++) {
      cells.push(new Date(cur))
      cur.setDate(cur.getDate() + 1)
    }
    return cells
  }

  function prevMonth() {
    setViewDate(d => { const n = new Date(d); n.setMonth(n.getMonth() - 1); return n })
  }
  function nextMonth() {
    setViewDate(d => { const n = new Date(d); n.setMonth(n.getMonth() + 1); return n })
  }

  const cells = buildGrid(viewDate)
  const viewMonth = viewDate.getMonth()
  const viewYear  = viewDate.getFullYear()
  const monthLabel = viewDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })

  return (
    <div style={{
      width: '100%',
      background: 'rgba(0,0,0,0.12)',
      borderRadius: 12,
      padding: '8px 6px 6px',
      userSelect: 'none',
    }}>
      {/* Header: prev / month-year / next */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, padding: '0 2px' }}>
        <button
          onClick={prevMonth}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(147,197,253,.5)', padding: '2px 4px', borderRadius: 5, display: 'flex', alignItems: 'center', lineHeight: 1 }}
          onMouseEnter={e => e.currentTarget.style.color = 'rgba(147,197,253,.9)'}
          onMouseLeave={e => e.currentTarget.style.color = 'rgba(147,197,253,.5)'}
        >
          <ChevronLeft size={12} />
        </button>
        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'rgba(255,255,255,.6)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          {monthLabel}
        </span>
        <button
          onClick={nextMonth}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(147,197,253,.5)', padding: '2px 4px', borderRadius: 5, display: 'flex', alignItems: 'center', lineHeight: 1 }}
          onMouseEnter={e => e.currentTarget.style.color = 'rgba(147,197,253,.9)'}
          onMouseLeave={e => e.currentTarget.style.color = 'rgba(147,197,253,.5)'}
        >
          <ChevronRight size={12} />
        </button>
      </div>

      {/* Day-of-week header row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 2 }}>
        {DAY_LABELS.map((d, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: '0.55rem', fontWeight: 700, color: 'rgba(147,197,253,.35)', letterSpacing: '0.03em', padding: '1px 0' }}>
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px 0' }}>
        {cells.map((date, idx) => {
          const isCurrentMonth = date.getMonth() === viewMonth && date.getFullYear() === viewYear
          const isToday        = date.getTime() === today.getTime()
          const isWeekHighlight = highlightWeekOf && isSameWeek(date, highlightWeekOf)
          const dateStr = date.toISOString().slice(0, 10)

          return (
            <button
              key={idx}
              onClick={() => onDayClick?.(dateStr)}
              title={dateStr}
              style={{
                background: isWeekHighlight ? 'rgba(147,197,253,.12)' : 'transparent',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                padding: '3px 0',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(147,197,253,.22)' }}
              onMouseLeave={e => { e.currentTarget.style.background = isWeekHighlight ? 'rgba(147,197,253,.12)' : 'transparent' }}
            >
              <span style={{
                fontSize: '0.6rem',
                fontWeight: isToday ? 800 : 500,
                color: isToday
                  ? '#93c5fd'
                  : isCurrentMonth
                  ? 'rgba(255,255,255,.65)'
                  : 'rgba(255,255,255,.2)',
                lineHeight: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 16, height: 16, borderRadius: '50%',
                background: isToday ? 'rgba(147,197,253,.22)' : 'transparent',
              }}>
                {date.getDate()}
              </span>
              {/* Today dot */}
              {isToday && (
                <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#93c5fd', display: 'block' }} />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
