'use client'

import { useRef, useCallback, useState, useEffect } from 'react'
import FullCalendar from '@fullcalendar/react'

import timeGridPlugin   from '@fullcalendar/timegrid'
import dayGridPlugin    from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'

export default function WeeklyCalendar({
  events, todos, onDateClick, onEventClick, onViewChange, isMobile, highlightEventId, targetDate,
  // Drag-to-reschedule
  onEventDrop, onEventResize,
  // Event recolor
  onRecolorEvent, colorSwatches,
}) {
  const calendarRef    = useRef(null)
  const touchStart     = useRef(null)
  const swipedRef      = useRef(false)
  const swipeResetRef  = useRef(null)
  const wheelTimer     = useRef(null)
  const wheelLocked    = useRef(false)
  const animTimer      = useRef(null)
  const viewAnimTimer  = useRef(null)
  const [navAnim,      setNavAnim]     = useState(null) // 'exit-left' | 'exit-right' | 'enter-left' | 'enter-right' | null
  const [viewAnim,     setViewAnim]    = useState(null) // 'exit' | 'enter' | null
  const [currentView,  setCurrentView] = useState(isMobile ? 'timeGridDay' : 'timeGridWeek')
  const [colorPopover, setColorPopover] = useState(null) // { eventId, x, y }

  useEffect(() => {
    if (!targetDate) return
    const api = calendarRef.current?.getApi()
    if (!api) return
    api.gotoDate(targetDate)
  }, [targetDate])

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
    harness.classList.remove('lv-overlap-earlier-harness', 'lv-overlap-later-harness')
    const role = overlapRole(info.event, info.view.calendar.getEvents())
    if (role === 'later') harness.classList.add('lv-overlap-later-harness')
    if (role === 'earlier') harness.classList.add('lv-overlap-earlier-harness')

    if (highlightEventId && info.event.id === highlightEventId) {
      info.el.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.35)'
      info.el.style.border = '1px solid rgba(59,130,246,0.9)'
      info.el.style.zIndex = '3'
      info.el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
    }

    requestAnimationFrame(() => updateOverlapClasses(info.view.calendar))

    // ── Hold-to-unlock drag (user events only) ─────────────────────────────
    // FullCalendar's interaction plugin uses mousedown (not pointerdown) to
    // start drag. We intercept mousedown in capture phase so FC never sees it,
    // play the border-fill animation for 600 ms, then re-dispatch a real
    // MouseEvent so FC picks it up while the button is still held.
    const isUserEvent = !info.event.extendedProps?.source
    if (isUserEvent) {
      const el = info.el
      let holdTimer = null
      let startX = 0, startY = 0

      function onMouseDown(e) {
        if (e.button !== 0) return
        // Block FullCalendar's own mousedown drag handler from firing
        e.stopImmediatePropagation()
        startX = e.clientX; startY = e.clientY
        el.classList.add('lv-drag-unlocking')

        holdTimer = setTimeout(() => {
          holdTimer = null
          el.classList.remove('lv-drag-unlocking')
          el.classList.add('lv-drag-ready')

          // Re-dispatch so FullCalendar initiates drag naturally
          try {
            el.dispatchEvent(new MouseEvent('mousedown', {
              bubbles: true, cancelable: true,
              clientX: startX, clientY: startY,
              button: 0, buttons: 1,
              view: window,
            }))
          } catch (_) {}

          // Remove ready class when mouse releases
          const cleanup = () => {
            el.classList.remove('lv-drag-ready')
            document.removeEventListener('mouseup', cleanup)
          }
          document.addEventListener('mouseup', cleanup)
        }, 600)
      }

      function cancelHold() {
        if (holdTimer === null) return  // already fired — drag in progress
        clearTimeout(holdTimer); holdTimer = null
        el.classList.remove('lv-drag-unlocking')
      }

      function onMouseMove(e) {
        // Cancel if user moves more than ~5 px before hold completes
        if (holdTimer !== null && e.buttons === 1) {
          const dx = e.clientX - startX, dy = e.clientY - startY
          if (Math.sqrt(dx * dx + dy * dy) > 5) cancelHold()
        }
      }

      el.addEventListener('mousedown', onMouseDown, { capture: true })
      el.addEventListener('mouseup',   cancelHold,  { capture: true })
      el.addEventListener('mouseleave', cancelHold)
      document.addEventListener('mousemove', onMouseMove)

      // Store cleanup fn
      el._lvDragCleanup = () => {
        cancelHold()
        el.removeEventListener('mousedown', onMouseDown, { capture: true })
        el.removeEventListener('mouseup',   cancelHold,  { capture: true })
        el.removeEventListener('mouseleave', cancelHold)
        document.removeEventListener('mousemove', onMouseMove)
      }
    }

    // ── Right-click / long-press recolor (user events only) ───────────────
    if (isUserEvent && onRecolorEvent) {
      const el = info.el
      let touchTimer = null
      let touchMoved = false

      // Desktop: right-click
      function onContextMenu(e) {
        e.preventDefault()
        e.stopPropagation()
        setColorPopover({ eventId: info.event.id, x: e.clientX, y: e.clientY })
      }

      // Mobile: long-press (500ms)
      function onTouchStart(e) {
        touchMoved = false
        const touch = e.touches[0]
        touchTimer = setTimeout(() => {
          if (!touchMoved) {
            setColorPopover({ eventId: info.event.id, x: touch.clientX, y: touch.clientY })
          }
        }, 500)
      }
      function onTouchMove() { touchMoved = true; clearTimeout(touchTimer) }
      function onTouchEnd()  { clearTimeout(touchTimer) }

      el.addEventListener('contextmenu', onContextMenu)
      el.addEventListener('touchstart', onTouchStart, { passive: true })
      el.addEventListener('touchmove',  onTouchMove,  { passive: true })
      el.addEventListener('touchend',   onTouchEnd)

      const prevCleanup = el._lvDragCleanup
      el._lvDragCleanup = () => {
        prevCleanup?.()
        el.removeEventListener('contextmenu', onContextMenu)
        el.removeEventListener('touchstart', onTouchStart)
        el.removeEventListener('touchmove', onTouchMove)
        el.removeEventListener('touchend', onTouchEnd)
      }
    }
  }

  function handleEventWillUnmount(info) {
    info.el._lvDragCleanup?.()
  }

  function updateOverlapClasses(calendarApi) {
    const renderedEvents = calendarApi.getEvents()
    const root = calendarApi.el
    if (!root) return

    root.querySelectorAll('.fc-timegrid-event-harness[data-event-id]').forEach(harness => {
      const eventApi = renderedEvents.find(ev => ev.id === harness.dataset.eventId)
      harness.classList.remove('lv-overlap-earlier-harness', 'lv-overlap-later-harness')
      if (!eventApi) return

      const role = overlapRole(eventApi, renderedEvents)
      if (role === 'later') harness.classList.add('lv-overlap-later-harness')
      if (role === 'earlier') harness.classList.add('lv-overlap-earlier-harness')
    })
  }

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

  const switchView = useCallback((viewName) => {
    const api = calendarRef.current?.getApi()
    if (!api) return
    if (viewName === currentView) return
    clearTimeout(viewAnimTimer.current)

    // Phase 1: fade+scale exit (ends at opacity:0, scale:0.97)
    setViewAnim('exit')

    viewAnimTimer.current = setTimeout(() => {
      // Swap content while container is still invisible (exit forwards-fill holds opacity:0)
      api.changeView(viewName)

      // Double-RAF: let FullCalendar finish its DOM update and the browser paint
      // the new content before we start the enter animation, eliminating the flash
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setViewAnim('enter')
          viewAnimTimer.current = setTimeout(() => setViewAnim(null), 300)
        })
      })
    }, 150)
  }, [currentView])

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

    return (
      <div className="flex flex-col h-full overflow-hidden px-0.5" style={{ position: 'relative' }}>
        {!arg.event.allDay && (
          <div style={{ fontSize: '0.68rem', opacity: 0.85, lineHeight: 1.2, flexShrink: 0, whiteSpace: 'nowrap' }}>
            {arg.timeText}
          </div>
        )}
        {/* Title: wraps so you can read the full name — block is clipped at event bottom */}
        <div style={{ fontWeight: 600, fontSize: '0.76rem', lineHeight: 1.3, overflow: 'hidden', wordBreak: 'break-word' }}>
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
      </div>
    )
  }

  // Also wire the FullCalendar toolbar prev/next buttons through our animated navigate
  function handleDatesSet(info) {
    setCurrentView(info.view.type)
    onViewChange?.(info.view.type)
  }

  const containerClass = [
    'flex-1 min-h-0 rounded-2xl overflow-hidden',
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
    : ['#3a6fa8','#10b981','#ef4444','#f59e0b','#8b5cf6','#e8751a','#0ea5e9','#ec4899','#6366f1','#14b8a6']

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
           style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)' }}>
        <FullCalendar
          ref={calendarRef}
          plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
          initialView={isMobile ? 'timeGridDay' : 'timeGridWeek'}
          headerToolbar={{
            left:   'prev,next today',
            center: 'title',
            right:  'viewMonth,viewWeek,viewDay',
          }}
          buttonText={{ today: 'today' }}
          views={{
            timeGridWeek: {
              // Narrow day letters (M/T/W…) + date number → "M 26" fits the tight columns
              dayHeaderFormat: isMobile
                ? { weekday: 'narrow', day: 'numeric' }
                : { weekday: 'short', day: 'numeric' },
            },
            timeGridDay: {
              // Full date in the single-column header
              dayHeaderFormat: { weekday: 'long', month: 'short', day: 'numeric' },
            },
          }}
          customButtons={{
            prev:      { click: () => navigate('prev') },
            next:      { click: () => navigate('next') },
            viewMonth: { text: isMobile ? 'M' : 'Month', click: () => switchView('dayGridMonth') },
            viewWeek:  { text: isMobile ? 'W' : 'Week',  click: () => switchView('timeGridWeek') },
            viewDay:   { text: isMobile ? 'D' : 'Day',   click: () => switchView('timeGridDay')  },
          }}
          events={events}
          eventContent={renderEventContent}
          eventDidMount={handleEventDidMount}
          eventWillUnmount={handleEventWillUnmount}
          eventsSet={() => {
            const api = calendarRef.current?.getApi()
            if (api) requestAnimationFrame(() => updateOverlapClasses(api))
          }}
          eventClick={(...args) => { if (!swipedRef.current) onEventClick?.(...args) }}
          dateClick={(...args)  => { if (!swipedRef.current) onDateClick?.(...args)  }}
          datesSet={handleDatesSet}
          editable={true}
          longPressDelay={600}
          eventDrop={onEventDrop}
          eventResize={onEventResize}
          eventAllow={(dropInfo, draggedEvent) => !draggedEvent.extendedProps?.source}
          height="100%"
          allDaySlot={true}
          allDayText="Tasks"
          allDayContent={() => (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.7rem', fontWeight: 700, color: 'var(--blue-text)', letterSpacing: '0.04em', textTransform: 'uppercase', padding: '2px 0' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              Tasks
            </div>
          )}
          slotMinTime="00:00:00"
          slotMaxTime="24:00:00"
          slotDuration="00:30:00"
          slotLabelInterval="01:00:00"
          slotLabelFormat={isMobile
            ? { hour: 'numeric', hour12: true }                                         // "8 AM" – fits 38 px axis
            : { hour: 'numeric', minute: '2-digit', meridiem: 'short', hour12: true }}  // "8:00 AM"
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
  )
}
