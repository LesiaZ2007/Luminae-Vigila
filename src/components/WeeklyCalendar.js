'use client'

import { useRef, useCallback, useState, useEffect } from 'react'
import FullCalendar from '@fullcalendar/react'

import timeGridPlugin   from '@fullcalendar/timegrid'
import dayGridPlugin    from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import { flattenNotes, noteLineBudget } from '@/lib/eventNotes'
import { loadCalendarPrefs, saveCalendarPrefs, slotRange, toYMDLocal } from '@/lib/calendarView'
import { EVENT_SWATCHES } from '@/components/ColorSwatches'

/**
 * How overlapping timed events are laid out.
 *
 *   'columns' — Google Calendar behaviour. FullCalendar packs each cluster of
 *               mutually-overlapping events into side-by-side columns, so an
 *               event only gives up width to events it actually collides with.
 *               A short event sitting inside a long one takes the full
 *               remaining width instead of a fixed indent.
 *
 *   'cascade' — the original behaviour: anything starting later than something
 *               it overlaps was pushed to a flat `left: 15%`. Because the
 *               indent was constant, several events that overlap one long event
 *               but not each other all landed on the same edge, which read as
 *               an accidental column (see PHYS 2211 / CS 1100 under the AI
 *               Career Fair).
 *
 * TO REVERT: change this one string back to 'cascade'. Nothing else needs to
 * move — the cascade code path and its CSS are both still here.
 */
const OVERLAP_STRATEGY = 'columns'

/**
 * The marker on an event flagged important.
 *
 * Drawn in currentColor rather than amber: the block is already a saturated
 * colour, and a white star on it stays legible where amber-on-orange would not.
 * The amber ring around the block is what carries the colour cue — see
 * .lv-important-event in globals.css.
 */
function ImportantStar({ inline = false }) {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"
         style={inline
           ? { flexShrink: 0, marginRight: 3, verticalAlign: 'middle', display: 'inline-block', position: 'relative', top: -1 }
           : { flexShrink: 0 }}>
      <polygon points="12 2 15.1 8.6 22 9.6 17 14.6 18.2 21.6 12 18.3 5.8 21.6 7 14.6 2 9.6 8.9 8.6" />
    </svg>
  )
}

export default function WeeklyCalendar({
  events, todos, onDateClick, onEventClick, onViewChange, isMobile, highlightEventId, targetDate,
  // Event recolor
  onRecolorEvent, colorSwatches,
  // ← / → step through consecutive periods. Parent turns this off while a modal
  // is open so arrows keep their normal meaning inside forms and pickers.
  arrowNavEnabled = true,
}) {
  const calendarRef      = useRef(null)
  const touchStart       = useRef(null)
  const swipedRef        = useRef(false)
  const swipeResetRef    = useRef(null)
  const wheelTimer       = useRef(null)
  const wheelLocked      = useRef(false)
  const animTimer        = useRef(null)
  const viewAnimTimer    = useRef(null)
  const [navAnim,        setNavAnim]       = useState(null) // 'exit-left' | 'exit-right' | 'enter-left' | 'enter-right' | null
  const [viewAnim,       setViewAnim]      = useState(null) // 'exit' | 'enter' | null
  // Read once, at mount, before the first render — the calendar is unmounted whenever
  // you leave the tab, so this is what makes coming back land where you left off.
  // Falls back to the per-device default when nothing has been stored yet.
  const savedPrefs = useRef(null)
  if (savedPrefs.current === null) savedPrefs.current = loadCalendarPrefs()
  const initialView = savedPrefs.current.view ?? (isMobile ? 'timeGridDay' : 'timeGridWeek')

  const [currentView,    setCurrentView]   = useState(initialView)
  // Trims the time grid to a school day (7am–10pm) instead of all 24 hours, so an
  // ordinary day's events fill the height rather than sharing it with eight empty
  // overnight hours. Only affects the timeGrid views; month view has no time axis.
  const [focused,        setFocused]       = useState(savedPrefs.current.focused ?? false)
  const [colorPopover,   setColorPopover]  = useState(null) // { eventId, x, y }
  const longPressedRef   = useRef(false)   // suppresses the click that follows a long-press

  useEffect(() => {
    if (!targetDate) return
    const api = calendarRef.current?.getApi()
    if (!api) return
    api.gotoDate(targetDate)
  }, [targetDate])

  // Restore the remembered date. Runs after mount because FullCalendar has no
  // "initialDate unless told otherwise" — initialDate would fight the targetDate prop
  // that search results and the mini-month use to jump the calendar somewhere.
  // Skipped when a target was passed in: that is an explicit "go here" and outranks
  // where the user happened to be last.
  useEffect(() => {
    const remembered = savedPrefs.current?.date
    if (!remembered || targetDate) return
    calendarRef.current?.getApi()?.gotoDate(remembered)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // When isMobile first resolves to true (SSR defaults to desktop), switch to day view
  useEffect(() => {
    if (!isMobile) return
    const api = calendarRef.current?.getApi()
    if (api && api.view.type !== 'timeGridDay') {
      api.changeView('timeGridDay')
      setCurrentView('timeGridDay')
    }
  }, [isMobile])

  function timedRange(ev) {
    if (ev.allDay || !ev.start) return null
    const start = new Date(ev.start)
    const end = ev.end ? new Date(ev.end) : new Date(start.getTime() + 3600_000)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
    const day = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
    return { start, end, day }
  }

  function overlapRole(eventApi, calendarEvents = events || []) {
    const cur = timedRange(eventApi)
    if (!cur) return null

    let startsLater = false
    let startsEarlier = false

    for (const ev of calendarEvents) {
      if (ev.id === eventApi.id) continue
      const other = timedRange(ev)
      if (!other || other.day !== cur.day) continue
      const overlaps = cur.start < other.end && other.start < cur.end
      if (!overlaps) continue
      if (cur.start > other.start) {
        startsLater = true
      } else if (cur.start < other.start) {
        startsEarlier = true
      } else {
        // Same start time: shorter duration gets the 'later' (indented) role.
        // Tie-break by event id so the assignment is stable across re-renders.
        const curDur   = cur.end.getTime()   - cur.start.getTime()
        const otherDur = other.end.getTime() - other.start.getTime()
        if (curDur < otherDur || (curDur === otherDur && eventApi.id > ev.id)) {
          startsLater = true
        } else {
          startsEarlier = true
        }
      }
    }

    if (startsLater) return 'later'
    if (startsEarlier) return 'earlier'
    return null
  }

  function handleEventDidMount(info) {
    const harness = info.el.parentElement
    if (!harness) return
    harness.dataset.eventId = info.event.id
    // In 'columns' mode we leave the harness alone so FullCalendar's own
    // column packing survives — our CSS uses !important and would override it.
    harness.classList.remove('lv-overlap-earlier-harness', 'lv-overlap-later-harness')

    /* Important events break out of their column by a few pixels and sit above
       their neighbours. The class goes on the harness, not the event: the
       harness is the absolutely-positioned box FullCalendar sizes, so it is the
       only thing that can spill past the column edges or win a z-index fight.
       The neighbours keep their own width, so they still read underneath. */
    harness.classList.toggle('lv-important-harness', !!info.event.extendedProps?.important)

    if (OVERLAP_STRATEGY === 'cascade') {
      const role = overlapRole(info.event, info.view.calendar.getEvents())
      if (role === 'later') harness.classList.add('lv-overlap-later-harness')
      if (role === 'earlier') harness.classList.add('lv-overlap-earlier-harness')
    }

    if (highlightEventId && info.event.id === highlightEventId) {
      info.el.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.35)'
      info.el.style.border = '1px solid rgba(59,130,246,0.9)'
      info.el.style.zIndex = '3'
      info.el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
    }

    requestAnimationFrame(() => updateOverlapClasses(info.view.calendar))

    /* A task chip has no `source` either, so it used to pass for a user event and got
       the recolor popover. That was always a dead end: a task takes its colour from its
       category, and the per-event override it wrote is a preference the task list never
       reads. Right-click on one now does what left-click does. */
    const isTodo      = info.event.extendedProps?.type === 'todo'
    const isUserEvent = !info.event.extendedProps?.source && !isTodo

    const el = info.el

    // ── Desktop: right-click to recolor (user events only) ────────────────
    function onContextMenu(e) {
      e.preventDefault()
      e.stopPropagation()
      if (isTodo) { onEventClick?.(info); return }
      setColorPopover({ eventId: info.event.id, x: e.clientX, y: e.clientY })
    }
    if ((isUserEvent && onRecolorEvent && !isMobile) || (isTodo && !isMobile)) {
      el.addEventListener('contextmenu', onContextMenu)
    }

    // ── Mobile: long-press opens the detail view ───────────────────────────
    // Same destination as a tap. Kept because a long-press on a block squeezed into a
    // narrow overlap column is easier to land than a tap on it, and because the haptic
    // confirms the press registered.
    let touchTimer = null
    let touchMoved = false

    function onTouchStart() {
      touchMoved = false
      longPressedRef.current = false
      touchTimer = setTimeout(() => {
        if (touchMoved) return
        longPressedRef.current = true
        // Haptic confirmation that the press registered, where supported.
        navigator.vibrate?.(12)
        onEventClick?.(info)
      }, 500)
    }
    function onTouchMove() { touchMoved = true; clearTimeout(touchTimer) }
    function onTouchEnd()  { clearTimeout(touchTimer) }

    if (isMobile) {
      el.addEventListener('touchstart', onTouchStart, { passive: true })
      el.addEventListener('touchmove',  onTouchMove,  { passive: true })
      el.addEventListener('touchend',   onTouchEnd)
    }

    const prevCleanup = el._lvDragCleanup
    el._lvDragCleanup = () => {
      prevCleanup?.()
      clearTimeout(touchTimer)
      el.removeEventListener('contextmenu', onContextMenu)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }

  function handleEventWillUnmount(info) {
    info.el._lvDragCleanup?.()
  }

  function updateOverlapClasses(calendarApi) {
    const root = calendarApi.el
    if (!root) return

    // 'columns' mode: strip any stale cascade classes and let FullCalendar lay
    // the events out. Done as a sweep rather than an early return so flipping
    // OVERLAP_STRATEGY at runtime (fast refresh) cleans up after itself.
    if (OVERLAP_STRATEGY === 'columns') {
      root.querySelectorAll('.lv-overlap-earlier-harness, .lv-overlap-later-harness')
        .forEach(h => h.classList.remove('lv-overlap-earlier-harness', 'lv-overlap-later-harness'))
      return
    }

    const renderedEvents = calendarApi.getEvents()
    root.querySelectorAll('.fc-timegrid-event-harness[data-event-id]').forEach(harness => {
      const eventApi = renderedEvents.find(ev => ev.id === harness.dataset.eventId)
      harness.classList.remove('lv-overlap-earlier-harness', 'lv-overlap-later-harness')
      if (!eventApi) return

      const role = overlapRole(eventApi, renderedEvents)
      if (role === 'later') harness.classList.add('lv-overlap-later-harness')
      if (role === 'earlier') harness.classList.add('lv-overlap-earlier-harness')
    })
  }

  /* Bring the tapped event to the front. Done by toggling a class on the
     harness rather than inline styles, so FullCalendar re-rendering the event
     (which it does often) can't silently drop it — the effect re-applies. */

  const navigate = useCallback((dir) => {
    const api = calendarRef.current?.getApi()
    if (!api) return
    clearTimeout(animTimer.current)

    // Phase 1: exit current view
    setNavAnim(dir === 'next' ? 'exit-left' : 'exit-right')

    // At the midpoint, switch content + start enter animation
    animTimer.current = setTimeout(() => {
      if (dir === 'next') api.next()
      else                api.prev()
      setNavAnim(dir === 'next' ? 'enter-right' : 'enter-left')

      // Phase 2 done — clear
      animTimer.current = setTimeout(() => setNavAnim(null), 260)
    }, 140)
  }, [])

  /* ── Arrow-key navigation ────────────────────────────────────────────────
     ← / → move one period in whichever view is active: a day in day view, a
     week in week view, a month in month view. Reuses the same animated
     navigate() as swipe and trackpad scroll, so all three feel identical. */
  useEffect(() => {
    if (!arrowNavEnabled) return

    function onKeyDown(e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      // Let modifier combos through — Alt+← is browser back, and Shift/Ctrl
      // arrows are text selection when focus happens to be in a field.
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return

      const el  = e.target
      const tag = el?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || el?.isContentEditable) return

      e.preventDefault()
      navigate(e.key === 'ArrowRight' ? 'next' : 'prev')
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [arrowNavEnabled, navigate])

  const switchView = useCallback((viewName) => {
    const api = calendarRef.current?.getApi()
    if (!api) return
    if (viewName === currentView) return
    clearTimeout(viewAnimTimer.current)

    // Phase 1: fade+scale exit
    setViewAnim('exit')

    viewAnimTimer.current = setTimeout(() => {
      api.changeView(viewName)
      // currentView will be updated via handleDatesSet once FC fires

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setViewAnim('enter')
          viewAnimTimer.current = setTimeout(() => setViewAnim(null), 300)
        })
      })
    }, 150)
  }, [currentView])

  /**
   * Flip between the full 24-hour grid and the focused 7am–10pm one.
   *
   * Persisted immediately rather than waiting for the next `datesSet`: changing the
   * slot range does not renavigate, so FullCalendar has no reason to fire that event
   * and the preference would be lost if the user switched tabs straight afterwards.
   */
  const toggleFocus = useCallback(() => {
    setFocused(prev => {
      const next = !prev
      const api = calendarRef.current?.getApi()
      saveCalendarPrefs({
        view:    api?.view?.type ?? currentView,
        date:    toYMDLocal(api?.view?.currentStart ?? new Date()),
        focused: next,
      })
      return next
    })
  }, [currentView])

  /**
   * Jump to the day view for a specific date.
   *
   * Used by month-cell clicks and by the clickable day headers (navLinks).
   * changeView takes the target date directly, so this is one animated step
   * rather than switch-then-scroll.
   */
  const goToDay = useCallback((date) => {
    const api = calendarRef.current?.getApi()
    if (!api) return
    clearTimeout(viewAnimTimer.current)
    setViewAnim('exit')
    viewAnimTimer.current = setTimeout(() => {
      api.changeView('timeGridDay', date)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setViewAnim('enter')
          viewAnimTimer.current = setTimeout(() => setViewAnim(null), 300)
        })
      })
    }, 150)
  }, [])

  function handleTouchStart(e) {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  function handleTouchEnd(e) {
    if (!touchStart.current) return
    const dx = e.changedTouches[0].clientX - touchStart.current.x
    const dy = e.changedTouches[0].clientY - touchStart.current.y
    touchStart.current = null
    if (Math.abs(dy) > Math.abs(dx) || Math.abs(dx) < 60) return
    // Flag a swipe so FullCalendar's dateClick / eventClick are suppressed
    swipedRef.current = true
    clearTimeout(swipeResetRef.current)
    swipeResetRef.current = setTimeout(() => { swipedRef.current = false }, 500)
    navigate(dx < 0 ? 'next' : 'prev')
  }

  const handleWheel = useCallback((e) => {
    if (Math.abs(e.deltaX) < Math.abs(e.deltaY)) return
    if (Math.abs(e.deltaX) < 30) return
    if (wheelLocked.current) return
    wheelLocked.current = true
    clearTimeout(wheelTimer.current)
    wheelTimer.current = setTimeout(() => { wheelLocked.current = false }, 600)
    e.preventDefault()
    navigate(e.deltaX > 0 ? 'next' : 'prev')
  }, [navigate])

  function renderEventContent(arg) {
    const linkedTodos = (todos || []).filter(t =>
      t.linkedEventId === arg.event.id && !t.completed
    )
    const isTodo    = arg.event.extendedProps?.type === 'todo'
    const isGoogle  = arg.event.extendedProps?.source === 'google'
    const important = !!arg.event.extendedProps?.important
    const priority  = arg.event.extendedProps?.priority
    const priorityColor = priority === 'high' ? '#ef4444' : priority === 'medium' ? '#f59e0b' : null

    // Detect short events to compact the layout
    // On mobile day view there's full width, so only truly tiny events (≤30 min) go compact
    const durationMins = arg.event.end && arg.event.start && !arg.event.allDay
      ? (arg.event.end - arg.event.start) / 60000
      : 999
    const isShort = durationMins <= (isMobile ? 30 : 45)

    if (isShort && !arg.event.allDay) {
      // Compact single-line layout for short events
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden', padding: '0 2px', minWidth: 0 }}>
          {important && <ImportantStar />}
          {isTodo && priorityColor && (
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: priorityColor, flexShrink: 0, display: 'inline-block', boxShadow: '0 0 0 1px rgba(255,255,255,0.5)' }} />
          )}
          <span style={{ fontSize: '0.72rem', opacity: 0.8, flexShrink: 0, whiteSpace: 'nowrap' }}>{arg.timeText}</span>
          {isGoogle && (
            <span style={{ fontSize: '0.58rem', fontWeight: 800, background: 'rgba(255,255,255,0.28)', borderRadius: 3, padding: '0 2px', lineHeight: '12px', flexShrink: 0 }}>G</span>
          )}
          <span style={{ fontWeight: 600, fontSize: '0.72rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
            {arg.event.title}
          </span>
        </div>
      )
    }

    // Notes live under different keys depending on where the event came from: ours
    // use `notes`, imported Google events carry `description`.
    const notesText = flattenNotes(
      arg.event.extendedProps?.notes || arg.event.extendedProps?.description,
    )
    const noteLines = notesText
      ? noteLineBudget({ durationMins, allDay: arg.event.allDay, isMobile, linkedCount: Math.min(linkedTodos.length, 4) })
      : 0

    return (
      <div className="flex flex-col h-full overflow-hidden px-0.5" style={{ position: 'relative' }}>
        {!arg.event.allDay && (
          <div style={{ fontSize: '0.68rem', opacity: 0.85, lineHeight: 1.2, flexShrink: 0, whiteSpace: 'nowrap' }}>
            {arg.timeText}
          </div>
        )}
        {/* Title: wraps so you can read the full name — block is clipped at event bottom */}
        <div style={{ fontWeight: 600, fontSize: '0.76rem', lineHeight: 1.3, overflow: 'hidden', wordBreak: 'break-word' }}>
          {important && <ImportantStar inline />}
          {isTodo && priorityColor && (
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: priorityColor, display: 'inline-block', marginRight: 3, verticalAlign: 'middle', boxShadow: '0 0 0 1.5px rgba(255,255,255,0.5)', position: 'relative', top: -1 }} />
          )}
          {isGoogle && (
            <span style={{ fontSize: '0.58rem', fontWeight: 800, background: 'rgba(255,255,255,0.28)', borderRadius: 3, padding: '0 2px', lineHeight: '13px', marginRight: 3, verticalAlign: 'middle', display: 'inline-block' }}>G</span>
          )}
          {arg.event.title}
        </div>
        {linkedTodos.slice(0, 3).map(t => (
          <div key={t.id} style={{ fontSize: '0.63rem', opacity: 0.88, marginTop: 1, overflow: 'hidden', wordBreak: 'break-word' }}>
            ↳ {t.title}
          </div>
        ))}
        {linkedTodos.length > 3 && (
          <div style={{ fontSize: '0.63rem', opacity: 0.7, marginTop: 1, flexShrink: 0 }}>
            +{linkedTodos.length - 3} more
          </div>
        )}

        {/* Notes, but only when the block is genuinely tall enough to hold a line.
            Smaller and more transparent than the title so it reads as secondary and
            never competes with the thing you are scanning for. See noteLineBudget. */}
        {noteLines > 0 && notesText && (
          <div
            title={notesText}
            style={{
              marginTop: 2,
              fontSize: '0.6rem',
              lineHeight: 1.35,
              opacity: 0.62,
              fontWeight: 400,
              // flex-1 + minHeight 0 lets the block take the leftover space and clip
              // there, so a mis-estimated line count degrades to a clean cut rather
              // than overflowing the event.
              flex: '1 1 auto',
              minHeight: 0,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: noteLines,
              wordBreak: 'break-word',
            }}
          >
            {notesText}
          </div>
        )}
      </div>
    )
  }

  // Also wire the FullCalendar toolbar prev/next buttons through our animated navigate
  function handleDatesSet(info) {
    setCurrentView(info.view.type)
    onViewChange?.(info.view.type)
    // `currentStart` rather than the visible range's start: in month view the grid
    // usually opens with a few days of the previous month, and saving those would
    // reopen on the wrong month.
    saveCalendarPrefs({ view: info.view.type, date: toYMDLocal(info.view.currentStart), focused })
  }

  const containerClass = [
    'flex-1 min-h-0 rounded-2xl overflow-hidden',
    // Scopes the overlap CSS. Without this the harness overrides applied in
    // every mode and flattened FullCalendar's column packing.
    `lv-overlap-${OVERLAP_STRATEGY}`,
    `lv-cal-view-${currentView}`,
    navAnim  ? `cal-nav-${navAnim}`   : '',
    viewAnim ? `cal-view-${viewAnim}` : '',
  ].filter(Boolean).join(' ')

  // Close color popover on outside click
  useEffect(() => {
    if (!colorPopover) return
    const h = () => setColorPopover(null)
    // Small delay so the click that opened it doesn't immediately close it
    const t = setTimeout(() => document.addEventListener('click', h), 50)
    return () => { clearTimeout(t); document.removeEventListener('click', h) }
  }, [colorPopover])

  const swatchColors = colorSwatches && colorSwatches.length > 0
    ? colorSwatches
    : EVENT_SWATCHES

  return (
    <div className="flex flex-col h-full"
         onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}
         onWheel={handleWheel}>

      {/* Color popover */}
      {colorPopover && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed', zIndex: 9999,
            top: Math.min(colorPopover.y + 8, window.innerHeight - 80),
            left: Math.min(colorPopover.x, window.innerWidth - 220),
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 14, padding: '10px 12px',
            boxShadow: 'var(--shadow-modal)',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)' }}>
            Event color
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, maxWidth: 190 }}>
            {swatchColors.map(color => (
              <button
                key={color}
                title={color}
                onClick={() => { onRecolorEvent?.(colorPopover.eventId, color); setColorPopover(null) }}
                style={{
                  width: 24, height: 24, borderRadius: '50%', background: color,
                  border: '2px solid rgba(255,255,255,0.25)',
                  cursor: 'pointer', transition: 'transform .1s, box-shadow .1s', padding: 0,
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.2)'; e.currentTarget.style.boxShadow = `0 0 0 3px ${color}55` }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)';   e.currentTarget.style.boxShadow = 'none' }}
              />
            ))}
          </div>
        </div>
      )}

      <div className={containerClass}
           style={{
             background: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)',
             display: 'flex', flexDirection: 'column',
           }}>

        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <FullCalendar
            ref={calendarRef}
            plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
            initialView={initialView}
            headerToolbar={{
              left:   'prev,next today',
              center: 'title',
              // The focus toggle is desktop-only. On mobile the toolbar is already
              // three view buttons wide in a phone-width row, and a fourth turned it
              // into a cramped strip of abbreviations.
              right:  isMobile ? 'viewMonth,viewWeek,viewDay' : 'focusRange viewMonth,viewWeek,viewDay',
            }}
            buttonText={{ today: 'today' }}
            views={{
              timeGridWeek: {
                dayHeaderFormat: isMobile
                  ? { weekday: 'narrow', day: 'numeric' }
                  : { weekday: 'short', day: 'numeric' },
              },
              timeGridDay: {
                dayHeaderFormat: { weekday: 'long', month: 'short', day: 'numeric' },
              },
            }}
            customButtons={{
              prev:      { click: () => navigate('prev') },
              next:      { click: () => navigate('next') },
              viewMonth: { text: isMobile ? 'M' : 'Month',  click: () => switchView('dayGridMonth')  },
              viewWeek:  { text: isMobile ? 'W' : 'Week',   click: () => switchView('timeGridWeek')  },
              viewDay:   { text: isMobile ? 'D' : 'Day',    click: () => switchView('timeGridDay')   },
              // Labelled with what it will do rather than what is on, so it reads the
              // same whichever way round it is. Desktop only — see headerToolbar.
              focusRange: {
                text:  focused ? 'Full 24 h' : 'Focus 7–10',
                click: () => toggleFocus(),
              },
            }}
            events={events}
            /* false → colliding events sit fully side by side (Google style).
               true (FullCalendar's default) → the later one covers ~50% of the
               earlier one, which is the look 'cascade' was reinforcing. */
            slotEventOverlap={OVERLAP_STRATEGY === 'cascade'}
            eventClassNames={(arg) => [
              arg.event.extendedProps?.isHiddenEvent ? 'lv-hidden-event'    : null,
              arg.event.extendedProps?.important     ? 'lv-important-event' : null,
            ].filter(Boolean)}
            eventContent={renderEventContent}
            eventDidMount={handleEventDidMount}
            eventWillUnmount={handleEventWillUnmount}
            eventsSet={() => {
              const api = calendarRef.current?.getApi()
              if (api) requestAnimationFrame(() => updateOverlapClasses(api))
            }}
            eventClick={(info) => {
              if (swipedRef.current) return
              // The long-press already opened the detail view; ignore the click that
              // browsers fire afterwards.
              if (longPressedRef.current) { longPressedRef.current = false; return }
              // Mobile taps used to only lift the event to the front, because opening
              // the edit form on a stray tap was worse than not opening anything. The
              // detail view is a better answer to "what is this" than a raised block
              // was, so a tap now does the same thing on every device.
              onEventClick?.(info)
            }}
            /* Day headers (week view) and day numbers (month view) become
               links into the day view. */
            navLinks={true}
            navLinkDayClick={(date) => goToDay(date)}
            dateClick={(info) => {
              if (swipedRef.current) return
              // In month view a click on a day means "show me this day". In the
              // time-grid views it means "create an event at this slot", which
              // is the whole point of those views — so only month navigates.
              if (info.view.type === 'dayGridMonth') { goToDay(info.date); return }
              onDateClick?.(info)
            }}
            datesSet={handleDatesSet}
            editable={false}
            height="100%"
            allDaySlot={true}
            allDayText="Tasks"
            allDayContent={() => (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.7rem', fontWeight: 700, color: 'var(--blue-text)', letterSpacing: '0.04em', textTransform: 'uppercase', padding: '2px 0' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                Tasks
              </div>
            )}
            slotMinTime={slotRange(focused).min}
            slotMaxTime={slotRange(focused).max}
            slotDuration="00:30:00"
            slotLabelInterval="01:00:00"
            slotLabelFormat={isMobile
              ? { hour: 'numeric', hour12: true }
              : { hour: 'numeric', minute: '2-digit', meridiem: 'short', hour12: true }}
            eventTimeFormat={{ hour: 'numeric', minute: '2-digit', meridiem: 'short', hour12: true }}
            nowIndicator={true}
            firstDay={0}
            weekends={true}
            selectable={true}
            dayMaxEvents={4}
            expandRows={true}
            scrollTime="08:00:00"
            eventMinHeight={isMobile ? 32 : 28}
            eventDisplay="block"
            businessHours={{ daysOfWeek: [1,2,3,4,5], startTime: '08:00', endTime: '20:00' }}
          />
        </div>
      </div>
    </div>
  )
}
