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

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import {
  ChevronLeft, ChevronRight, GraduationCap, BookOpen, CircleCheck, Circle, AlertCircle, X,
} from 'lucide-react'
import {
  monthGrid, groupByDate, isOverdue, describeDay,
  bigAssignmentCutoffs, dayLoad, loadLevel, canReschedule, LOAD_LABELS,
  overdueItems, upcomingDays, nextDateAfter, addDays,
} from '@/lib/classCalendar'
import TaskActionMenu from '@/components/TaskActionMenu'
import useAnchoredPosition from '@/lib/useAnchoredPosition'

/** How far ahead "coming up" looks, in days including today. */
const HORIZON_DAYS = 7

/**
 * How heavy a day looks.
 *
 * A single warm hue at rising alpha, not a red-to-green ramp: red already means
 * *overdue* on this grid, and a second red meaning "busy" would make an ordinary busy
 * Thursday read as a crisis. The tints stay faint because the chips carry the class
 * colours on top of them and have to stay legible.
 */
const LOAD_TINT = {
  none:   'transparent',
  light:  'rgba(245,158,11,.07)',
  medium: 'rgba(245,158,11,.15)',
  heavy:  'rgba(245,158,11,.26)',
}

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

/** "Today" / "Tomorrow" / "Fri, Mar 6" — the nearest days earn their own words. */
function relativeDay(dateStr, todayStr) {
  if (dateStr === todayStr) return 'Today'
  const t = new Date(`${todayStr}T00:00:00`)
  t.setDate(t.getDate() + 1)
  const pad = n => String(n).padStart(2, '0')
  const tomorrow = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`
  if (dateStr === tomorrow) return 'Tomorrow'
  return new Date(`${dateStr}T00:00:00`)
    .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// ── One item, as a chip in a day cell ─────────────────────────────────────────

function Chip({ item, overdue, onClick, onDragStart, onDragEnd, dragging }) {
  const [hovered, setHovered] = useState(false)
  const draggable = canReschedule(item)
  return (
    <button
      /* The element goes up with the item so a menu can anchor to this very chip
         rather than to the pointer — a menu that grows out of the thing you clicked
         is much easier to connect to it on a dense grid. */
      onClick={e => { e.stopPropagation(); onClick?.(item, e.currentTarget) }}
      draggable={draggable}
      onDragStart={draggable ? e => { e.stopPropagation(); onDragStart?.(item, e) } : undefined}
      onDragEnd={draggable ? () => onDragEnd?.() : undefined}
      title={`${item.title}${item.className ? ` — ${item.className}` : ''}${draggable ? ' · drag to move' : ''}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 5, width: '100%',
        padding: '2px 5px', borderRadius: 4, border: 'none', cursor: 'pointer',
        fontFamily: 'inherit', fontSize: '0.65rem', fontWeight: 700, textAlign: 'left',
        /* A solid spine in the class colour plus a wash of it. The 4px dot this
           replaced was too small to read a hue from at a glance, which is the one
           job the colour has on a month grid. */
        borderLeft: `3px solid ${item.color}`,
        background: hovered ? `${item.color}3d` : `${item.color}24`,
        color: item.done ? 'var(--text-3)' : overdue ? 'var(--red)' : 'var(--text)',
        textDecoration: item.done ? 'line-through' : 'none',
        transition: 'background .12s, opacity .12s',
        opacity: dragging ? 0.4 : 1,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
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
      onClick={e => onClick?.(item, e.currentTarget)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px',
        borderRadius: 8, cursor: 'pointer', transition: 'background .12s',
        borderLeft: `3px solid ${item.color}`,
        background: hovered ? `${item.color}1f` : `${item.color}0d`,
        marginBottom: 3,
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

      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          display: 'block', fontSize: '0.8rem', fontWeight: 600, lineHeight: 1.3,
          color: item.done ? 'var(--text-3)' : 'var(--text)',
          textDecoration: item.done ? 'line-through' : 'none',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {item.title}
        </span>
        {/* The spine already says which class this is in colour; the name says it in
            words, at a contrast that survives a lime course. */}
        {item.className && (
          <span style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-3)', marginTop: 1 }}>
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

// ── One day, floating above the grid ──────────────────────────────────────────

/**
 * The day you clicked, over the calendar rather than under it.
 *
 * Clicking a day already filled the strip at the bottom of the tab, but on anything
 * shorter than a tall desktop that strip is below the fold — you clicked Thursday and
 * nothing appeared to happen. It is worse on a phone, where the cells are colour dots
 * and the strip is the *only* thing that names them.
 *
 * So the day also opens here, anchored to its own cell. The strip still follows the same
 * selected date, so nothing is lost when this is dismissed and the two never disagree.
 */
function DayPanel({ date, anchor, items, todayStr, onClickItem, onToggleItem, onClose }) {
  const popupRef = useRef(null)
  const triggerRef = useMemo(() => ({
    current: anchor ? { getBoundingClientRect: () => anchor } : null,
  }), [anchor])
  const pos = useAnchoredPosition(!!anchor, triggerRef, popupRef, { minWidth: 280, align: 'center' })

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); onClose?.() } }
    function onDown(e) { if (!popupRef.current?.contains(e.target)) onClose?.() }
    document.addEventListener('keydown', onKey)
    // Deferred past the click that opened it — see TaskActionMenu for the same guard.
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 0)
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [onClose])

  if (!anchor) return null

  return (
    <div
      ref={popupRef}
      role="dialog"
      aria-label={longDay(date)}
      onClick={e => e.stopPropagation()}
      style={{
        position: 'fixed', zIndex: 9000,
        top: pos.top, left: pos.left, width: pos.width,
        /* The hook caps this when the day cannot have its full height on the better
           side; a long Thursday then scrolls inside the panel rather than running off
           the screen. */
        maxHeight: pos.maxHeight ?? '60vh',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 14, boxShadow: 'var(--shadow-modal)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        animation: 'lvPopIn .16s cubic-bezier(0.22,1,0.36,1) both',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
        padding: '10px 12px', borderBottom: '1px solid var(--border)',
      }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text)' }}>
          {relativeDay(date, todayStr)}
        </span>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>
          {items.length === 0 ? 'nothing due' : `${items.length} ${items.length === 1 ? 'item' : 'items'}`}
        </span>
        <button
          onClick={onClose} aria-label="Close day"
          style={{
            marginLeft: 'auto', background: 'none', border: 'none', padding: 4,
            borderRadius: 6, cursor: 'pointer', color: 'var(--text-3)', display: 'flex',
          }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}
        >
          <X size={14} />
        </button>
      </div>

      {/* No empty-state line: the header already says "nothing due", and saying it
          twice in a panel this small reads as a bug. An empty day is just a header. */}
      {items.length > 0 && (
        <div style={{ overflowY: 'auto', padding: '8px 8px 10px' }}>
          {items.map(i => (
            <DayRow key={i.id} item={i} overdue={isOverdue(i, todayStr)}
                    onClick={onClickItem} onToggle={onToggleItem} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Calendar ──────────────────────────────────────────────────────────────────

export default function ClassCalendar({
  items = [],
  legend = [],
  assignments = [],
  todayStr,
  onSelectItem,
  onToggleItem,
  onDeleteItem,
  onReschedule,
  // Off while anything is open above the calendar, so ← / → don't page the month
  // underneath a modal. Same contract as WeeklyCalendar's prop of the same name.
  arrowNavEnabled = true,
  isMobile = false,
}) {
  // Opens on the month containing today, then follows the user rather than snapping
  // back — paging to April and clicking a day should not jump home.
  const [cursor, setCursor] = useState(() => {
    const d = new Date(`${todayStr}T00:00:00`)
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  /* `null` means no day has been singled out, which is the resting state: the strip
     then shows the week ahead rather than one day. A single day was too narrow a
     default under a grid showing a whole month — "nothing due today" is a poor answer
     when the useful one is that two things land tomorrow. */
  const [selected, setSelected] = useState(null)

  /* The item being dragged, and the day under the cursor. Held in state rather than
     read off the drop event because the cell needs to light up *during* the drag. */
  const [dragItem, setDragItem] = useState(null)
  const [dragOver, setDragOver] = useState(null)

  /* The task whose little menu is open, and where to put it:
     { item, anchor }. See TaskActionMenu. */
  const [taskMenu, setTaskMenu] = useState(null)

  /* Which day is floating above the grid, and the cell it grew out of:
     { date, anchor }. The strip at the bottom follows the same `selected` date, so the
     day is readable whether you are looking at the grid or the strip — the panel is
     what makes it readable *without scrolling past the whole month first.* */
  const [dayPanel, setDayPanel] = useState(null)

  /* Which half of the slide is playing: 'exit-left' | 'exit-right' | 'enter-left' |
     'enter-right' | null. Two phases rather than one, so the outgoing month leaves in
     the direction you pushed it and the new one arrives from the other side — the same
     shape and the same `.cal-nav-*` classes the main calendar's swipe already uses. */
  const [navAnim, setNavAnim] = useState(null)
  const animTimer = useRef(null)
  const touchStart = useRef(null)
  const wheelLocked = useRef(false)
  const wheelTimer  = useRef(null)

  useEffect(() => () => { clearTimeout(animTimer.current); clearTimeout(wheelTimer.current) }, [])

  const byDate  = useMemo(() => groupByDate(items), [items])
  const cells   = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor])
  const cutoffs = useMemo(() => bigAssignmentCutoffs(assignments), [assignments])

  function handleDrop(dateStr) {
    const item = dragItem
    setDragItem(null)
    setDragOver(null)
    // Dropping a task back where it started is a no-op, not an edit — it should not
    // stamp updatedAt and wake the sync for nothing.
    if (!item || !canReschedule(item) || item.date === dateStr) return
    onReschedule?.(item, dateStr)
  }

  /**
   * Page a month, animated.
   *
   * The month used to change on the same frame as the click, which reads as a flicker
   * rather than a movement — nothing tells you whether you went forwards or back. So:
   * the grid leaves in the direction you pushed it, the content swaps at the midpoint
   * while it is faded out, and the new month arrives from the other side. Timings match
   * the main calendar's swipe (140ms out, 260ms in) because these are the same gesture
   * in two places and should not feel like two different apps.
   *
   * A floating day panel is dismissed on the way — it belongs to a cell in the month
   * that is leaving, and leaving it pinned over a different month is nonsense.
   */
  const step = useCallback(delta => {
    if (!delta) return
    clearTimeout(animTimer.current)
    setDayPanel(null)
    setTaskMenu(null)
    setNavAnim(delta > 0 ? 'exit-left' : 'exit-right')

    animTimer.current = setTimeout(() => {
      setCursor(({ year, month }) => {
        const d = new Date(year, month + delta, 1)
        return { year: d.getFullYear(), month: d.getMonth() }
      })
      setNavAnim(delta > 0 ? 'enter-right' : 'enter-left')
      animTimer.current = setTimeout(() => setNavAnim(null), 260)
    }, 140)
  }, [])

  function goToday() {
    const d = new Date(`${todayStr}T00:00:00`)
    setCursor(cur => {
      // Only animate when it is actually a different month; "Today" pressed twice
      // should sit still rather than flash.
      const delta = (d.getFullYear() - cur.year) * 12 + (d.getMonth() - cur.month)
      if (delta !== 0) setNavAnim(delta > 0 ? 'enter-right' : 'enter-left')
      return { year: d.getFullYear(), month: d.getMonth() }
    })
    animTimer.current = setTimeout(() => setNavAnim(null), 260)
    setSelected(null)
    setDayPanel(null)
  }

  /* ── Swipe and trackpad ───────────────────────────────────────────────────
     Lifted from WeeklyCalendar: a horizontal drag of at least 60px pages the month, a
     mostly-vertical one is left alone so the tab can still scroll. The trackpad lock
     stops one flick of a momentum-scrolling wheel from skipping three months. */
  function handleTouchStart(e) {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }

  function handleTouchEnd(e) {
    if (!touchStart.current) return
    const dx = e.changedTouches[0].clientX - touchStart.current.x
    const dy = e.changedTouches[0].clientY - touchStart.current.y
    touchStart.current = null
    if (Math.abs(dy) > Math.abs(dx) || Math.abs(dx) < 60) return
    step(dx < 0 ? 1 : -1)
  }

  const handleWheel = useCallback(e => {
    if (Math.abs(e.deltaX) < Math.abs(e.deltaY)) return
    if (Math.abs(e.deltaX) < 30) return
    if (wheelLocked.current) return
    wheelLocked.current = true
    clearTimeout(wheelTimer.current)
    wheelTimer.current = setTimeout(() => { wheelLocked.current = false }, 600)
    step(e.deltaX > 0 ? 1 : -1)
  }, [step])

  /* ── Arrow-key navigation ─────────────────────────────────────────────────
     ← / → page the month, same as the chevrons and the same animation. Guards copied
     from WeeklyCalendar: modifier combos belong to the browser and to text selection,
     and a form field's own caret movement must win. */
  useEffect(() => {
    if (!arrowNavEnabled) return

    function onKeyDown(e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return

      const el  = e.target
      const tag = el?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || el?.isContentEditable) return

      e.preventDefault()
      step(e.key === 'ArrowRight' ? 1 : -1)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [arrowNavEnabled, step])

  const selectedItems = selected ? (byDate.get(selected) ?? []) : []

  /**
   * What clicking an item does.
   *
   * A task answers with a menu — done / edit / delete — because ticking off is what
   * most clicks want and the edit form made it the expensive option, while delete
   * wasn't reachable from this grid at all. Assignments and exams keep going straight
   * to their existing detail views: there is nothing to tick off on an exam, and an
   * assignment's own view already carries its actions.
   */
  function clickItem(item, el) {
    if (item.kind !== 'task') { onSelectItem?.(item); return }
    setTaskMenu({ item, anchor: el?.getBoundingClientRect?.() ?? null })
  }

  /** Open a day above the grid, or close it if it was already the open one. */
  function clickDay(dateStr, el) {
    setTaskMenu(null)
    setSelected(d => (d === dateStr ? null : dateStr))
    setDayPanel(p => (p?.date === dateStr ? null : { date: dateStr, anchor: el?.getBoundingClientRect?.() ?? null }))
  }

  // The resting view: what is late, then the next week, day by day.
  const late     = useMemo(() => overdueItems(items, todayStr), [items, todayStr])
  const upcoming = useMemo(() => upcomingDays(items, todayStr, HORIZON_DAYS), [items, todayStr])
  const beyond   = useMemo(
    () => (upcoming.length === 0 ? nextDateAfter(items, addDays(todayStr, HORIZON_DAYS)) : null),
    [items, todayStr, upcoming.length],
  )

  // Everything still outstanding in the month on screen — the number that says
  // whether this month is calm or brutal, which no single cell can.
  const monthOutstanding = useMemo(() => {
    const prefix = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}`
    return items.filter(i => i.date.startsWith(prefix) && !i.done).length
  }, [items, cursor])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}
         onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} onWheel={handleWheel}>

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

      {/* ── Month grid ──
             The slide classes are the calendar tab's, verbatim — see globals.css. Only
             the grid moves: the weekday header and the nav are fixed furniture, and
             sliding them too would make the whole tab lurch. */}
      <div className={navAnim ? `cal-nav-${navAnim}` : undefined}
           style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
        {cells.map(cell => {
          const dayItems = byDate.get(cell.date) ?? []
          const isToday    = cell.date === todayStr
          const isSelected = cell.date === selected
          const anyOverdue = dayItems.some(i => isOverdue(i, todayStr))
          const shown      = dayItems.slice(0, CHIPS_PER_CELL)
          const extra      = dayItems.length - shown.length
          const level      = loadLevel(dayLoad(dayItems, cutoffs))
          const isDropZone = dragOver === cell.date

          return (
            <div
              key={cell.date}
              onClick={e => clickDay(cell.date, e.currentTarget)}
              title={describeDay(cell.date, dayItems, cutoffs)}
              /* Every cell is a drop target while a task is in the air. preventDefault
                 on dragOver is what actually permits the drop — without it the browser
                 refuses and the task springs back. */
              onDragOver={dragItem ? e => { e.preventDefault(); setDragOver(cell.date) } : undefined}
              onDragLeave={dragItem ? () => setDragOver(d => (d === cell.date ? null : d)) : undefined}
              onDrop={dragItem ? e => { e.preventDefault(); handleDrop(cell.date) } : undefined}
              style={{
                minHeight: isMobile ? 62 : 92,
                padding: 4, borderRadius: 8, cursor: 'pointer',
                display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden',
                border: isDropZone ? '1.5px dashed var(--blue)'
                      : isSelected  ? '1.5px solid var(--blue)'
                      : '1px solid var(--border)',
                background: isDropZone ? 'var(--blue-bg)'
                          : cell.inMonth ? `linear-gradient(${LOAD_TINT[level]}, ${LOAD_TINT[level]}), var(--surface)`
                          : LOAD_TINT[level],
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
                        width: 7, height: 7, borderRadius: 2,
                        background: i.color,
                        outline: isOverdue(i, todayStr) ? '1.5px solid var(--red)' : 'none',
                        outlineOffset: 1,
                        opacity: i.done ? 0.3 : 1,
                      }} />
                    ))}
                  </div>
                )
              ) : (
                <>
                  {shown.map(i => (
                    <Chip
                      key={i.id} item={i}
                      overdue={isOverdue(i, todayStr)}
                      onClick={clickItem}
                      onDragStart={(it, e) => { setDragItem(it); e.dataTransfer.effectAllowed = 'move' }}
                      onDragEnd={() => { setDragItem(null); setDragOver(null) }}
                      dragging={dragItem?.id === i.id}
                    />
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

      {/* ── Which colour is which class ──
             The grid is colour-coded and, until now, had no key: you could see that
             Thursday was two blues and a green without being told what green was.
             Only classes with something on the calendar are listed — a key to colours
             that do not appear is just a second class list. */}
      {legend.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 12px', marginTop: 10 }}>
          {legend.map(c => (
            <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: c.color, flexShrink: 0 }} />
              <span style={{
                fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-2)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160,
              }}>
                {c.name}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* ── Legend ──
             The shading is faint by design, so it needs saying once what it means.
             The drag hint sits here rather than on every chip: it is a property of the
             grid, and repeating it forty times is noise. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        marginTop: 8, fontSize: '0.68rem', color: 'var(--text-3)',
      }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          Workload
          {['light', 'medium', 'heavy'].map(l => (
            <span key={l} title={LOAD_LABELS[l]} style={{
              width: 13, height: 13, borderRadius: 3,
              border: '1px solid var(--border)', background: LOAD_TINT[l],
            }} />
          ))}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--red)' }} /> overdue
        </span>
        {!isMobile && onReschedule && <span>· drag a task to move it</span>}
      </div>

      {/* ── The strip ──
             Either one day in full — which is what makes "+2 more" and the phone's
             dots readable — or, at rest, the week ahead. */}
      {/* A landmark with a *stable* name — the heading swaps between "Coming up" and a
          date, so naming it after the heading would name a moving target. */}
      <section aria-label="Upcoming work" style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 7 }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-2)' }}>
            {selected ? longDay(selected) : 'Coming up'}
          </span>
          {selected ? (
            <>
              {selectedItems.length > 0 && (
                <span style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>
                  {selectedItems.length} {selectedItems.length === 1 ? 'item' : 'items'}
                </span>
              )}
              <button
                onClick={() => setSelected(null)}
                style={{
                  marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 700,
                  color: 'var(--text-3)', padding: 0,
                }}
              >
                Coming up
              </button>
            </>
          ) : (
            <span style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>next 7 days</span>
          )}
        </div>

        {selected ? (
          selectedItems.length === 0 ? (
            <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--text-3)' }}>Nothing due this day.</p>
          ) : (
            selectedItems.map(i => (
              <DayRow key={i.id} item={i} overdue={isOverdue(i, todayStr)} onClick={clickItem} onToggle={onToggleItem} />
            ))
          )
        ) : (
          <>
            {/* Late work leads, because it has no day left to belong to — filing it
                under the date it was due puts it behind you on a list about what is
                ahead, which is exactly where it gets forgotten. */}
            {late.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                  <AlertCircle size={11} style={{ color: 'var(--red)' }} />
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--red)' }}>
                    Overdue · {late.length}
                  </span>
                </div>
                {late.map(i => (
                  <DayRow key={i.id} item={i} overdue onClick={clickItem} onToggle={onToggleItem} />
                ))}
              </div>
            )}

            {upcoming.map(day => (
              <div key={day.date} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-2)' }}>
                    {relativeDay(day.date, todayStr)}
                  </span>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-3)' }}>
                    {day.items.length} {day.items.length === 1 ? 'item' : 'items'}
                  </span>
                </div>
                {day.items.map(i => (
                  <DayRow key={i.id} item={i} overdue={isOverdue(i, todayStr)} onClick={clickItem} onToggle={onToggleItem} />
                ))}
              </div>
            ))}

            {late.length === 0 && upcoming.length === 0 && (
              <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--text-3)' }}>
                Nothing due in the next 7 days.
                {/* Without this, an empty week reads as "no work exists" when the
                    truth is that it is a fortnight out. */}
                {beyond && ` Next up ${relativeDay(beyond, todayStr)}.`}
              </p>
            )}
          </>
        )}
      </section>

      {dayPanel && (
        <DayPanel
          date={dayPanel.date}
          anchor={dayPanel.anchor}
          items={byDate.get(dayPanel.date) ?? []}
          todayStr={todayStr}
          onClickItem={clickItem}
          onToggleItem={onToggleItem}
          /* Only the panel closes; `selected` stays, so the strip below keeps showing
             the day you were looking at rather than snapping back to "Coming up". */
          onClose={() => setDayPanel(null)}
        />
      )}

      {taskMenu && (
        <TaskActionMenu
          anchor={taskMenu.anchor}
          title={taskMenu.item.title}
          done={taskMenu.item.done}
          onToggle={() => onToggleItem?.(taskMenu.item)}
          onEdit={() => onSelectItem?.(taskMenu.item)}
          onDelete={onDeleteItem ? () => onDeleteItem(taskMenu.item) : undefined}
          onClose={() => setTaskMenu(null)}
        />
      )}
    </div>
  )
}

const navBtn = {
  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)',
  padding: 3, borderRadius: 6, display: 'flex', alignItems: 'center', flexShrink: 0,
  transition: 'color .12s',
}
