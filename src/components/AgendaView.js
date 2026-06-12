'use client'

import { useMemo } from 'react'
import { CalendarDays, CheckSquare, BookOpen, Clock, MapPin, ListChecks } from 'lucide-react'

const DAYS_AHEAD = 14

/**
 * Returns a human-friendly day header: "Today", "Tomorrow", or "Monday Jun 16".
 */
function dayLabel(dateStr) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const d = new Date(dateStr + 'T00:00:00')
  if (d.getTime() === today.getTime()) return 'Today'
  if (d.getTime() === tomorrow.getTime()) return 'Tomorrow'
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

/**
 * Format a timed ISO string to "9:00 AM" or "9:00 AM – 10:30 AM".
 */
function formatTimeRange(start, end) {
  const opts = { hour: 'numeric', minute: '2-digit', hour12: true }
  const s = new Date(start).toLocaleTimeString('en-US', opts)
  if (!end) return s
  const e = new Date(end).toLocaleTimeString('en-US', opts)
  return `${s} – ${e}`
}

/**
 * AgendaView — condensed 14-day chronological list of everything.
 *
 * Props:
 *   events            — user calendar events (already expanded / visible)
 *   todos             — all user todos
 *   canvasAssignments — Canvas assignments array
 *   canvasClassEvents — expanded recurring class schedule instances
 *   todoCategories    — [{id, label, color}]
 *   eventCategories   — [{id, label, color}]
 *   customLists       — custom list array (for due-date entries)
 *   onEventClick(event)             — opens EventModal
 *   onTodoClick(todo)               — opens AddTodoModal
 *   onCanvasClick(assignment)       — opens canvas detail modal
 *   onCustomListClick(listId)       — navigates to that custom list
 *   isMobile
 */
export default function AgendaView({
  events = [],
  todos = [],
  canvasAssignments = [],
  canvasClassEvents = [],
  todoCategories = [],
  eventCategories = [],
  customLists = [],
  onEventClick,
  onTodoClick,
  onCanvasClick,
  onCustomListClick,
  isMobile = false,
}) {
  // Build a flat list of agenda items with a normalized dateStr for grouping
  const items = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const endDate = new Date(today)
    endDate.setDate(endDate.getDate() + DAYS_AHEAD)
    endDate.setHours(23, 59, 59, 999)

    const result = []

    // ── User events ──────────────────────────────────────────────────────────
    for (const ev of events) {
      if (!ev.start) continue
      const start = new Date(ev.start)
      if (start < today || start > endDate) continue
      const dateStr = ev.start.slice(0, 10)
      const catColor = eventCategories.find(c => c.id === ev.extendedProps?.category)?.color || ev.color || 'var(--blue)'
      result.push({
        type: 'event',
        id: ev.id,
        dateStr,
        sortKey: ev.start,
        allDay: !!ev.allDay,
        title: ev.title || 'Untitled event',
        subtitle: ev.allDay
          ? (ev.extendedProps?.notes || null)
          : formatTimeRange(ev.start, ev.end),
        color: ev.color || catColor,
        location: ev.extendedProps?.notes || null,
        raw: ev,
      })
    }

    // ── Class schedule instances ─────────────────────────────────────────────
    for (const ev of canvasClassEvents) {
      if (!ev.start) continue
      const start = new Date(ev.start)
      if (start < today || start > endDate) continue
      const dateStr = ev.start.slice(0, 10)
      result.push({
        type: 'class',
        id: ev.id,
        dateStr,
        sortKey: ev.start,
        allDay: false,
        title: ev.title || 'Class',
        subtitle: formatTimeRange(ev.start, ev.end),
        color: ev.color || '#3a6fa8',
        location: ev.extendedProps?.location || null,
        professor: ev.extendedProps?.professor || null,
        raw: ev,
      })
    }

    // ── Todos with due dates ─────────────────────────────────────────────────
    for (const todo of todos) {
      if (todo.completed || !todo.dueDate) continue
      const due = new Date(todo.dueDate + 'T00:00:00')
      if (due < today || due > endDate) continue
      const catColor = todoCategories.find(c => c.id === todo.category)?.color || '#94a3b8'
      result.push({
        type: 'todo',
        id: todo.id,
        dateStr: todo.dueDate,
        sortKey: todo.dueDate + 'T23:59:00', // todos sort last within their day
        allDay: true,
        title: todo.title || 'Untitled task',
        subtitle: todoCategories.find(c => c.id === todo.category)?.label || null,
        color: catColor,
        priority: todo.priority,
        raw: todo,
      })
    }

    // ── Canvas assignments ───────────────────────────────────────────────────
    for (const a of canvasAssignments) {
      if (a.done || a.hidden || !a.dueAt) continue
      const due = new Date(a.dueAt)
      if (due < today || due > endDate) continue
      const dateStr = a.dueAt.slice(0, 10)
      result.push({
        type: 'canvas',
        id: a.id,
        dateStr,
        sortKey: a.dueAt,
        allDay: false,
        title: a.title || 'Assignment',
        subtitle: a.courseName || 'Canvas',
        color: '#E8751A',
        raw: a,
      })
    }

    // ── Custom list due dates ────────────────────────────────────────────────
    for (const list of customLists) {
      const accent       = list.color || '#3a6fa8'
      const items        = list.items ?? []
      const totalCount   = items.length
      const checkedCount = items.filter(i => i.checked).length
      const isComplete   = totalCount > 0 && checkedCount === totalCount

      // List-level due date (only when not fully complete)
      if (list.dueDate && !isComplete) {
        const due = new Date(list.dueDate + 'T00:00:00')
        if (due >= today && due <= endDate) {
          result.push({
            type: 'custom-list',
            id: `list-${list.id}`,
            listId: list.id,
            dateStr: list.dueDate,
            sortKey: list.dueDate + 'T23:59:00',
            allDay: true,
            title: list.name,
            subtitle: `${checkedCount}/${totalCount} items`,
            color: accent,
            raw: list,
          })
        }
      }

      // Item-level due dates (unchecked items only)
      for (const item of items) {
        if (item.checked || !item.dueDate) continue
        const due = new Date(item.dueDate + 'T00:00:00')
        if (due < today || due > endDate) continue
        result.push({
          type: 'custom-list-item',
          id: `listitem-${list.id}-${item.id}`,
          listId: list.id,
          dateStr: item.dueDate,
          sortKey: item.dueDate + 'T23:59:00',
          allDay: true,
          title: item.text,
          subtitle: list.name,
          color: accent,
          raw: item,
        })
      }
    }

    // Sort: by date+time, then allDay items at end of each day
    result.sort((a, b) => {
      if (a.dateStr !== b.dateStr) return a.dateStr.localeCompare(b.dateStr)
      // allDay items after timed items
      if (a.allDay !== b.allDay) return a.allDay ? 1 : -1
      return a.sortKey.localeCompare(b.sortKey)
    })

    return result
  }, [events, todos, canvasAssignments, canvasClassEvents, todoCategories, eventCategories, customLists])

  // Group by dateStr
  const grouped = useMemo(() => {
    const map = new Map()
    for (const item of items) {
      if (!map.has(item.dateStr)) map.set(item.dateStr, [])
      map.get(item.dateStr).push(item)
    }
    return Array.from(map.entries()) // [[dateStr, items[]], ...]
  }, [items])

  function handleItemClick(item) {
    if (item.type === 'event') onEventClick?.(item.raw)
    else if (item.type === 'todo') onTodoClick?.(item.raw)
    else if (item.type === 'canvas') onCanvasClick?.(item.raw)
    else if (item.type === 'custom-list' || item.type === 'custom-list-item') onCustomListClick?.(item.listId)
    // class events are read-only (match existing behavior)
  }

  const priorityColors = { high: '#ef4444', medium: '#f59e0b', low: '#10b981' }

  if (grouped.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--text-3)', padding: 40 }}>
        <CalendarDays size={40} style={{ opacity: 0.3 }} />
        <div style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-2)' }}>Nothing in the next 14 days</div>
        <div style={{ fontSize: '0.78rem', textAlign: 'center', maxWidth: 260 }}>
          Add events, tasks with due dates, or connect Canvas to see upcoming items here.
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '12px 8px 80px' : '16px 20px 32px', display: 'flex', flexDirection: 'column', gap: 0 }}>
      {grouped.map(([dateStr, dayItems]) => (
        <div key={dateStr} style={{ marginBottom: 20 }}>
          {/* Day header */}
          <div style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            padding: '6px 0 8px',
            background: 'var(--bg)',
            display: 'flex',
            alignItems: 'baseline',
            gap: 8,
          }}>
            <span style={{
              fontSize: '0.82rem',
              fontWeight: 800,
              color: dateStr === new Date().toISOString().slice(0, 10) ? 'var(--blue-text)' : 'var(--text)',
              letterSpacing: '0.01em',
            }}>
              {dayLabel(dateStr)}
            </span>
            <span style={{ fontSize: '0.66rem', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              {dayItems.length} item{dayItems.length !== 1 ? 's' : ''}
            </span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)', marginLeft: 4 }} />
          </div>

          {/* Items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {dayItems.map(item => (
              <button
                key={`${item.type}-${item.id}`}
                onClick={() => handleItemClick(item)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: '10px 14px',
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  cursor: (item.type === 'class') ? 'default' : 'pointer',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                  width: '100%',
                  transition: 'background 0.12s, border-color 0.12s',
                  position: 'relative',
                  overflow: 'hidden',
                }}
                onMouseEnter={e => {
                  if (item.type !== 'class') {
                    e.currentTarget.style.background = 'var(--surface2)'
                    e.currentTarget.style.borderColor = item.color + '88'
                  }
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'var(--surface)'
                  e.currentTarget.style.borderColor = 'var(--border)'
                }}
              >
                {/* Color stripe */}
                <div style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 3,
                  background: item.color,
                  borderRadius: '12px 0 0 12px',
                }} />

                {/* Icon */}
                <div style={{
                  flexShrink: 0,
                  marginTop: 1,
                  width: 26,
                  height: 26,
                  borderRadius: 8,
                  background: item.color + '1a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginLeft: 4,
                }}>
                  {item.type === 'todo' && <CheckSquare size={13} style={{ color: item.color }} />}
                  {item.type === 'canvas' && <BookOpen size={13} style={{ color: item.color }} />}
                  {(item.type === 'event' || item.type === 'class') && <CalendarDays size={13} style={{ color: item.color }} />}
                  {(item.type === 'custom-list' || item.type === 'custom-list-item') && <ListChecks size={13} style={{ color: item.color }} />}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: '0.86rem',
                      fontWeight: 700,
                      color: 'var(--text)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: '100%',
                    }}>
                      {item.title}
                    </span>
                    {/* Priority dot for todos */}
                    {item.type === 'todo' && item.priority && item.priority !== 'low' && (
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: priorityColors[item.priority] || '#94a3b8',
                        flexShrink: 0,
                        display: 'inline-block',
                      }} />
                    )}
                  </div>

                  {/* Subtitle row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 3, flexWrap: 'wrap' }}>
                    {!item.allDay && item.subtitle && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.74rem', color: 'var(--text-3)', fontWeight: 600 }}>
                        <Clock size={10} />
                        {item.subtitle}
                      </span>
                    )}
                    {item.allDay && item.subtitle && (
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-3)', fontWeight: 500 }}>
                        {item.subtitle}
                      </span>
                    )}
                    {item.location && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.72rem', color: 'var(--text-3)' }}>
                        <MapPin size={9} />
                        {item.location}
                      </span>
                    )}
                    {item.professor && (
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>
                        Prof. {item.professor}
                      </span>
                    )}
                  </div>
                </div>

                {/* Type badge */}
                <div style={{
                  flexShrink: 0,
                  fontSize: '0.62rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: item.color,
                  background: item.color + '1a',
                  padding: '2px 7px',
                  borderRadius: 999,
                  alignSelf: 'flex-start',
                  marginTop: 2,
                }}>
                  {item.type === 'event' ? 'Event'
                    : item.type === 'todo' ? 'Task'
                    : item.type === 'canvas' ? 'Canvas'
                    : item.type === 'custom-list' ? 'List'
                    : item.type === 'custom-list-item' ? 'List Item'
                    : 'Class'}
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
