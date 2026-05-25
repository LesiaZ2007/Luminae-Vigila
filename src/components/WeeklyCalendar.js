'use client'

import { useRef, useCallback, useState } from 'react'
import FullCalendar from '@fullcalendar/react'

import timeGridPlugin   from '@fullcalendar/timegrid'
import dayGridPlugin    from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'

export default function WeeklyCalendar({ events, todos, onDateClick, onEventClick, onViewChange, onEventReceive }) {
  const calendarRef = useRef(null)
  const touchStart  = useRef(null)
  const wheelTimer  = useRef(null)
  const wheelLocked = useRef(false)
  const animTimer   = useRef(null)
  const [navAnim,   setNavAnim] = useState(null) // 'exit-left' | 'exit-right' | 'enter-left' | 'enter-right' | null

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
      if (cur.start > other.start) startsLater = true
      if (cur.start < other.start) startsEarlier = true
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

    requestAnimationFrame(() => updateOverlapClasses(info.view.calendar))
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

  function handleTouchStart(e) {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  function handleTouchEnd(e) {
    if (!touchStart.current) return
    const dx = e.changedTouches[0].clientX - touchStart.current.x
    const dy = e.changedTouches[0].clientY - touchStart.current.y
    touchStart.current = null
    if (Math.abs(dy) > Math.abs(dx) || Math.abs(dx) < 60) return
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

    // Detect short events (≤ 45 min) to compact the layout
    const durationMins = arg.event.end && arg.event.start && !arg.event.allDay
      ? (arg.event.end - arg.event.start) / 60000
      : 999
    const isShort = durationMins <= 45

    if (isShort && !arg.event.allDay) {
      // Compact single-line layout for short events
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden', padding: '0 2px' }}>
          {isTodo && priorityColor && (
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: priorityColor, flexShrink: 0, display: 'inline-block', boxShadow: '0 0 0 1px rgba(255,255,255,0.5)' }} />
          )}
          <span style={{ fontSize: '0.72rem', opacity: 0.8, flexShrink: 0 }}>{arg.timeText}</span>
          {isGoogle && (
            <span style={{ fontSize: '0.58rem', fontWeight: 800, background: 'rgba(255,255,255,0.28)', borderRadius: 3, padding: '0 2px', lineHeight: '12px', flexShrink: 0 }}>G</span>
          )}
          <span style={{ fontWeight: 600, fontSize: '0.72rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {arg.event.title}
          </span>
        </div>
      )
    }

    return (
      <div className="flex flex-col h-full overflow-hidden px-0.5" style={{ position: 'relative' }}>
        {!arg.event.allDay && (
          <div style={{ fontSize: '0.68rem', opacity: 0.85, lineHeight: 1.2 }}>
            {arg.timeText}
          </div>
        )}
        <div style={{ fontWeight: 600, fontSize: '0.76rem', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
          {isTodo && priorityColor && (
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: priorityColor, flexShrink: 0, display: 'inline-block', boxShadow: '0 0 0 1.5px rgba(255,255,255,0.5)' }} />
          )}
          {isGoogle && (
            <span style={{ fontSize: '0.58rem', fontWeight: 800, background: 'rgba(255,255,255,0.28)', borderRadius: 3, padding: '0 2px', lineHeight: '13px', flexShrink: 0 }}>G</span>
          )}
          {arg.event.title}
        </div>
        {linkedTodos.slice(0, 3).map(t => (
          <div key={t.id} style={{ fontSize: '0.63rem', opacity: 0.88, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            ↳ {t.title}
          </div>
        ))}
        {linkedTodos.length > 3 && (
          <div style={{ fontSize: '0.63rem', opacity: 0.7, marginTop: 1 }}>
            +{linkedTodos.length - 3} more
          </div>
        )}
      </div>
    )
  }

  // Also wire the FullCalendar toolbar prev/next buttons through our animated navigate
  function handleDatesSet(info) {
    onViewChange?.(info.view.type)
  }

  const animClass = navAnim ? `cal-nav-${navAnim}` : ''

  return (
    <div className="flex flex-col h-full"
         onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}
         onWheel={handleWheel}>
      <div className={`flex-1 min-h-0 rounded-2xl overflow-hidden ${animClass}`}
           style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)' }}>
        <FullCalendar
          ref={calendarRef}
          plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{
            left:   'prev,next today',
            center: 'title',
            right:  'dayGridMonth,timeGridWeek,timeGridDay',
          }}
          customButtons={{
            prev: { click: () => navigate('prev') },
            next: { click: () => navigate('next') },
          }}
          events={events}
          eventContent={renderEventContent}
          eventDidMount={handleEventDidMount}
          eventsSet={() => {
            const api = calendarRef.current?.getApi()
            if (api) requestAnimationFrame(() => updateOverlapClasses(api))
          }}
          eventClick={onEventClick}
          dateClick={onDateClick}
          datesSet={handleDatesSet}
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
          slotLabelFormat={{ hour: 'numeric', minute: '2-digit', meridiem: 'short', hour12: true }}
          eventTimeFormat={{ hour: 'numeric', minute: '2-digit', meridiem: 'short', hour12: true }}
          nowIndicator={true}
          firstDay={0}
          weekends={true}
          selectable={true}
          dayMaxEvents={4}
          expandRows={true}
          scrollTime="08:00:00"
          eventMinHeight={28}
          eventDisplay="block"
          businessHours={{ daysOfWeek: [1,2,3,4,5], startTime: '08:00', endTime: '20:00' }}
          droppable={true}
          eventReceive={info => {
            info.event.remove()
            onEventReceive?.(info.event.start, info.event.end)
          }}
        />
      </div>
    </div>
  )
}
