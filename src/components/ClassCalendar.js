'use client'

/**
 * The coursework month — the main spread of the My Classes tab.
 *
 * The class cards answer "what is the state of Physics?". This answers the question
 * that crosses classes: *"what is coming at me, and when?"* — which the cards cannot,
 * because finding out that three things land on Thursday means opening five of them
 * and holding five lists in your head.
 *
 * Hand-rolled rather than a FullCalendar month view. FullCalendar is already in the
 * bundle for the calendar tab, but this is a read-only grid of *deadlines* with its own
 * chip design, an overdue treatment, and a selected-day strip — configuring and
 * re-theming a general calendar engine into that shape is more code than drawing seven
 * columns, and it would drag the whole tab into FullCalendar's styling surface.
 *
 * Deliberately month-only. Deadlines are sparse and monthly is the unit a syllabus is
 * planned in; a week view of coursework is what the class cards' "This week" filter
 * already is, and a day view of it is the Today page.
 */

import { useState, useMemo } from 'react'
import {
  ChevronLeft, ChevronRight, GraduationCap, BookOpen, CircleCheck, Circle, AlertCircle,
} from 'lucide-react'
import { monthGrid, groupByDate, isOverdue, describeDay } from '@/lib/classCalendar'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** How many chips fit in a cell before it collapses into "+n more". */
const CHIPS_PER_CELL = 3

const KIND_ICON = { exam: GraduationCap, assignment: BookOpen, task: CircleCheck }

function monthLabel(year, month) {
  return new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function longDay(dateStr) {
  return new Date(`${dateStr}T00:00:00`)
    .toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

// ── One item, as a chip in a day cell ─────────────────────────────────────────

function Chip({ item, overdue, onClick }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick?.(item) }}
      title={`${item.title}${item.className ? ` — ${item.className}` : ''}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 4, width: '100%',
        padding: '1px 4px', borderRadius: 4, border: 'none', cursor: 'pointer',
        fontFamily: 'inherit', fontSize: '0.65rem', fontWeight: 600, textAlign: 'left',
        background: hovered ? `${item.color}28` : `${item.color}14`,
        color: item.done ? 'var(--text-3)' : 'var(--text-2)',
        textDecoration: item.done ? 'line-through' : 'none',
        transition: 'background .12s',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span style={{
        width: 4, height: 4, borderRadius: '50%', flexShrink: 0,
        background: overdue ? 'var(--red)' : item.color,
      }} />
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {item.title}
      </span>
    </button>
  )
}

// ── One item, as a row in the selected-day strip ──────────────────────────────

function DayRow({ item, overdue, onClick, onToggle }) {
  const [hovered, setHovered] = useState(false)
  const Icon = KIND_ICON[item.kind] ?? Circle
  // An exam is not a thing you tick off; it happens to you.
  const tickable = item.kind !== 'exam'

  return (
    <div
      onClick={() => onClick?.(item)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px',
        borderRadius: 8, cursor: 'pointer', transition: 'background .12s',
        background: hovered ? 'var(--surface2)' : 'transparent',
      }}
    >
      {tickable ? (
        <button
          onClick={e => { e.stopPropagation(); onToggle?.(item) }}
          title={item.done ? 'Mark not done' : 'Mark done'}
          style={{
            flexShrink: 0, background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            display: 'flex', color: item.done ? item.color : 'var(--text-3)',
          }}
        >
          {item.done ? <CircleCheck size={15} /> : <Circle size={15} strokeWidth={1.5} />}
        </button>
      ) : (
        <Icon size={15} style={{ flexShrink: 0, color: item.color }} />
      )}

      <span style={{ width: 7, height: 7, borderRadius: '50%', background: item.color, flexShrink: 0 }} />

      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          display: 'block', fontSize: '0.8rem', fontWeight: 600, lineHeight: 1.3,
          color: item.done ? 'var(--text-3)' : 'var(--text)',
          textDecoration: item.done ? 'line-through' : 'none',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {item.title}
        </span>
        {item.className && (
          <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-3)', marginTop: 1 }}>
            {item.className}
          </span>
        )}
      </span>

      {overdue && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0, fontSize: '0.68rem', fontWeight: 700, color: 'var(--red)' }}>
          <AlertCircle size={11} /> Overdue
        </span>
      )}
    </div>
  )
}

// ── Calendar ──────────────────────────────────────────────────────────────────

export default function ClassCalendar({
  items = [],
  todayStr,
  onSelectItem,
  onToggleItem,
  isMobile = false,
}) {
  // Opens on the month containing today, then follows the user rather than snapping
  // back — paging to April and clicking a day should not jump home.
  const [cursor, setCursor] = useState(() => {
    const d = new Date(`${todayStr}T00:00:00`)
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  /* Not re-synced to `todayStr` when the date rolls over. The today-highlight and the
     overdue line follow the prop on their own, and yanking someone's selected day out
     from under them at midnight would be the calendar taking the click back. */
  const [selected, setSelected] = useState(todayStr)

  const byDate = useMemo(() => groupByDate(items), [items])
  const cells  = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor])

  function step(delta) {
    setCursor(({ year, month }) => {
      const d = new Date(year, month + delta, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }

  function goToday() {
    const d = new Date(`${todayStr}T00:00:00`)
    setCursor({ year: d.getFullYear(), month: d.getMonth() })
    setSelected(todayStr)
  }

  const selectedItems = selected ? (byDate.get(selected) ?? []) : []

  // Everything still outstanding in the month on screen — the number that says
  // whether this month is calm or brutal, which no single cell can.
  const monthOutstanding = useMemo(() => {
    const prefix = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}`
    return items.filter(i => i.date.startsWith(prefix) && !i.done).length
  }, [items, cursor])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>

      {/* ── Month nav ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <button
          onClick={() => step(-1)} aria-label="Previous month"
          style={navBtn}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}
        >
          <ChevronLeft size={15} />
        </button>
        <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em', minWidth: isMobile ? 0 : 150 }}>
          {monthLabel(cursor.year, cursor.month)}
        </span>
        <button
          onClick={() => step(1)} aria-label="Next month"
          style={navBtn}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}
        >
          <ChevronRight size={15} />
        </button>

        <button
          onClick={goToday}
          style={{
            padding: '3px 10px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
            fontSize: '0.72rem', fontWeight: 700, border: '1px solid var(--border)',
            background: 'var(--surface2)', color: 'var(--text-2)',
          }}
        >
          Today
        </button>

        {monthOutstanding > 0 && (
          <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-3)', flexShrink: 0 }}>
            {monthOutstanding} outstanding
          </span>
        )}
      </div>

      {/* ── Weekday header ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginBottom: 3 }}>
        {DAY_LABELS.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: '0.63rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '2px 0' }}>
            {isMobile ? d[0] : d}
          </div>
        ))}
      </div>

      {/* ── Month grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
        {cells.map(cell => {
          const dayItems = byDate.get(cell.date) ?? []
          const isToday    = cell.date === todayStr
          const isSelected = cell.date === selected
          const anyOverdue = dayItems.some(i => isOverdue(i, todayStr))
          const shown      = dayItems.slice(0, CHIPS_PER_CELL)
          const extra      = dayItems.length - shown.length

          return (
            <div
              key={cell.date}
              onClick={() => setSelected(cell.date)}
              title={describeDay(cell.date, dayItems)}
              style={{
                minHeight: isMobile ? 62 : 92,
                padding: 4, borderRadius: 8, cursor: 'pointer',
                display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden',
                border: isSelected ? '1.5px solid var(--blue)' : '1px solid var(--border)',
                background: cell.inMonth ? 'var(--surface)' : 'transparent',
                opacity: cell.inMonth ? 1 : 0.45,
                transition: 'border-color .12s, background .12s',
              }}
            >
              {/* Date number */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                <span style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 18, height: 18, borderRadius: '50%',
                  fontSize: '0.68rem', fontWeight: isToday ? 800 : 600,
                  background: isToday ? 'var(--blue)' : 'transparent',
                  color: isToday ? '#fff' : 'var(--text-2)',
                }}>
                  {cell.dayOfMonth}
                </span>
                {anyOverdue && (
                  <span title="Something here is overdue" style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--red)' }} />
                )}
              </div>

              {/* Chips. On a phone the cells are too small for text, so the day
                  collapses to a count and the strip below does the reading. */}
              {isMobile ? (
                dayItems.length > 0 && (
                  <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                    {dayItems.slice(0, 4).map(i => (
                      <span key={i.id} style={{
                        width: 5, height: 5, borderRadius: '50%',
                        background: isOverdue(i, todayStr) ? 'var(--red)' : i.color,
                        opacity: i.done ? 0.35 : 1,
                      }} />
                    ))}
                  </div>
                )
              ) : (
                <>
                  {shown.map(i => (
                    <Chip key={i.id} item={i} overdue={isOverdue(i, todayStr)} onClick={onSelectItem} />
                  ))}
                  {extra > 0 && (
                    <span style={{ fontSize: '0.63rem', fontWeight: 700, color: 'var(--text-3)', paddingLeft: 4 }}>
                      +{extra} more
                    </span>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* ── The selected day, in full ──
             This is what makes "+2 more" and the phone's dots readable, and it is
             where a day is actually worked rather than glanced at. */}
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 7 }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-2)' }}>
            {selected === todayStr ? 'Today' : longDay(selected)}
          </span>
          {selectedItems.length > 0 && (
            <span style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>
              {selectedItems.length} {selectedItems.length === 1 ? 'item' : 'items'}
            </span>
          )}
        </div>

        {selectedItems.length === 0 ? (
          <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--text-3)' }}>
            Nothing due{selected === todayStr ? ' today' : ' this day'}.
          </p>
        ) : (
          selectedItems.map(i => (
            <DayRow
              key={i.id}
              item={i}
              overdue={isOverdue(i, todayStr)}
              onClick={onSelectItem}
              onToggle={onToggleItem}
            />
          ))
        )}
      </div>
    </div>
  )
}

const navBtn = {
  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)',
  padding: 3, borderRadius: 6, display: 'flex', alignItems: 'center', flexShrink: 0,
  transition: 'color .12s',
}
