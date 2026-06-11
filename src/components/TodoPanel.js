'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Plus, Settings2, Bell, Link2, BookOpen, RefreshCw, ExternalLink, MoreHorizontal, EyeOff, Eye, GripVertical } from 'lucide-react'
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
  onToggle, onDelete, onAddClick, onEditClick, onCategoriesChange, onToggleSubtask, onReorder, fullPage,
  isMobile,
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
  // Mobile-only: which section to show ('both' | 'todos' | 'canvas')
  const [mobileView,       setMobileView]       = useState('both')

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
    // sortOrder takes priority when both items have it
    if (a.sortOrder != null && b.sortOrder != null) return a.sortOrder - b.sortOrder
    if (a.sortOrder != null) return -1
    if (b.sortOrder != null) return 1
    const ad = effectiveDate(a, events)
    const bd = effectiveDate(b, events)
    if (!ad && !bd) return 0
    if (!ad) return 1
    if (!bd) return -1
    return ad.localeCompare(bd)
  })

  const pendingCount = todos.filter(t => !t.completed).length
                     + canvasAssignments.filter(a => !a.done && !a.hidden).length

  // In the full-page todos view, show two-column layout (tasks left, Canvas right)
  // On mobile full-page: stacked layout with toggle bubbles instead
  // In the calendar sidebar (!fullPage), merge Canvas into the chronological list instead
  const hasCanvas  = canvasAssignments.length > 0
  const twoColumn  = !!fullPage && hasCanvas && !isMobile
  const mobileStack = !!fullPage && hasCanvas && !!isMobile

  // ── Shared sub-renders ──────────────────────────────────────────────────

  const todoListContent = (
    <div style={{ flex: 1, overflowY: 'auto', padding: fullPage ? '16px 28px 40px' : '8px 8px 16px' }}>
      {filtered.length === 0 && (twoColumn || canvasAssignments.filter(a => !a.hidden).length === 0) ? (
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
                            onToggle={handleToggle} onDelete={onDelete} onEdit={onEditClick}
                            onToggleSubtask={onToggleSubtask}
                            isMobile={isMobile} />
                ))}
              </ul>
            ) : (
              /* In sidebar mode (!fullPage, !twoColumn): merge Canvas inline chronologically */
              <DraggableList
                todos={filtered} events={events} todoCategories={todoCategories} canvasClasses={canvasClasses}
                todayStr={todayStr} onToggle={handleToggle} onDelete={onDelete} onEdit={onEditClick}
                canvasAssignments={!twoColumn && !fullPage ? canvasAssignments.filter(a => !a.hidden && !a.done) : []}
                onToggleCanvas={onToggleCanvas}
                onToggleSubtask={onToggleSubtask}
                onReorder={onReorder}
                isMobile={isMobile}
              />
            )
          )}

          {/* Canvas section: only in fullPage single-column mode (not sidebar, not two-column desktop, not mobile stack) */}
          {!twoColumn && !mobileStack && !!fullPage && canvasAssignments.length > 0 && (
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
  )

  const statusFilters = (
    <div style={{ display: 'flex', padding: fullPage ? '8px 24px' : '6px 8px', borderBottom: '1px solid var(--border)', gap: 2, flexShrink: 0 }}>
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
  )

  const categoryChips = todoCategories.length > 0 && (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: fullPage ? '10px 24px' : '8px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
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
  )

  // ── Mobile stacked layout ────────────────────────────────────────────────
  if (mobileStack) {
    const MOBILE_VIEWS = [
      { id: 'todos',  label: 'To-Do'  },
      { id: 'canvas', label: 'Canvas' },
      { id: 'both',   label: 'Both'   },
    ]
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', width: '100%' }}>

        {/* Header with toggle pills */}
        <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            {/* View toggle pills */}
            <div style={{ display: 'flex', gap: 6, background: 'var(--surface)', borderRadius: 999, padding: 3 }}>
              {MOBILE_VIEWS.map(v => (
                <button key={v.id} onClick={() => setMobileView(v.id)}
                        style={{
                          padding: '5px 14px', borderRadius: 999, border: 'none',
                          fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
                          background: mobileView === v.id ? 'var(--blue)' : 'transparent',
                          color:      mobileView === v.id ? '#fff'        : 'var(--text-3)',
                        }}>
                  {v.label}
                </button>
              ))}
            </div>
            {/* Actions */}
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => setShowCatMgr(true)} title="Manage categories"
                      style={{ padding: 6, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}>
                <Settings2 size={14} />
              </button>
              <button onClick={onAddClick}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--blue)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 600 }}>
                <Plus size={13} /> Add
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable content area */}
        <div style={{ flex: 1, overflowY: 'auto' }}>

          {/* To-Do section */}
          {(mobileView === 'todos' || mobileView === 'both') && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {statusFilters}
              {categoryChips}
              <div style={{ padding: '12px 16px 24px' }}>
                {filtered.length === 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 80 }}>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-3)', fontWeight: 500 }}>
                      {filter === 'done' ? 'No completed tasks yet.' : 'Nothing here — you\'re all clear!'}
                    </p>
                  </div>
                ) : filter === 'done' ? (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {filtered.map(todo => (
                      <TodoItem key={todo.id} todo={todo} events={events} canvasClasses={canvasClasses}
                                todoCategories={todoCategories} todayStr={todayStr}
                                onToggle={handleToggle} onDelete={onDelete} onEdit={onEditClick}
                                isMobile={isMobile} />
                    ))}
                  </ul>
                ) : (
                  <DraggableList
                    todos={filtered} events={events} todoCategories={todoCategories} canvasClasses={canvasClasses}
                    todayStr={todayStr} onToggle={handleToggle} onDelete={onDelete} onEdit={onEditClick}
                    canvasAssignments={[]}
                    onToggleCanvas={onToggleCanvas}
                    onToggleSubtask={onToggleSubtask}
                    onReorder={onReorder}
                    isMobile={isMobile}
                  />
                )}
              </div>
            </div>
          )}

          {/* Divider between sections when showing both */}
          {mobileView === 'both' && (
            <div style={{ height: 1, background: 'var(--border)', margin: '0 16px' }} />
          )}

          {/* Canvas section */}
          {(mobileView === 'canvas' || mobileView === 'both') && (
            <div style={{ padding: mobileView === 'both' ? '20px 16px 32px' : '0 0 32px' }}>
              {mobileView === 'both' && (
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>Canvas</div>
              )}
              <CanvasAssignmentsSection
                assignments={canvasAssignments}
                events={events}
                filter={filter}
                todayStr={todayStr}
                onToggle={onToggleCanvas}
                onEdit={onEditCanvas}
                onHide={onHideCanvas}
              />
            </div>
          )}
        </div>

        {showCatMgr && (
          <CategoryManager categories={todoCategories} onChange={onCategoriesChange} onClose={() => setShowCatMgr(false)} />
        )}
        {confetti && <Confetti key={confetti.key} priority={confetti.priority} x={confetti.x} y={confetti.y} />}
      </div>
    )
  }

  // ── Desktop / sidebar layout ─────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', width: '100%' }}>

      {/* ── Left column: todos ── */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: fullPage ? '16px 28px 14px' : '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
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

        {statusFilters}
        {categoryChips}
        {todoListContent}
      </div>{/* end left column */}

      {/* ── Right column: Canvas assignments (desktop two-column only) ── */}
      {twoColumn && (
        <>
          {/* Divider */}
          <div style={{ width: 1, background: 'var(--border)', flexShrink: 0 }} />

          {/* Canvas panel */}
          <div style={{ flex: '0 0 38%', minWidth: 300, maxWidth: 560, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Column header */}
            <div style={{ padding: '16px 28px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text)' }}>Canvas</span>
            </div>
            {/* Canvas list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px 32px' }}>
              <CanvasAssignmentsSection
                assignments={canvasAssignments}
                events={events}
                filter={filter}
                todayStr={todayStr}
                onToggle={onToggleCanvas}
                onEdit={onEditCanvas}
                onHide={onHideCanvas}
                compact
              />
            </div>
          </div>
        </>
      )}

      {showCatMgr && (
        <CategoryManager categories={todoCategories} onChange={onCategoriesChange} onClose={() => setShowCatMgr(false)} />
      )}
      {confetti && <Confetti key={confetti.key} priority={confetti.priority} x={confetti.x} y={confetti.y} />}
    </div>
  )
}

// ── Drag-and-drop reorderable list (wraps GroupedList rows) ──────────────────

function DraggableList({ todos, events, todoCategories, canvasClasses, todayStr, onToggle, onDelete, onEdit,
                         canvasAssignments, onToggleCanvas, onToggleSubtask, onReorder, isMobile }) {
  // We keep an internal order for smooth visual feedback; commit to parent on drop.
  const [localOrder, setLocalOrder] = useState(null) // null = use prop order
  const orderedTodos = localOrder || todos

  // Dragging state
  const dragIdRef    = useRef(null)
  const dragOverIdRef = useRef(null)

  function handleDragStart(id) {
    dragIdRef.current = id
  }

  function handleDragOver(id) {
    if (!dragIdRef.current || id === dragIdRef.current) return
    if (dragOverIdRef.current === id) return
    dragOverIdRef.current = id

    const fromIdx = orderedTodos.findIndex(t => t.id === dragIdRef.current)
    const toIdx   = orderedTodos.findIndex(t => t.id === id)
    if (fromIdx === -1 || toIdx === -1) return

    const next = [...orderedTodos]
    const [item] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, item)
    setLocalOrder(next)
  }

  function handleDrop() {
    if (!dragIdRef.current || !localOrder) { reset(); return }
    // Assign sortOrder values and notify parent
    const withOrder = localOrder.map((t, i) => ({ ...t, sortOrder: i }))
    onReorder?.(withOrder)
    setLocalOrder(null)
    reset()
  }

  function reset() {
    dragIdRef.current    = null
    dragOverIdRef.current = null
  }

  return (
    <GroupedList
      todos={orderedTodos}
      events={events}
      todoCategories={todoCategories}
      canvasClasses={canvasClasses}
      todayStr={todayStr}
      onToggle={onToggle}
      onDelete={onDelete}
      onEdit={onEdit}
      canvasAssignments={canvasAssignments}
      onToggleCanvas={onToggleCanvas}
      onToggleSubtask={onToggleSubtask}
      // drag callbacks
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      draggingId={dragIdRef.current}
      isMobile={isMobile}
    />
  )
}

// ── TodoItem with swipe (mobile) + drag handle (desktop) ────────────────────

function TodoItem({ todo, events, canvasClasses = [], todoCategories, todayStr, onToggle, onDelete, onEdit,
                   onToggleSubtask, onDragStart, onDragOver, onDrop, isDragging, isMobile }) {
  const [hovered,          setHovered]          = useState(false)
  const [justDone,         setJustDone]         = useState(false)
  const [subtasksExpanded, setSubtasksExpanded] = useState(false)

  // Swipe state (touch-only)
  const swipeRef    = useRef({ startX: 0, startY: 0, dx: 0, locked: null, active: false })
  const [swipeDx,   setSwipeDx]   = useState(0)   // current translate px
  const [swipeDone, setSwipeDone] = useState(false) // committed

  const SWIPE_THRESHOLD = 72   // px to trigger action
  const SWIPE_MAX       = 100  // clamp visual travel

  const cat        = todoCategories.find(c => c.id === todo.category)
  const linkedEv   = todo.linkedEventId ? events.find(e => e.id === todo.linkedEventId) : null
  const linkedClass = todo.linkedClassId ? canvasClasses.find(c => c.id === todo.linkedClassId) : null
  const effDate  = effectiveDate(todo, events)
  const isOverdue = effDate && effDate < todayStr && !todo.completed
  const isToday   = effDate === todayStr
  const dotColor  = todo.priority === 'high' ? '#ef4444' : todo.priority === 'medium' ? '#f59e0b' : 'var(--border)'

  // ── Touch handlers ──────────────────────────────────────────────────────
  function onTouchStart(e) {
    const t = e.touches[0]
    swipeRef.current = { startX: t.clientX, startY: t.clientY, dx: 0, locked: null, active: true }
  }

  function onTouchMove(e) {
    const s = swipeRef.current
    if (!s.active) return
    const t   = e.touches[0]
    const dx  = t.clientX - s.startX
    const dy  = t.clientY - s.startY

    // Lock axis after 6px of motion
    if (s.locked === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
      s.locked = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y'
    }

    if (s.locked === 'y') return // vertical scroll — do nothing

    // Horizontal swipe — prevent scroll
    e.preventDefault()
    s.dx = dx
    const clamped = Math.max(-SWIPE_MAX, Math.min(SWIPE_MAX, dx))
    setSwipeDx(clamped)
  }

  function onTouchEnd() {
    const s = swipeRef.current
    s.active = false
    const dx = s.dx
    if (s.locked !== 'x') { setSwipeDx(0); return }

    if (dx >= SWIPE_THRESHOLD && !todo.completed) {
      // Swipe right → complete (with confetti from center of item)
      setSwipeDone(true)
      setTimeout(() => {
        setSwipeDx(0)
        setSwipeDone(false)
        onToggle(todo.id, null)
      }, 260)
    } else if (dx <= -SWIPE_THRESHOLD) {
      // Swipe left → delete
      setSwipeDone(true)
      setTimeout(() => {
        setSwipeDx(0)
        setSwipeDone(false)
        onDelete(todo.id)
      }, 260)
    } else {
      // Snap back
      setSwipeDx(0)
    }
  }

  // ── Pointer drag handlers (desktop) ────────────────────────────────────
  function handlePointerDown(e) {
    // Only the drag handle triggers drag
    e.stopPropagation()
    onDragStart?.(todo.id)
  }

  const swipeLeft  = swipeDx < -8
  const swipeRight = swipeDx > 8

  return (
    <li
      onMouseEnter={() => !isMobile && setHovered(true)}
      onMouseLeave={() => !isMobile && setHovered(false)}
      onClick={() => onEdit?.(todo)}
      draggable={!!onDragStart && !isMobile}
      onDragStart={() => onDragStart?.(todo.id)}
      onDragOver={e => { e.preventDefault(); onDragOver?.(todo.id) }}
      onDrop={e => { e.preventDefault(); onDrop?.() }}
      onTouchStart={isMobile ? onTouchStart : undefined}
      onTouchMove={isMobile ? onTouchMove : undefined}
      onTouchEnd={isMobile ? onTouchEnd : undefined}
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 12,
        transition: swipeDone ? 'opacity 0.22s, transform 0.22s' : undefined,
        opacity: isDragging ? 0.45 : 1,
        cursor: onEdit ? 'pointer' : 'default',
      }}
    >
      {/* Swipe action backgrounds (mobile only) */}
      {isMobile && (
        <>
          {/* Right swipe: complete — green */}
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 12,
            background: '#10b981',
            display: 'flex', alignItems: 'center', paddingLeft: 16,
            opacity: swipeRight ? Math.min(1, swipeDx / SWIPE_THRESHOLD) : 0,
            transition: 'opacity .1s',
            pointerEvents: 'none',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          {/* Left swipe: delete — red */}
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 12,
            background: '#ef4444',
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 16,
            opacity: swipeLeft ? Math.min(1, -swipeDx / SWIPE_THRESHOLD) : 0,
            transition: 'opacity .1s',
            pointerEvents: 'none',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
          </div>
        </>
      )}

      {/* Main row — translated by swipe */}
      <div
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 8px',
          borderRadius: 12, transition: swipeDone ? 'transform 0.22s' : 'background .15s, box-shadow .15s, transform .15s',
          background: hovered ? 'var(--surface2)' : 'transparent',
          boxShadow: hovered ? 'var(--shadow-md)' : 'none',
          transform: isMobile
            ? (swipeDone
                ? `translateX(${swipeDx >= 0 ? '100%' : '-100%'})`
                : `translateX(${swipeDx}px)`)
            : (hovered ? 'translateY(-1px)' : 'none'),
        }}
      >
        {/* Drag handle (desktop only) */}
        {!isMobile && onDragStart && (
          <div
            onPointerDown={handlePointerDown}
            style={{
              marginTop: 4, color: 'var(--text-3)', cursor: 'grab', flexShrink: 0,
              opacity: hovered ? 0.6 : 0, transition: 'opacity .13s', touchAction: 'none',
            }}
            title="Drag to reorder"
          >
            <GripVertical size={13} />
          </div>
        )}

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
            {/* Subtask progress chip */}
            {todo.subtasks?.length > 0 && (() => {
              const doneCount = todo.subtasks.filter(s => s.completed).length
              const total = todo.subtasks.length
              return (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); setSubtasksExpanded(v => !v) }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: 999,
                    background: cat ? cat.color + '18' : 'var(--surface2)',
                    color: cat ? cat.color : 'var(--text-3)',
                    border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {doneCount}/{total} step{total !== 1 ? 's' : ''}
                  <svg width="8" height="8" viewBox="0 0 10 10" fill="currentColor" style={{ transform: subtasksExpanded ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
                    <path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                  </svg>
                </button>
              )
            })()}
          </div>

          {/* Expandable subtask checklist */}
          {subtasksExpanded && todo.subtasks?.length > 0 && (
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}
                 onClick={e => e.stopPropagation()}>
              {todo.subtasks.map(st => (
                <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <button
                    type="button"
                    onClick={() => onToggleSubtask?.(todo.id, st.id)}
                    style={{
                      flexShrink: 0, width: 16, height: 16, borderRadius: '50%',
                      border: 'none', background: 'none', cursor: 'pointer', padding: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: st.completed ? (cat?.color || 'var(--blue)') : 'var(--text-3)',
                      transition: 'color .15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = cat?.color || 'var(--blue)' }}
                    onMouseLeave={e => { e.currentTarget.style.color = st.completed ? (cat?.color || 'var(--blue)') : 'var(--text-3)' }}
                  >
                    {st.completed
                      ? <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                      : <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/></svg>}
                  </button>
                  <span style={{ fontSize: '0.78rem', color: st.completed ? 'var(--text-3)' : 'var(--text)', textDecoration: st.completed ? 'line-through' : 'none' }}>
                    {st.title}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Priority dot */}
        <div style={{ marginTop: 5, width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />

        {/* Delete (desktop hover) */}
        {!isMobile && (
          <button onClick={e => { e.stopPropagation(); onDelete(todo.id) }}
                  style={{ marginTop: 2, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', opacity: hovered ? 1 : 0, transition: 'opacity .13s, color .13s', padding: 2, borderRadius: 4, flexShrink: 0 }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}
      </div>
    </li>
  )
}

// Compact Canvas item row for use inside the merged GroupedList
function CanvasMiniItem({ a, onToggle }) {
  const [hovered, setHovered] = useState(false)
  const done = a.done || a.submissionState === 'graded' || a.submissionState === 'submitted'
  return (
    <li
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8,
        background: hovered ? 'var(--surface2)' : 'transparent', transition: 'background .12s',
        listStyle: 'none',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Canvas dot */}
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#E8751A', flexShrink: 0, marginTop: 1 }} />
      {/* Toggle */}
      <button
        onClick={() => onToggle?.(a.id)}
        style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                 color: done ? '#10b981' : 'var(--text-3)', display: 'flex' }}
      >
        {done
          ? <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          : <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/></svg>}
      </button>
      {/* Title */}
      <span style={{ flex: 1, fontSize: '0.78rem', color: done ? 'var(--text-3)' : 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: done ? 'line-through' : 'none' }}>
        {a.title}
      </span>
      {/* Course tag */}
      <span style={{ fontSize: '0.65rem', color: 'var(--text-3)', whiteSpace: 'nowrap', flexShrink: 0 }}>{a.courseName?.split(' ').slice(0,2).join(' ')}</span>
    </li>
  )
}

function GroupedList({ todos, events, todoCategories, canvasClasses = [], todayStr, onToggle, onDelete, onEdit,
                       // optional: merge Canvas assignments inline
                       canvasAssignments = [], onToggleCanvas, onToggleSubtask,
                       // drag callbacks passed through
                       onDragStart, onDragOver, onDrop, draggingId, isMobile }) {
  const [showFuture, setShowFuture] = useState(false)

  const weekStr = (() => {
    const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10)
  })()
  const twoWeekStr = (() => {
    const d = new Date(); d.setDate(d.getDate() + 14); return d.toISOString().slice(0, 10)
  })()

  // Visible Canvas items (not hidden, filtered by same filter as parent)
  const visibleCanvas = canvasAssignments.filter(a => !a.hidden)

  function canvasDateStr(a) { return a.dueAt ? a.dueAt.slice(0, 10) : null }

  const buckets = [
    {
      id: 'overdue', label: 'Overdue', accent: 'var(--red)',
      todos:  todos.filter(t => { const d = effectiveDate(t, events); return d && d < todayStr }),
      canvas: visibleCanvas.filter(a => { const d = canvasDateStr(a); return d && d < todayStr && !a.done }),
    },
    {
      id: 'today', label: 'Today', accent: 'var(--amber)',
      todos:  todos.filter(t => effectiveDate(t, events) === todayStr),
      canvas: visibleCanvas.filter(a => canvasDateStr(a) === todayStr),
    },
    {
      id: 'week', label: 'This Week', accent: 'var(--blue)',
      todos:  todos.filter(t => { const d = effectiveDate(t, events); return d && d > todayStr && d <= weekStr }),
      canvas: visibleCanvas.filter(a => { const d = canvasDateStr(a); return d && d > todayStr && d <= weekStr }),
    },
    {
      id: 'later', label: 'Next 2 Weeks', accent: 'var(--text-2)',
      todos:  todos.filter(t => { const d = effectiveDate(t, events); return d && d > weekStr && d <= twoWeekStr }),
      canvas: visibleCanvas.filter(a => { const d = canvasDateStr(a); return d && d > weekStr && d <= twoWeekStr }),
    },
    {
      id: 'future', label: 'Further Out', accent: 'var(--text-3)',
      todos:  todos.filter(t => { const d = effectiveDate(t, events); return d && d > twoWeekStr }),
      canvas: visibleCanvas.filter(a => { const d = canvasDateStr(a); return d && d > twoWeekStr }),
    },
    {
      id: 'none', label: 'No Date', accent: 'var(--text-3)',
      todos:  todos.filter(t => !effectiveDate(t, events)),
      canvas: visibleCanvas.filter(a => !canvasDateStr(a)),
    },
  ].filter(b => b.todos.length + b.canvas.length > 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {buckets.map((bucket, bi) => {
        const isFuture = bucket.id === 'future'
        const isVisible = !isFuture || showFuture
        const totalCount = bucket.todos.length + bucket.canvas.length
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
              <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-3)' }}>· {totalCount}</span>
              {isFuture && (
                <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: 'var(--text-3)', fontWeight: 600 }}>
                  {showFuture ? 'hide' : 'show'}
                </span>
              )}
            </div>
            {isVisible && (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                {bucket.todos.map(todo => (
                  <TodoItem key={todo.id} todo={todo} events={events} canvasClasses={canvasClasses}
                            todoCategories={todoCategories} todayStr={todayStr}
                            onToggle={onToggle} onDelete={onDelete} onEdit={onEdit}
                            onToggleSubtask={onToggleSubtask}
                            onDragStart={onDragStart}
                            onDragOver={onDragOver}
                            onDrop={onDrop}
                            isDragging={draggingId === todo.id}
                            isMobile={isMobile} />
                ))}
                {bucket.canvas.map(a => (
                  <CanvasMiniItem key={a.id} a={a} onToggle={onToggleCanvas} />
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
