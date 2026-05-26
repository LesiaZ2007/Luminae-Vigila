'use client'

import { useState, useEffect } from 'react'
import { Plus, Settings2, Bell, Link2, BookOpen, RefreshCw, ExternalLink, MoreHorizontal, EyeOff, Eye } from 'lucide-react'
import CategoryManager from '@/components/CategoryManager'
import Confetti from '@/components/Confetti'

const FILTERS = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'today',    label: 'Today'    },
  { id: 'all',      label: 'All'      },
  { id: 'done',     label: 'Done'     },
]

export default function TodoPanel({
  todos, events, todoCategories,
  onToggle, onDelete, onAddClick, onEditClick, onCategoriesChange, fullPage,
  // Canvas props (all optional)
  canvasAssignments = [],
  canvasClasses     = [],
  onToggleCanvas,
  onEditCanvas,
  onHideCanvas,
}) {
  const [filter,           setFilter]           = useState('upcoming')
  const [activeCategories, setActiveCategories] = useState([]) // empty = all
  const [showCatMgr,       setShowCatMgr]       = useState(false)
  const [confetti,         setConfetti]         = useState(null) // { key, priority }

  function handleToggle(id, e) {
    const todo = todos.find(t => t.id === id)
    if (todo && !todo.completed && e) {
      const rect = e.currentTarget.getBoundingClientRect()
      const key  = Date.now()
      setConfetti({ key, priority: todo.priority, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
      setTimeout(() => setConfetti(null), 2000)
    }
    onToggle(id)
  }

  const todayStr = new Date().toISOString().slice(0, 10)

  const filtered = todos.filter(t => {
    if (filter === 'done')     return t.completed
    if (filter === 'today')    return !t.completed && t.dueDate === todayStr
    if (filter === 'upcoming') return !t.completed
    return true
  }).filter(t =>
    activeCategories.length === 0 || activeCategories.includes(t.category)
  ).sort((a, b) => {
    const ad = effectiveDate(a, events)
    const bd = effectiveDate(b, events)
    if (!ad && !bd) return 0
    if (!ad) return 1
    if (!bd) return -1
    return ad.localeCompare(bd)
  })

  const pendingCount = todos.filter(t => !t.completed).length
                     + canvasAssignments.filter(a => !a.done && !a.hidden).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', maxWidth: fullPage ? 640 : undefined, width: '100%', margin: fullPage ? '0 auto' : undefined }}>

      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text)' }}>To-Do</span>
          {pendingCount > 0 && (
            <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: 'var(--blue-bg)', color: 'var(--blue-text)' }}>
              {pendingCount}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => setShowCatMgr(true)} title="Manage categories"
                  style={{ padding: 6, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', transition: 'color .15s' }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}>
            <Settings2 size={14} />
          </button>
          <button onClick={onAddClick}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--blue)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 600 }}>
            <Plus size={13} /> Add
          </button>
        </div>
      </div>

      {/* Status filters */}
      <div style={{ display: 'flex', padding: '6px 8px', borderBottom: '1px solid var(--border)', gap: 2, flexShrink: 0 }}>
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
                  style={{
                    flex: 1, padding: '6px 4px', borderRadius: 8, border: 'none',
                    fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .13s',
                    background: filter === f.id ? 'var(--blue-bg)' : 'transparent',
                    color: filter === f.id ? 'var(--blue-text)' : 'var(--text-3)',
                  }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Category filter chips */}
      {todoCategories.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {todoCategories.map(cat => {
            const active = activeCategories.includes(cat.id)
            return (
              <button key={cat.id} onClick={() => setActiveCategories(prev =>
                prev.includes(cat.id) ? prev.filter(id => id !== cat.id) : [...prev, cat.id]
              )}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px',
                        borderRadius: 999, border: active ? `1.5px solid ${cat.color}` : '1.5px solid transparent',
                        background: active ? cat.color + '18' : 'var(--surface2)',
                        color: active ? cat.color : 'var(--text-3)',
                        fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                        transition: 'all .13s', whiteSpace: 'nowrap',
                      }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: cat.color }} />
                {cat.label}
              </button>
            )
          })}
        </div>
      )}

      {/* List — grouped by date bucket */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px 16px' }}>
        {filtered.length === 0 && canvasAssignments.filter(a => !a.hidden).length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 100 }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-3)', fontWeight: 500 }}>
              {filter === 'done' ? 'No completed tasks yet.' : 'Nothing here — you\'re all clear!'}
            </p>
          </div>
        ) : (
          <>
            {filtered.length > 0 && (
              filter === 'done' ? (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {filtered.map(todo => (
                    <TodoItem key={todo.id} todo={todo} events={events} canvasClasses={canvasClasses}
                              todoCategories={todoCategories} todayStr={todayStr}
                              onToggle={handleToggle} onDelete={onDelete} onEdit={onEditClick} />
                  ))}
                </ul>
              ) : (
                <GroupedList todos={filtered} events={events} todoCategories={todoCategories} canvasClasses={canvasClasses}
                             todayStr={todayStr} onToggle={handleToggle} onDelete={onDelete} onEdit={onEditClick} />
              )
            )}

            {/* ── Canvas Assignments section ── */}
            {canvasAssignments.length > 0 && (
              <CanvasAssignmentsSection
                assignments={canvasAssignments}
                events={events}
                filter={filter}
                todayStr={todayStr}
                onToggle={onToggleCanvas}
                onEdit={onEditCanvas}
                onHide={onHideCanvas}
              />
            )}
          </>
        )}
      </div>

      {showCatMgr && (
        <CategoryManager categories={todoCategories} onChange={onCategoriesChange} onClose={() => setShowCatMgr(false)} />
      )}
      {confetti && <Confetti key={confetti.key} priority={confetti.priority} x={confetti.x} y={confetti.y} />}
    </div>
  )
}

function TodoItem({ todo, events, canvasClasses = [], todoCategories, todayStr, onToggle, onDelete, onEdit }) {
  const [hovered,   setHovered]   = useState(false)
  const [justDone,  setJustDone]  = useState(false)
  const cat        = todoCategories.find(c => c.id === todo.category)
  const linkedEv   = todo.linkedEventId ? events.find(e => e.id === todo.linkedEventId) : null
  const linkedClass = todo.linkedClassId ? canvasClasses.find(c => c.id === todo.linkedClassId) : null
  const effDate  = effectiveDate(todo, events)
  const isOverdue = effDate && effDate < todayStr && !todo.completed
  const isToday   = effDate === todayStr
  const dotColor  = todo.priority === 'high' ? '#ef4444' : todo.priority === 'medium' ? '#f59e0b' : 'var(--border)'

  return (
    <li onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
        onClick={() => onEdit?.(todo)}
        style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 8px', borderRadius: 12, transition: 'background .15s, box-shadow .15s, transform .15s', background: hovered ? 'var(--surface2)' : 'transparent', boxShadow: hovered ? 'var(--shadow-md)' : 'none', transform: hovered ? 'translateY(-1px)' : 'none', cursor: onEdit ? 'pointer' : 'default' }}>

      {/* Checkbox */}
      <button onClick={e => { e.stopPropagation(); if (!todo.completed) setJustDone(true); onToggle(todo.id, e) }}
              style={{ marginTop: 2, width: 18, height: 18, borderRadius: '50%', border: `2px solid ${todo.completed ? 'var(--blue)' : cat?.color || 'var(--border)'}`, background: todo.completed ? 'var(--blue)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, transition: 'all .2s', animation: justDone ? 'check-bounce 0.32s ease forwards' : 'none' }}>
        {todo.completed && (
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
            <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: '0.875rem', fontWeight: 500, lineHeight: 1.35, color: todo.completed ? 'var(--text-3)' : 'var(--text)', textDecoration: todo.completed ? 'line-through' : 'none', margin: 0 }}>
          {todo.title}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 4 }}>
          {cat && (
            <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: cat.color + '18', color: cat.color }}>
              {cat.label}
            </span>
          )}
          {effDate && (
            <span style={{ fontSize: '0.68rem', fontWeight: 600, color: isOverdue ? '#ef4444' : isToday ? '#f59e0b' : 'var(--text-3)' }}>
              {isOverdue ? '⚠ Overdue · ' : isToday ? '◉ Today · ' : ''}{fmtDate(effDate)}
            </span>
          )}
          {!todo.completed && (() => {
            const d = daysUntil(effDate)
            return d >= 1 && d <= 6
              ? <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,.1)', borderRadius: 999, padding: '2px 7px' }}>
                  due in {d} day{d !== 1 ? 's' : ''}
                </span>
              : null
          })()}
          {todo.recurrence && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.68rem', fontWeight: 600, color: 'var(--blue-text)' }}>
              <RefreshCw size={9} />
              {todo.recurrence.type === 'daily' ? 'Daily' : todo.recurrence.type === 'weekly' ? 'Weekly' : 'Repeating'}
            </span>
          )}
          {linkedEv && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.68rem', fontWeight: 600, color: '#8b5cf6' }}>
              <Link2 size={9} /> {linkedEv.title}
            </span>
          )}
          {linkedClass && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.68rem', fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: linkedClass.color + '22', color: linkedClass.color }}>
              <BookOpen size={9} /> {linkedClass.courseName}
            </span>
          )}
          {todo.reminder && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.68rem', color: 'var(--text-3)' }}>
              <Bell size={9} /> {todo.reminder.label}
            </span>
          )}
        </div>
      </div>

      {/* Priority dot */}
      <div style={{ marginTop: 5, width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />

      {/* Delete */}
      <button onClick={e => { e.stopPropagation(); onDelete(todo.id) }}
              style={{ marginTop: 2, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', opacity: hovered ? 1 : 0, transition: 'opacity .13s, color .13s', padding: 2, borderRadius: 4, flexShrink: 0 }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </li>
  )
}

function GroupedList({ todos, events, todoCategories, canvasClasses = [], todayStr, onToggle, onDelete, onEdit }) {
  const [showFuture, setShowFuture] = useState(false)

  const weekStr = (() => {
    const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10)
  })()
  const twoWeekStr = (() => {
    const d = new Date(); d.setDate(d.getDate() + 14); return d.toISOString().slice(0, 10)
  })()

  const buckets = [
    { id: 'overdue', label: 'Overdue',        accent: 'var(--red)',    items: todos.filter(t => { const d = effectiveDate(t, events); return d && d < todayStr }) },
    { id: 'today',   label: 'Today',          accent: 'var(--amber)',  items: todos.filter(t => effectiveDate(t, events) === todayStr) },
    { id: 'week',    label: 'This Week',      accent: 'var(--blue)',   items: todos.filter(t => { const d = effectiveDate(t, events); return d && d > todayStr && d <= weekStr }) },
    { id: 'later',   label: 'Next 2 Weeks',   accent: 'var(--text-2)', items: todos.filter(t => { const d = effectiveDate(t, events); return d && d > weekStr && d <= twoWeekStr }) },
    { id: 'future',  label: 'Further Out',    accent: 'var(--text-3)', items: todos.filter(t => { const d = effectiveDate(t, events); return d && d > twoWeekStr }) },
    { id: 'none',    label: 'No Date',        accent: 'var(--text-3)', items: todos.filter(t => !effectiveDate(t, events)) },
  ].filter(b => b.items.length > 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {buckets.map((bucket, bi) => {
        const isFuture = bucket.id === 'future'
        const isVisible = !isFuture || showFuture
        return (
          <div key={bucket.id}>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 8px 4px', marginTop: bi > 0 ? 6 : 0, cursor: isFuture ? 'pointer' : 'default' }}
              onClick={isFuture ? () => setShowFuture(v => !v) : undefined}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: bucket.accent, flexShrink: 0 }} />
              <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: bucket.accent }}>
                {bucket.label}
              </span>
              <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-3)' }}>· {bucket.items.length}</span>
              {isFuture && (
                <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: 'var(--text-3)', fontWeight: 600 }}>
                  {showFuture ? '▲ hide' : '▼ show'}
                </span>
              )}
            </div>
            {isVisible && (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                {bucket.items.map(todo => (
                  <TodoItem key={todo.id} todo={todo} events={events} canvasClasses={canvasClasses}
                            todoCategories={todoCategories} todayStr={todayStr}
                            onToggle={onToggle} onDelete={onDelete} onEdit={onEdit} />
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}

function daysUntil(dateStr) {
  if (!dateStr) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.round((new Date(dateStr + 'T00:00:00') - today) / 86_400_000)
}

/* ─────────────────── Canvas Assignments Section ─────────────────── */

function stripHtml(html) {
  if (!html) return ''
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function fmtDateShort(isoStr) {
  if (!isoStr) return ''
  return new Date(isoStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function CanvasAssignmentsSection({ assignments, events, filter, todayStr, onToggle, onEdit, onHide }) {
  const [expanded,      setExpanded]      = useState(true)
  const [showHidden,    setShowHidden]    = useState(false)
  const [openMenuId,    setOpenMenuId]    = useState(null)

  // Apply filter
  const visible = assignments.filter(a => {
    if (a.hidden && !showHidden) return false
    const dueDateStr = a.dueAt ? a.dueAt.slice(0, 10) : null
    if (filter === 'done')     return a.done
    if (filter === 'today')    return !a.done && dueDateStr === todayStr
    if (filter === 'upcoming') return !a.done
    return true  // 'all'
  })

  const hiddenCount = assignments.filter(a => a.hidden).length

  if (visible.length === 0 && hiddenCount === 0) return null

  // Group by courseName
  const courseMap = {}
  for (const a of visible) {
    if (!courseMap[a.courseName]) courseMap[a.courseName] = []
    courseMap[a.courseName].push(a)
  }
  // Sort within each course by dueAt (nulls last)
  for (const arr of Object.values(courseMap)) {
    arr.sort((a, b) => {
      if (!a.dueAt && !b.dueAt) return 0
      if (!a.dueAt) return 1
      if (!b.dueAt) return -1
      return a.dueAt.localeCompare(b.dueAt)
    })
  }

  return (
    <div style={{ marginTop: 12 }}>
      {/* Section header */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 8px 6px', cursor: 'pointer' }}
        onClick={() => setExpanded(v => !v)}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" fill="#E8751A"/>
          <text x="12" y="16.5" textAnchor="middle" fill="white" fontSize="13" fontWeight="bold" fontFamily="serif">C</text>
        </svg>
        <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#E8751A' }}>
          Canvas Assignments
        </span>
        <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-3)' }}>
          · {visible.filter(a => !a.hidden).length}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: 'var(--text-3)', fontWeight: 600 }}>
          {expanded ? '▲ hide' : '▼ show'}
        </span>
      </div>

      {expanded && (
        <div>
          {Object.entries(courseMap).map(([courseName, items]) => (
            <div key={courseName} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', padding: '2px 8px 4px', marginTop: 4 }}>
                {courseName}
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                {items.map(a => (
                  <CanvasAssignmentItem
                    key={a.id}
                    assignment={a}
                    events={events}
                    todayStr={todayStr}
                    menuOpen={openMenuId === a.id}
                    onMenuToggle={() => setOpenMenuId(p => p === a.id ? null : a.id)}
                    onMenuClose={() => setOpenMenuId(null)}
                    onToggle={onToggle}
                    onEdit={onEdit}
                    onHide={onHide}
                  />
                ))}
              </ul>
            </div>
          ))}

          {/* Show/hide hidden footer */}
          {hiddenCount > 0 && (
            <button
              onClick={() => setShowHidden(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 8px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontFamily: 'inherit', fontSize: '0.7rem', fontWeight: 600, borderRadius: 7, transition: 'color .13s' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text-2)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}
            >
              {showHidden ? <EyeOff size={11}/> : <Eye size={11}/>}
              {showHidden ? `Hide hidden (${hiddenCount})` : `Show hidden (${hiddenCount})`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function CanvasAssignmentItem({ assignment: a, events, todayStr, menuOpen, onMenuToggle, onMenuClose, onToggle, onEdit, onHide }) {
  const [hovered, setHovered] = useState(false)
  const dueDateStr = a.dueAt ? a.dueAt.slice(0, 10) : null
  const isOverdue  = dueDateStr && dueDateStr < todayStr && !a.done
  const isToday    = dueDateStr === todayStr
  const linkedEv   = a.linkedEventId ? events?.find(e => e.id === a.linkedEventId) : null
  const descPlain  = stripHtml(a.description).slice(0, 100)

  // Grade badge
  const showGrade  = a.submissionState === 'graded' && a.score != null && a.pointsPossible
  const gradeLabel = showGrade ? `${a.score}/${a.pointsPossible}` : null

  return (
    <li
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); }}
      onClick={() => onEdit?.(a)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 8px', borderRadius: 12,
        transition: 'background .15s, box-shadow .15s, transform .15s',
        background: hovered ? 'var(--surface2)' : 'transparent',
        boxShadow: hovered ? 'var(--shadow-md)' : 'none',
        transform: hovered ? 'translateY(-1px)' : 'none',
        cursor: 'pointer',
        opacity: a.hidden ? 0.5 : 1,
      }}
    >
      {/* Checkbox */}
      <button
        onClick={e => { e.stopPropagation(); onToggle?.(a.id) }}
        style={{
          marginTop: 2, width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
          border: `2px solid ${a.done ? '#E8751A' : 'rgba(232,117,26,.45)'}`,
          background: a.done ? '#E8751A' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', transition: 'all .2s',
        }}
      >
        {a.done && (
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
            <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: '0.875rem', fontWeight: 500, lineHeight: 1.35, color: a.done ? 'var(--text-3)' : 'var(--text)', textDecoration: a.done ? 'line-through' : 'none', margin: 0 }}>
          {a.title}
        </p>
        {descPlain && !a.done && (
          <p style={{ fontSize: '0.68rem', color: 'var(--text-3)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {descPlain}
          </p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 4 }}>
          {dueDateStr && (
            <span style={{ fontSize: '0.68rem', fontWeight: 600, color: isOverdue ? '#ef4444' : isToday ? '#f59e0b' : 'var(--text-3)' }}>
              {isOverdue ? '⚠ Overdue · ' : isToday ? '◉ Today · ' : ''}{fmtDateShort(dueDateStr)}
            </span>
          )}
          {showGrade && (
            <span style={{ fontSize: '0.67rem', fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: 'rgba(16,185,129,.12)', color: '#10b981' }}>
              {gradeLabel}
            </span>
          )}
          {a.submissionState === 'submitted' && !a.done && (
            <span style={{ fontSize: '0.67rem', fontWeight: 600, color: 'rgba(99,179,237,.7)' }}>Submitted</span>
          )}
          {linkedEv && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.68rem', fontWeight: 600, color: '#8b5cf6' }}>
              <Link2 size={9} /> {linkedEv.title}
            </span>
          )}
        </div>
      </div>

      {/* Right actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 2, flexShrink: 0 }}>
        {/* Canvas external link */}
        {a.htmlUrl && (
          <a
            href={a.htmlUrl} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            title="Open in Canvas"
            style={{ padding: 4, borderRadius: 6, color: 'rgba(232,117,26,.5)', display: 'flex', transition: 'color .13s', opacity: hovered ? 1 : 0 }}
            onMouseEnter={e => e.currentTarget.style.color = 'rgba(232,117,26,.9)'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(232,117,26,.5)'}
          >
            <ExternalLink size={11} />
          </a>
        )}

        {/* ··· menu */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={e => { e.stopPropagation(); onMenuToggle() }}
            style={{ padding: 4, borderRadius: 6, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-3)', opacity: hovered || menuOpen ? 1 : 0, transition: 'opacity .13s, color .13s', display: 'flex' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}
          >
            <MoreHorizontal size={13} />
          </button>
          {menuOpen && (
            <div
              onClick={e => e.stopPropagation()}
              style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow-modal)', zIndex: 100, minWidth: 130, overflow: 'hidden' }}
            >
              <button
                onClick={() => { onHide?.(a.id); onMenuClose() }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem', color: 'var(--text-2)', textAlign: 'left', transition: 'background .12s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                {a.hidden ? <Eye size={12}/> : <EyeOff size={12}/>}
                {a.hidden ? 'Unhide' : 'Hide assignment'}
              </button>
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

function effectiveDate(todo, events) {
  if (todo.dueDate) return todo.dueDate
  if (todo.linkedEventId) {
    const ev = events?.find(e => e.id === todo.linkedEventId)
    return ev?.start?.slice(0, 10) || null
  }
  return null
}

function fmtDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
