'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { useTheme } from 'next-themes'
import { CheckSquare, Sun, Moon, Plus, ChevronRight, CalendarDays, ListTodo, LogOut, BookOpen, Settings, Search } from 'lucide-react'

function useWindowWidth() {
  const [w, setW] = useState(typeof window !== 'undefined' ? window.innerWidth : 1280)
  useEffect(() => {
    function onResize() { setW(window.innerWidth) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return w
}
import TodoPanel  from '@/components/TodoPanel'
import EventModal from '@/components/EventModal'
import AddTodoModal from '@/components/AddTodoModal'
import Toast from '@/components/Toast'
import Corvus from '@/components/Corvus'
import GoogleCalendarSettings, { GoogleLogo } from '@/components/GoogleCalendarSettings'
import SidebarGoogleSection from '@/components/SidebarGoogleSection'
import SidebarCanvasSection   from '@/components/SidebarCanvasSection'
import SidebarScheduleSection from '@/components/SidebarScheduleSection'
import CanvasSettingsModal    from '@/components/CanvasSettingsModal'
import ClassScheduleModal     from '@/components/ClassScheduleModal'
import CoursesPanel           from '@/components/CoursesPanel'
import ImportExportButton     from '@/components/ImportExportButton'
import SearchPanel            from '@/components/SearchPanel'
import ErrorBoundary          from '@/components/ErrorBoundary'

const WeeklyCalendar = dynamic(() => import('@/components/WeeklyCalendar'), { ssr: false })

export const EVENT_CATEGORIES = [
  { id: 'class',    label: 'Class',       color: '#3a6fa8' },
  { id: 'exam',     label: 'Exam / Quiz', color: '#ef4444' },
  { id: 'personal', label: 'Personal',    color: '#10b981' },
  { id: 'health',   label: 'Health',      color: '#f59e0b' },
  { id: 'social',   label: 'Social',      color: '#8b5cf6' },
  { id: 'work',     label: 'Work',        color: '#06b6d4' },
]

const DEFAULT_TODO_CATS = [
  { id: 'academic', label: 'Academic', color: '#3a6fa8' },
  { id: 'personal', label: 'Personal', color: '#10b981' },
  { id: 'work',     label: 'Work',     color: '#f59e0b' },
  { id: 'health',   label: 'Health',   color: '#ef4444' },
]

/* ── Recurring event expansion ── */
function expandRecurring(base) {
  const { recurrence } = base
  const newId = base.id || String(Date.now())
  if (!recurrence) return [{ ...base, id: newId }]

  const startDt  = new Date(base.start)
  const endDt    = new Date(base.end)
  const duration = endDt - startDt
  const until    = new Date(recurrence.until + 'T23:59:59')
  const results  = []
  let cur = new Date(startDt)

  while (cur <= until) {
    const dow = cur.getDay()
    const weekDiff = Math.round((cur - startDt) / (7 * 24 * 60 * 60 * 1000))
    const include =
      recurrence.type === 'daily' ||
      (recurrence.type === 'weekly'   && dow === startDt.getDay()) ||
      (recurrence.type === 'biweekly' && dow === startDt.getDay() && weekDiff % 2 === 0) ||
      (recurrence.type === 'monthly'  && cur.getDate() === startDt.getDate()) ||
      (recurrence.type === 'custom'   && recurrence.days.includes(dow))

    if (include) {
      const id = `${newId}-r-${cur.toISOString().slice(0,10)}`
      results.push({
        ...base,
        id,
        recurrenceGroupId: newId,
        seriesRecurrence:  recurrence,   // preserved so EventModal can pre-populate "Edit all"
        seriesStart:       base.start,   // first occurrence start for "Edit all" date reset
        start: new Date(cur).toISOString(),
        end:   new Date(cur.getTime() + duration).toISOString(),
        recurrence: undefined,
      })
    }
    cur.setDate(cur.getDate() + 1)
  }
  return results
}

// Expand a recurring todo into individual instances (up to 8 weeks ahead)
function expandRecurringTodo(t) {
  if (!t.dueDate) return []
  if (!t.recurrence) return [t]

  const { recurrence } = t
  const startDt       = new Date(t.dueDate + 'T12:00:00')
  const until         = recurrence.until
    ? new Date(recurrence.until + 'T23:59:59')
    : new Date(startDt.getTime() + 8 * 7 * 24 * 3600_000)
  const completedDates = t.completedDates || []

  const results = []
  let cur = new Date(startDt)

  while (cur <= until && results.length < 60) {
    const dow     = cur.getDay()
    const dateStr = cur.toISOString().slice(0, 10)
    const include =
      recurrence.type === 'daily' ||
      (recurrence.type === 'weekly' && dow === startDt.getDay()) ||
      (recurrence.type === 'custom' && recurrence.days?.includes(dow))

    if (include && !completedDates.includes(dateStr)) {
      results.push({ ...t, dueDate: dateStr, recurrenceGroupId: t.id, id: `${t.id}-r-${dateStr}` })
    }
    cur.setDate(cur.getDate() + 1)
  }
  return results
}

export default function Home() {
  const { theme, setTheme } = useTheme()
  const [mounted,       setMounted]       = useState(false)
  const [todoPanelWidth, setTodoPanelWidth] = useState(520)
  const resizingRef    = useRef(false)
  const startXRef      = useRef(0)
  const startWRef      = useRef(280)
  const addMenuRef     = useRef(null)

  const [events,         setEvents]         = useState([])
  const [todos,          setTodos]           = useState([])
  const [todoCategories, setTodoCategories] = useState(DEFAULT_TODO_CATS)
  const [toasts,         setToasts]         = useState([])

  const [eventModal,    setEventModal]    = useState({ open: false, event: null, date: null })
  const [showTodoModal,   setShowTodoModal]   = useState(false)
  const [editingTodo,     setEditingTodo]     = useState(null)
  const [initialTodoDate, setInitialTodoDate] = useState(null)
  const [activeNav,     setActiveNav]     = useState('calendar')
  const [corvusFloat,   setCorvusFloat]   = useState(false)
  const [showAddMenu,   setShowAddMenu]   = useState(false)
  const [showSearchPopup,   setShowSearchPopup]   = useState(false)
  const [searchClosing,     setSearchClosing]     = useState(false)
  const [searchQuery,       setSearchQuery]       = useState('')
  const [searchScope,       setSearchScope]       = useState('all')
  const [searchStatus,      setSearchStatus]      = useState('all')
  const [searchHighlightId, setSearchHighlightId] = useState(null)
  const [calendarTargetDate, setCalendarTargetDate] = useState(null)

  const [googleEvents,       setGoogleEvents]       = useState([])
  const [showGoogleSettings, setShowGoogleSettings] = useState(false)
  const [gcSyncing,          setGcSyncing]          = useState(false)
  const [eventPrefs,         setEventPrefs]         = useState({})
  const [showHiddenGcal,     setShowHiddenGcal]     = useState(false)

  const openSearchPopup = useCallback(() => {
    setSearchQuery('')
    setSearchScope('all')
    setSearchStatus('upcoming')
    setShowSearchPopup(true)
  }, [])

  const closeSearchPopup = useCallback(() => {
    setSearchClosing(true)
    setTimeout(() => { setShowSearchPopup(false); setSearchClosing(false) }, 180)
  }, [])

  // Escape to close search
  useEffect(() => {
    if (!showSearchPopup) return
    const onKeyDown = (e) => { if (e.key === 'Escape') closeSearchPopup() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showSearchPopup, closeSearchPopup])

  // Ctrl+K / Cmd+K to open search from anywhere
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); openSearchPopup() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openSearchPopup])

  // ── Canvas state ──
  const [canvasAssignments,  setCanvasAssignments]  = useState([])
  const [canvasClasses,      setCanvasClasses]      = useState([])
  const [canvasCalEvents,    setCanvasCalEvents]    = useState([])
  const [showCanvasSettings, setShowCanvasSettings] = useState(false)
  const [showClassModal,     setShowClassModal]     = useState(false)
  const [editingClass,       setEditingClass]       = useState(null)
  const [cvSyncing,          setCvSyncing]          = useState(false)
  const [canvasTodoModal,    setCanvasTodoModal]    = useState(false)
  const [editingCanvas,      setEditingCanvas]      = useState(null)
  // Canvas calendar visibility prefs (lifted to state for immediate re-render)
  const [canvasCalPrefs, setCanvasCalPrefs] = useState(() => {
    try {
      const p = JSON.parse(localStorage.getItem('lv-canvas-prefs') ?? '{}')
      return { showOnCalendar: p.showOnCalendar !== false, coursesEnabled: p.coursesEnabled ?? {}, courseColors: p.courseColors ?? {} }
    } catch { return { showOnCalendar: true, coursesEnabled: {}, courseColors: {} } }
  })

  const shownReminders  = useRef(new Set())
  const hasMergedCloud  = useRef(false)   // true after initial cloud pull completes
  const syncTimerRef    = useRef(null)    // debounce handle for ongoing cloud saves

  const [clockTime,    setClockTime]    = useState(() => new Date())
  const [weather,      setWeather]      = useState(null)
  const [militaryTime, setMilitaryTime] = useState(false)
  const [currentUser,  setCurrentUser]  = useState(null)
  const windowWidth = useWindowWidth()
  const isMobile  = windowWidth < 640
  const isTablet  = windowWidth >= 640 && windowWidth < 1100
  // Count events that are actively hidden — local OR google, not stale localStorage entries
  const hiddenEventCount = useMemo(
    () => [...events, ...googleEvents].filter(e => eventPrefs[e.id]?.hidden).length,
    [events, googleEvents, eventPrefs],
  )

  useEffect(() => { setMounted(true) }, [])

  // Fetch current user for display / logout
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.user) setCurrentUser(d.user) })
      .catch(() => {})
  }, [])

  // ── Initial cloud merge ────────────────────────────────────────────────────
  // Runs once when the user first signs in (or on page load if already signed in).
  // Pulls cloud data and merges it with local state — local wins on conflict.
  // Then immediately pushes the merged result back so new local items are uploaded.
  useEffect(() => {
    if (!currentUser || hasMergedCloud.current) return
    hasMergedCloud.current = true

    fetch('/api/sync')
      .then(r => r.ok ? r.json() : null)
      .then(cloud => {
        if (!cloud) return

        // Helper: merge two arrays by id — local wins on duplicate
        function mergeById(cloudArr, localArr) {
          const cloudMap = Object.fromEntries((cloudArr ?? []).map(x => [x.id, x]))
          const localMap = Object.fromEntries((localArr ?? []).map(x => [x.id, x]))
          return Object.values({ ...cloudMap, ...localMap })
        }

        // Capture current local state, merge, and set
        setEvents(local => {
          const merged = mergeById(cloud.events, local)
          return merged
        })
        setTodos(local => {
          const merged = mergeById(cloud.todos, local)
          return merged
        })
        setTodoCategories(local => {
          const merged = mergeById(cloud.todoCategories, local)
          return merged.length > 0 ? merged : local  // keep defaults if cloud is empty
        })
        setCanvasClasses(local => {
          const merged = mergeById(cloud.classSchedule, local)
          return merged
        })
        setEventPrefs(local => {
          // eventPrefs is a plain object {eventId: {hidden, color}} — local wins
          return { ...(cloud.eventPrefs ?? {}), ...local }
        })

        // Count how many local items weren't in the cloud (new uploads)
        const cloudEventIds = new Set((cloud.events ?? []).map(e => e.id))
        const cloudTodoIds  = new Set((cloud.todos  ?? []).map(t => t.id))

        // After state is updated, push the merged result back
        // Use a short timeout so React has processed the state updates first
        setTimeout(() => {
          // Re-read from localStorage (already written by the effects below)
          try {
            const mergedEvents    = JSON.parse(localStorage.getItem('lv-events')     ?? '[]')
            const mergedTodos     = JSON.parse(localStorage.getItem('lv-todos')      ?? '[]')
            const mergedCats      = JSON.parse(localStorage.getItem('lv-todo-cats')  ?? '[]')
            const mergedClasses   = JSON.parse(localStorage.getItem('lv-canvas-classes') ?? '[]')
            const mergedPrefs     = JSON.parse(localStorage.getItem('lv-event-prefs') ?? '{}')

            const newEvents = mergedEvents.filter(e => !cloudEventIds.has(e.id)).length
            const newTodos  = mergedTodos.filter( t => !cloudTodoIds.has(t.id)).length

            fetch('/api/sync', {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                events:         mergedEvents,
                todos:          mergedTodos,
                todoCategories: mergedCats,
                classSchedule:  mergedClasses,
                eventPrefs:     mergedPrefs,
              }),
            }).then(() => {
              if (newEvents + newTodos > 0) {
                pushToast(
                  'Synced to your account',
                  `${newEvents} event${newEvents !== 1 ? 's' : ''} and ${newTodos} task${newTodos !== 1 ? 's' : ''} uploaded.`,
                )
              }
            }).catch(() => {})
          } catch {}
        }, 500)
      })
      .catch(() => {})
  }, [currentUser]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Ongoing debounced cloud sync ────────────────────────────────────────────
  // Pushes the full local state to the DB 2 seconds after any change.
  // Only runs after the initial merge is complete (hasMergedCloud guard).
  useEffect(() => {
    if (!currentUser || !hasMergedCloud.current) return
    clearTimeout(syncTimerRef.current)
    syncTimerRef.current = setTimeout(() => {
      fetch('/api/sync', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events,
          todos,
          todoCategories,
          classSchedule:  canvasClasses,
          eventPrefs,
        }),
      }).catch(() => {})
    }, 2000)
    return () => clearTimeout(syncTimerRef.current)
  }, [events, todos, todoCategories, canvasClasses, eventPrefs, currentUser]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close "+ New" popup on outside click
  useEffect(() => {
    if (!showAddMenu) return
    function onDown(e) { if (!addMenuRef.current?.contains(e.target)) setShowAddMenu(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [showAddMenu])

  useEffect(() => {
    const id = setInterval(() => setClockTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(({ coords: { latitude: lat, longitude: lon } }) => {
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weathercode&hourly=precipitation_probability,weathercode&forecast_days=1&timezone=auto`)
        .then(r => r.json())
        .then(d => {
          const temp = Math.round(d.current.temperature_2m)
          const code = d.current.weathercode
          const nowHour = new Date().getHours()
          const hours   = d.hourly?.time?.map((t, i) => ({
            hour: new Date(t).getHours(),
            precip: d.hourly.precipitation_probability[i],
            wcode:  d.hourly.weathercode[i],
          })) || []
          const isRainingNow = code >= 51 && code <= 82
          let rainMsg = null
          if (isRainingNow) {
            // Find when rain stops (next hour with precip < 30)
            const stopHour = hours.find(h => h.hour > nowHour && h.precip < 30)
            if (stopHour) {
              const mins = (stopHour.hour - nowHour) * 60
              rainMsg = `Rain stops in ~${mins < 60 ? mins + 'm' : Math.round(mins/60) + 'h'}`
            }
          } else {
            // Find next hour with precip >= 60
            const startHour = hours.find(h => h.hour > nowHour && h.precip >= 60)
            if (startHour) {
              const mins = (startHour.hour - nowHour) * 60
              rainMsg = `Rain in ~${mins < 60 ? mins + 'm' : Math.round(mins/60) + 'h'}`
            }
          }
          setWeather({ temp, code, rainMsg })
        })
        .catch(() => {})
    }, () => {})
  }, [])

  /* ── Load from localStorage ── */
  useEffect(() => {
    try {
      const e  = localStorage.getItem('lv-events')
      const t  = localStorage.getItem('lv-todos')
      const tc = localStorage.getItem('lv-todo-cats')
      const ep = localStorage.getItem('lv-event-prefs')
      if (e)  setEvents(JSON.parse(e))
      if (t)  setTodos(JSON.parse(t))
      if (tc) setTodoCategories(JSON.parse(tc))
      if (ep) setEventPrefs(JSON.parse(ep))
      // Canvas
      const ca  = localStorage.getItem('lv-canvas-assignments')
      const cc  = localStorage.getItem('lv-canvas-classes')
      const cce = localStorage.getItem('lv-canvas-cal-events')
      if (ca)  setCanvasAssignments(JSON.parse(ca))
      if (cc)  setCanvasClasses(JSON.parse(cc))
      if (cce) setCanvasCalEvents(JSON.parse(cce))
    } catch (_) {}
  }, [])

  useEffect(() => { localStorage.setItem('lv-events',    JSON.stringify(events))         }, [events])
  useEffect(() => { localStorage.setItem('lv-todos',     JSON.stringify(todos))          }, [todos])
  useEffect(() => { localStorage.setItem('lv-todo-cats', JSON.stringify(todoCategories)) }, [todoCategories])
  useEffect(() => { localStorage.setItem('lv-event-prefs', JSON.stringify(eventPrefs))   }, [eventPrefs])
  // Canvas
  useEffect(() => { localStorage.setItem('lv-canvas-assignments', JSON.stringify(canvasAssignments)) }, [canvasAssignments])
  useEffect(() => { localStorage.setItem('lv-canvas-classes',     JSON.stringify(canvasClasses))     }, [canvasClasses])
  useEffect(() => { localStorage.setItem('lv-canvas-cal-events',  JSON.stringify(canvasCalEvents))   }, [canvasCalEvents])

  const pushToast = useCallback((title, subtitle) => {
    const id = String(Date.now())
    setToasts(p => [...p, { id, title, subtitle }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 5000)
  }, [])

  /* ── Reminder checker ── */
  useEffect(() => {
    function check() {
      const now = Date.now()
      ;[...events.map(ev => ({ item: ev, key: 'ev-' + ev.id, date: ev.start, title: ev.title })),
        ...todos.map(td => ({ item: td, key: 'td-' + td.id, date: td.dueDate ? td.dueDate + 'T00:00:00' : null, title: td.title })),
      ].forEach(({ item, key, date, title }) => {
        if (!item.reminder || item.completed) return
        if (shownReminders.current.has(key)) return
        const due = date ? new Date(date).getTime() : null
        const at  = item.reminder.at
          ? new Date(item.reminder.at).getTime()
          : due != null ? due - item.reminder.ms : null
        if (at == null) return
        if (now >= at && now < at + 120_000) {
          shownReminders.current.add(key)
          pushToast(`Reminder: ${title}`, item.reminder.label)
          if (typeof window !== 'undefined' && Notification?.permission === 'granted')
            new Notification(`Reminder: ${title}`, { body: item.reminder.label })
        }
      })
    }
    check()
    const id = setInterval(check, 60_000)
    return () => clearInterval(id)
  }, [events, todos, pushToast])

  /* ── Event CRUD ── */
  const saveEvent = useCallback((ev, scope = 'single') => {
    if (scope === 'all') {
      // "Edit all in series": delete every existing instance then re-expand from scratch
      const groupId = ev.recurrenceGroupId
      if (!groupId) return
      const baseEvent = { ...ev, id: groupId }
      const newExpanded = expandRecurring(baseEvent)
      setEvents(prev => [
        ...prev.filter(e => e.recurrenceGroupId !== groupId && e.id !== groupId),
        ...newExpanded,
      ])
    } else {
      const expanded = expandRecurring(ev)
      if (ev.id && events.some(e => e.id === ev.id)) {
        // Single edit — replace just that one instance
        setEvents(prev => prev.map(e => e.id === ev.id ? expanded[0] : e))
      } else {
        setEvents(prev => [...prev, ...expanded])
      }
    }
  }, [events])

  const deleteEvent = useCallback((id, groupId, deleteAll = false) => {
    if (groupId && deleteAll) {
      setEvents(prev => prev.filter(e => e.recurrenceGroupId !== groupId && e.id !== id))
    } else {
      setEvents(prev => prev.filter(e => e.id !== id))
    }
    setTodos(prev => prev.map(t => t.linkedEventId === id ? { ...t, linkedEventId: null } : t))
  }, [])

  const hideEvent = useCallback((id) => {
    setEventPrefs(prev => ({ ...prev, [id]: { ...(prev[id] ?? {}), hidden: true } }))
    setToasts(prev => prev.filter(t => t.eventId !== id))
  }, [])

  const unhideEvent = useCallback((id) => {
    setEventPrefs(prev => ({ ...prev, [id]: { ...(prev[id] ?? {}), hidden: false } }))
  }, [])

  const setGoogleEventColor = useCallback((id, color) => {
    setEventPrefs(prev => ({ ...prev, [id]: { ...(prev[id] ?? {}), color } }))
    setToasts(prev => prev.map(toast => toast.eventId === id
      ? {
          ...toast,
          actions: toast.actions?.map(action => action.type === 'color' ? { ...action, value: color } : action),
        }
      : toast
    ))
  }, [])

  /** Toggle semi-transparent display of hidden GCal events */
  const showHiddenEvents = useCallback(() => {
    setShowHiddenGcal(v => !v)
  }, [])

  /* ── Todo CRUD ── */
  const addTodo    = useCallback((t) => setTodos(p => [...p, { ...t, id: String(Date.now()), completed: false }]), [])
  const toggleTodo = useCallback((id) => {
    // Handle recurring instances: id looks like "baseId-r-YYYY-MM-DD"
    const rMatch = id.match(/^(.+)-r-(\d{4}-\d{2}-\d{2})$/)
    if (rMatch) {
      const [, baseId, dateStr] = rMatch
      setTodos(p => p.map(t => {
        if (t.id !== baseId) return t
        const completed = t.completedDates || []
        return completed.includes(dateStr)
          ? { ...t, completedDates: completed.filter(d => d !== dateStr) }
          : { ...t, completedDates: [...completed, dateStr] }
      }))
    } else {
      setTodos(p => p.map(t => t.id === id ? { ...t, completed: !t.completed } : t))
    }
  }, [])
  const deleteTodo = useCallback((id) => setTodos(p => p.filter(t => t.id !== id)), [])
  const updateTodo = useCallback((updated) => setTodos(p => p.map(t => t.id === updated.id ? updated : t)), [])

  /* ── Import / Export ── */
  // ImportExportButton handles conflict resolution and sends the fully-merged arrays.
  // We just set state directly — the existing localStorage sync effects will persist them.
  const handleImport = useCallback(({ events: mergedEvents, todos: mergedTodos, todoCategories: mergedCats }) => {
    setEvents(mergedEvents)
    setTodos(mergedTodos)
    setTodoCategories(mergedCats)
    const addedEvents = mergedEvents.length - events.length
    const addedTodos  = mergedTodos.length  - todos.length
    pushToast('Import complete', `${addedEvents > 0 ? `+${addedEvents} event${addedEvents !== 1 ? 's' : ''}` : 'No new events'}, ${addedTodos > 0 ? `+${addedTodos} task${addedTodos !== 1 ? 's' : ''}` : 'no new tasks'}.`)
  }, [events.length, todos.length, pushToast])

  /* ── Google Calendar sync ── */
  const syncGoogleCalendar = useCallback(async () => {
    setGcSyncing(true)
    try {
      const prefs    = JSON.parse(localStorage.getItem('lv-google-prefs') ?? '{}')
      const requests = []

      for (const [accountId, accPref] of Object.entries(prefs)) {
        if (accPref?.enabled === false) continue
        const calendarIds    = []
        const calendarColors = {}
        for (const [calId, calPref] of Object.entries(accPref?.calendars ?? {})) {
          const isEnabled = typeof calPref === 'boolean' ? calPref : calPref?.enabled !== false
          if (isEnabled) {
            calendarIds.push(calId)
            calendarColors[calId] = (typeof calPref === 'object' && calPref?.color) ? calPref.color : '#4285f4'
          }
        }
        if (calendarIds.length > 0) requests.push({ accountId, calendarIds, calendarColors })
      }

      if (requests.length === 0) { setGoogleEvents([]); return }

      const res = await fetch('/api/google/events', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ requests }),
      })
      if (!res.ok) return
      const { events: gcEvents } = await res.json()
      setGoogleEvents(gcEvents ?? [])
    } catch (err) {
      console.error('Google Calendar sync failed:', err)
    } finally {
      setGcSyncing(false)
    }
  }, [])

  // Initial sync on mount (only if prefs exist)
  useEffect(() => {
    const prefs = JSON.parse(localStorage.getItem('lv-google-prefs') ?? '{}')
    if (Object.keys(prefs).length > 0) syncGoogleCalendar()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Periodic sync every 15 minutes
  useEffect(() => {
    const id = setInterval(() => {
      const prefs = JSON.parse(localStorage.getItem('lv-google-prefs') ?? '{}')
      if (Object.keys(prefs).length > 0) syncGoogleCalendar()
    }, 15 * 60_000)
    return () => clearInterval(id)
  }, [syncGoogleCalendar])

  /* ── Canvas sync ── */
  const syncCanvasAssignments = useCallback(async () => {
    const prefs = JSON.parse(localStorage.getItem('lv-canvas-prefs') ?? '{}')
    if (!prefs.connected) return
    const enabledCourses = Object.entries(prefs.coursesEnabled ?? {})
      .filter(([, v]) => v !== false)
      .map(([id]) => Number(id))
    if (!enabledCourses.length) { setCanvasAssignments([]); return }

    // Fetch course names from cached assignment data or re-fetch courses
    let courseNames = {}
    try {
      const { courses: list } = await fetch('/api/canvas/courses').then(r => r.json())
      for (const c of list ?? []) courseNames[c.id] = c.name
    } catch { /* use empty names */ }

    const courses = enabledCourses.map(id => ({ id, name: courseNames[id] ?? String(id) }))
    const res = await fetch('/api/canvas/assignments', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ courses }),
    })
    if (res.status === 401) { pushToast('Canvas token expired', 'Please reconnect Canvas in Settings.'); return }
    if (!res.ok) return
    const { assignments: fresh } = await res.json()

    setCanvasAssignments(prev => {
      const prevMap = Object.fromEntries(prev.map(a => [a.id, a]))
      return (fresh ?? []).map(a => ({
        ...a,
        done:          prevMap[a.id]?.done          ?? (a.submissionState === 'submitted' || a.submissionState === 'graded'),
        doneDate:      prevMap[a.id]?.doneDate      ?? null,
        hidden:        prevMap[a.id]?.hidden        ?? false,
        linkedEventId: prevMap[a.id]?.linkedEventId ?? null,
        priority:      prevMap[a.id]?.priority      ?? 'medium',
        notes:         prevMap[a.id]?.notes         ?? null,
        reminder:      prevMap[a.id]?.reminder      ?? null,
      }))
    })

    // Update lastSyncAt
    const updated = { ...prefs, lastSyncAt: new Date().toISOString() }
    localStorage.setItem('lv-canvas-prefs', JSON.stringify(updated))
  }, [pushToast])

  const syncCanvasCalEvents = useCallback(async () => {
    const prefs = JSON.parse(localStorage.getItem('lv-canvas-prefs') ?? '{}')
    if (!prefs.connected) return
    const enabledIds = Object.entries(prefs.coursesEnabled ?? {})
      .filter(([, v]) => v !== false)
      .map(([id]) => Number(id))
    if (!enabledIds.length) { setCanvasCalEvents([]); return }

    const now      = new Date()
    const startDate = new Date(now); startDate.setDate(startDate.getDate() - 14)
    const endDate   = new Date(now); endDate.setDate(endDate.getDate() + 60)

    const res = await fetch('/api/canvas/calendar', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        courseIds: enabledIds,
        startDate: startDate.toISOString().slice(0, 10),
        endDate:   endDate.toISOString().slice(0, 10),
      }),
    })
    if (res.status === 401) { pushToast('Canvas token expired', 'Please reconnect Canvas in Settings.'); return }
    if (!res.ok) return
    const { events: calEvs } = await res.json()

    // Apply course colors from prefs
    const prefs2 = JSON.parse(localStorage.getItem('lv-canvas-prefs') ?? '{}')
    setCanvasCalEvents((calEvs ?? []).map(e => ({
      ...e,
      color: e.color || '#E8751A',
    })))
  }, [pushToast])

  const syncCanvas = useCallback(async () => {
    setCvSyncing(true)
    try {
      await Promise.all([syncCanvasAssignments(), syncCanvasCalEvents()])
    } catch (err) {
      console.error('Canvas sync failed:', err)
    } finally {
      setCvSyncing(false)
    }
  }, [syncCanvasAssignments, syncCanvasCalEvents])

  // Initial sync on mount
  useEffect(() => {
    const prefs = JSON.parse(localStorage.getItem('lv-canvas-prefs') ?? '{}')
    if (prefs.connected) syncCanvas()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Periodic 15-min sync
  useEffect(() => {
    const id = setInterval(() => {
      const prefs = JSON.parse(localStorage.getItem('lv-canvas-prefs') ?? '{}')
      if (prefs.connected) syncCanvas()
    }, 15 * 60_000)
    return () => clearInterval(id)
  }, [syncCanvas])

  /* ── Canvas calendar visibility prefs ── */
  const toggleCanvasOnCalendar = useCallback(() => {
    setCanvasCalPrefs(prev => {
      const next = { ...prev, showOnCalendar: !prev.showOnCalendar }
      try {
        const lsPref = JSON.parse(localStorage.getItem('lv-canvas-prefs') ?? '{}')
        localStorage.setItem('lv-canvas-prefs', JSON.stringify({ ...lsPref, showOnCalendar: next.showOnCalendar }))
      } catch {}
      return next
    })
  }, [])

  const updateCourseColors = useCallback((courseColors) => {
    setCanvasCalPrefs(prev => ({ ...prev, courseColors: courseColors ?? {} }))
  }, [])

  const toggleCourseOnCalendar = useCallback((courseId, enabled) => {
    setCanvasCalPrefs(prev => {
      const next = { ...prev, coursesEnabled: { ...prev.coursesEnabled, [String(courseId)]: enabled } }
      try {
        const lsPref = JSON.parse(localStorage.getItem('lv-canvas-prefs') ?? '{}')
        localStorage.setItem('lv-canvas-prefs', JSON.stringify({ ...lsPref, coursesEnabled: next.coursesEnabled }))
      } catch {}
      return next
    })
  }, [])

  /* ── Canvas CRUD ── */
  const toggleCanvasAssignment = useCallback((id) => {
    setCanvasAssignments(prev => prev.map(a =>
      a.id === id
        ? { ...a, done: !a.done, doneDate: !a.done ? new Date().toISOString().slice(0, 10) : null }
        : a
    ))
  }, [])

  const hideCanvasAssignment = useCallback((id) => {
    setCanvasAssignments(prev => prev.map(a =>
      a.id === id ? { ...a, hidden: !a.hidden } : a
    ))
  }, [])

  const updateCanvasAssignment = useCallback((updated) => {
    setCanvasAssignments(prev => prev.map(a => a.id === updated.id ? { ...a, ...updated } : a))
  }, [])

  const updateCanvasNotes = useCallback((id, notes) => {
    setCanvasAssignments(prev => prev.map(a => a.id === id ? { ...a, notes } : a))
  }, [])

  /* ── Class schedule CRUD ── */
  const saveCanvasClass = useCallback((entry) => {
    setCanvasClasses(prev => {
      const idx = prev.findIndex(c => c.id === entry.id)
      return idx >= 0 ? prev.map(c => c.id === entry.id ? entry : c) : [...prev, entry]
    })
  }, [])

  const deleteCanvasClass = useCallback((id) => {
    setCanvasClasses(prev => prev.filter(c => c.id !== id))
  }, [])

  /* ── Expand class schedule entries into calendar events ── */
  const canvasClassEvents = useMemo(() => {
    return canvasClasses
      .filter(cls => cls.enabled !== false && cls.days?.length && cls.semesterStart && cls.semesterEnd)
      .flatMap(cls => {
        const baseEvent = {
          id:    cls.id,
          title: cls.courseName + (cls.section ? ` (${cls.section})` : ''),
          start: `${cls.semesterStart}T${cls.startTime}:00`,
          end:   `${cls.semesterStart}T${cls.endTime}:00`,
          color: cls.color || '#3a6fa8',
          extendedProps: {
            source:    'canvas-class',
            classId:   cls.id,
            professor: cls.professor,
            location:  cls.location,
            courseName: cls.courseName,
          },
          recurrence: {
            type:  'custom',
            days:  cls.days,
            until: cls.semesterEnd,
          },
        }
        return expandRecurring(baseEvent).map(ev => ({
          ...ev,
          id: `canvascls_${cls.id}_${ev.id.split('-r-')[1] ?? 'base'}`,
        }))
      })
  }, [canvasClasses])

  /* ── Calendar handlers ── */
  const handleViewChange = useCallback((viewType) => {
    if (viewType === 'timeGridDay')  setTodoPanelWidth(w => Math.max(w, 420))
    if (viewType === 'timeGridWeek') setTodoPanelWidth(w => w > 380 ? 280 : w)
  }, [])

  const handleDateClick  = useCallback((info) => {
    if (info.allDay) {
      setInitialTodoDate(info.dateStr)
      setEditingTodo(null)
      setShowTodoModal(true)
    } else {
      setEventModal({ open: true, event: null, date: info.dateStr })
    }
  }, [])
  const handleEventClick = useCallback((info) => {
    if (info.event.extendedProps?.type === 'todo') {
      const todoId = info.event.extendedProps.todoId
      const todo   = todos.find(t => t.id === todoId)
      if (todo) { setEditingTodo(todo); setShowTodoModal(true) }
      setActiveNav('todos')
      return
    }
    // Canvas class schedule events — show info toast
    if (info.event.extendedProps?.source === 'canvas-class') {
      const { professor, location, courseName } = info.event.extendedProps
      const parts = [professor && `Prof. ${professor}`, location].filter(Boolean)
      const id = String(Date.now())
      setToasts(p => [...p, {
        id,
        title: info.event.title,
        subtitle: parts.join(' · ') || 'Class',
      }])
      setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 8000)
      return
    }

    // Canvas calendar events (professor-posted) — show info toast
    if (info.event.extendedProps?.source === 'canvas-cal') {
      const { locationName, htmlUrl, description } = info.event.extendedProps
      const plain = description ? description.replace(/<[^>]+>/g, ' ').trim().slice(0, 120) : ''
      const subtitle = [locationName && `📍 ${locationName}`, plain].filter(Boolean).join('\n') || 'Canvas event'
      const id = String(Date.now())
      setToasts(p => [...p, {
        id,
        title: info.event.title,
        subtitle: subtitle,
        actions: htmlUrl ? [{ label: 'Open in Canvas', onClick: () => window.open(htmlUrl, '_blank') }] : [],
      }])
      setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 10000)
      return
    }

    // Google Calendar events are read-only – show a brief toast
    if (info.event.extendedProps?.source === 'google') {
      const desc = info.event.extendedProps.description
      const location = info.event.extendedProps.location
      const subtitle = [desc, location && `Location: ${location}`].filter(Boolean).join('\n') || 'Google Calendar event'
      const currentColor = eventPrefs[info.event.id]?.color || info.event.backgroundColor || info.event.borderColor || '#4285f4'
      const id = String(Date.now())
      setToasts(p => [...p, {
        id,
        eventId: info.event.id,
        title: info.event.title,
        subtitle: subtitle.slice(0, 180),
        actions: [
          { label: 'Color', type: 'color', value: currentColor, onChange: color => setGoogleEventColor(info.event.id, color), dismiss: false },
          eventPrefs[info.event.id]?.hidden
            ? { label: 'Unhide event', onClick: () => unhideEvent(info.event.id) }
            : { label: 'Hide event', variant: 'danger', onClick: () => hideEvent(info.event.id) },
        ],
      }])
      setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 12000)
      return
    }
    setEventModal({ open: true, event: info.event, date: null })
  }, [todos, eventPrefs, hideEvent, unhideEvent, setGoogleEventColor])

  /* ── Merge todos + Google events → calendar events ── */
  const visibleEvents = useMemo(
    () => events.filter(e => !eventPrefs[e.id]?.hidden),
    [events, eventPrefs],
  )
  const visibleGoogleEvents = useMemo(
    () => googleEvents
      .filter(e => !eventPrefs[e.id]?.hidden)
      .map(e => eventPrefs[e.id]?.color ? { ...e, color: eventPrefs[e.id].color } : e),
    [googleEvents, eventPrefs],
  )
  /** Hidden events (local + GCal) shown semi-transparently when the toggle is on */
  const hiddenGcalEvents = useMemo(
    () => {
      if (!showHiddenGcal) return []
      const hiddenLocal = events
        .filter(e => eventPrefs[e.id]?.hidden)
        .map(e => ({
          ...e,
          classNames: ['lv-hidden-event'],
          extendedProps: { ...(e.extendedProps ?? {}), isHiddenEvent: true },
        }))
      const hiddenGcal = googleEvents
        .filter(e => eventPrefs[e.id]?.hidden)
        .map(e => ({
          ...e,
          color: eventPrefs[e.id]?.color || e.color,
          classNames: ['lv-hidden-event'],
          extendedProps: { ...(e.extendedProps ?? {}), isHiddenEvent: true },
        }))
      return [...hiddenLocal, ...hiddenGcal]
    },
    [events, googleEvents, eventPrefs, showHiddenGcal],
  )
  // Canvas calendar events filtered by prefs
  const visibleCanvasCalEvents = useMemo(() =>
    canvasCalEvents.filter(e =>
      canvasCalPrefs.showOnCalendar &&
      canvasCalPrefs.coursesEnabled[String(e.extendedProps?.courseId)] !== false,
    ),
  [canvasCalEvents, canvasCalPrefs])

  // Map from Canvas courseId → class schedule color (for linked courses)
  const scheduleColorByCourseId = useMemo(() => {
    const map = {}
    for (const cls of canvasClasses) {
      if (cls.canvasCourseId) map[cls.canvasCourseId] = cls.color
    }
    return map
  }, [canvasClasses])

  // Canvas assignments shown as all-day task markers (like todos) — not done, has due date
  const canvasAssignmentTasks = useMemo(() =>
    canvasCalPrefs.showOnCalendar
      ? canvasAssignments
          .filter(a =>
            !a.done && !a.hidden && a.dueAt &&
            canvasCalPrefs.coursesEnabled[String(a.courseId)] !== false,
          )
          .map(a => ({
            id:    `cal-canvas-${a.id}`,
            title: a.title,
            start: a.dueAt.slice(0, 10),
            allDay: true,
            // Color priority: schedule-linked color > user-set course color > Canvas orange
            color: scheduleColorByCourseId[a.courseId]
              ?? canvasCalPrefs.courseColors?.[a.courseId]
              ?? '#E8751A',
            extendedProps: { type: 'canvas-assignment', canvasId: a.id, courseName: a.courseName, htmlUrl: a.htmlUrl },
          }))
      : [],
  [canvasAssignments, canvasCalPrefs, scheduleColorByCourseId])

  const allCalendarEvents = [
    ...visibleEvents,
    ...visibleGoogleEvents,
    ...hiddenGcalEvents,
    ...canvasClassEvents,
    ...visibleCanvasCalEvents,
    ...canvasAssignmentTasks,
    ...todos.filter(t => !t.completed).flatMap(t => {
      const todoCatColor = todoCategories.find(c => c.id === t.category)?.color || '#94a3b8'
      const instances = expandRecurringTodo(t)
      const calItems = instances.map(inst => ({
        id: `cal-todo-${inst.id}`, title: inst.title, start: inst.dueDate, allDay: true,
        color: todoCatColor,
        extendedProps: { type: 'todo', todoId: t.id, priority: t.priority },
      }))
      if (t.linkedEventId && !t.recurrence) {
        const ev = visibleEvents.find(e => e.id === t.linkedEventId)
        if (ev) calItems.push({
          id: `cal-linked-${t.id}`, title: `↳ ${t.title}`, start: (ev.start || '').slice(0, 10),
          allDay: true, color: todoCatColor,
          extendedProps: { type: 'todo', todoId: t.id, priority: t.priority },
        })
      }
      return calItems
    }),
  ]

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const now = new Date()

    // Human-friendly due-date label for tasks due within 2 weeks
    function smartDueLabel(dateStr) {
      if (!dateStr) return 'No due date'
      const today = new Date(); today.setHours(0, 0, 0, 0)
      const due = new Date(dateStr + 'T00:00:00')
      const diffDays = Math.round((due - today) / 86_400_000)
      if (diffDays < 0) return `Due ${dateStr}`
      if (diffDays === 0) return 'Due today'
      if (diffDays === 1) return 'Due tomorrow'
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      const dayName = dayNames[due.getDay()]
      const mm = String(due.getMonth() + 1).padStart(2, '0')
      const dd = String(due.getDate()).padStart(2, '0')
      const dateFmt = `${mm}/${dd}`
      if (diffDays <= 6) return `Due this ${dayName} (${dateFmt})`
      if (diffDays <= 13) return `Due next ${dayName} (${dateFmt})`
      return `Due ${dateStr}`
    }
    const matchesText = (value) => String(value || '').toLowerCase().includes(query)

    const shouldIncludeStatus = (item, type) => {
      if (searchStatus === 'all') return true
      if (type === 'todo') {
        if (searchStatus === 'done') return item.completed === true
        if (searchStatus === 'upcoming') return item.dueDate && new Date(item.dueDate + 'T23:59:59') >= now
        return true
      }
      if (type === 'canvas') {
        if (searchStatus === 'done') return item.done || item.submissionState === 'graded' || item.submissionState === 'submitted'
        if (searchStatus === 'upcoming') return !item.done && (!item.dueAt || new Date(item.dueAt) >= now)
        return true
      }
      if (type === 'event' || type === 'google') {
        if (searchStatus === 'done') return false
        if (searchStatus === 'upcoming') return item.start && new Date(item.start) >= now
        return true
      }
      return true
    }

    const result = {
      events: [],
      googleEvents: [],
      canvasAssignments: [],
      todos: [],
    }

    const categoryColor = (categoryId) => EVENT_CATEGORIES.find(c => c.id === categoryId)?.color || 'var(--blue)'
    const categoryLabel = (categoryId) => EVENT_CATEGORIES.find(c => c.id === categoryId)?.label || categoryId || 'Event'

    const eventFilter = (e) => {
      const title = e.title || e.summary || ''
      const notes = e.extendedProps?.notes || e.description || ''
      const category = e.extendedProps?.category || ''
      return (matchesText(title) || matchesText(notes) || matchesText(category)) && shouldIncludeStatus(e, 'event')
    }

    const googleFilter = (e) => {
      // Google events use `title` (set by API route), not `summary`
      const title = e.title || e.summary || ''
      const notes = e.extendedProps?.description || e.description || ''
      return (matchesText(title) || matchesText(notes)) && shouldIncludeStatus(e, 'google')
    }

    const canvasFilter = (a) => {
      const title = a.title || ''
      const course = a.courseName || ''
      const status = a.submissionState || ''
      return (matchesText(title) || matchesText(course) || matchesText(status) || matchesText(a.htmlUrl)) && shouldIncludeStatus(a, 'canvas')
    }

    const todoFilter = (t) => {
      const title = t.title || ''
      const notes = t.notes || ''
      const category = todoCategories.find(c => c.id === t.category)?.label || t.category || ''
      const linked = events.find(e => e.id === t.linkedEventId)?.title || ''
      return (matchesText(title) || matchesText(notes) || matchesText(category) || matchesText(linked)) && shouldIncludeStatus(t, 'todo')
    }

    if (!query) {
      const weekFromNow = new Date(now.getTime() + 7 * 24 * 3600_000)
      if (searchScope === 'all' || searchScope === 'events') {
        result.events = events
          .filter(e => { const s = e.start ? new Date(e.start) : null; return s && s >= now && s <= weekFromNow && !eventPrefs[e.id]?.hidden })
          .sort((a, b) => new Date(a.start) - new Date(b.start))
          .slice(0, 5)
          .map(event => ({
            kind: 'event',
            label: event.title || event.summary || 'Untitled event',
            subtitle: event.start ? new Date(event.start).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'No date',
            source: 'Event',
            item: event,
            tagLabel: categoryLabel(event.extendedProps?.category),
            tagColor: categoryColor(event.extendedProps?.category),
          }))
        result.googleEvents = googleEvents
          .filter(e => { const s = e.start ? new Date(e.start) : null; return s && s >= now && s <= weekFromNow && !eventPrefs[e.id]?.hidden })
          .sort((a, b) => new Date(a.start) - new Date(b.start))
          .slice(0, 5)
          .map(event => ({
            kind: 'google',
            label: event.title || event.summary || 'Untitled event',
            subtitle: event.start ? new Date(event.start).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'No date',
            source: 'Google Calendar',
            item: event,
            tagLabel: 'Google',
            tagColor: eventPrefs[event.id]?.color || event.color || event.backgroundColor || '#4285f4',
          }))
      }
      if (searchScope === 'all' || searchScope === 'tasks') {
        result.todos = todos.filter(todoFilter).map(todo => ({
          kind: 'todo',
          label: todo.title,
          subtitle: smartDueLabel(todo.dueDate),
          source: 'Task',
          item: todo,
          tagLabel: todoCategories.find(c => c.id === todo.category)?.label || todo.category || 'Task',
          tagColor: todoCategories.find(c => c.id === todo.category)?.color || '#10b981',
        }))
      }
      if (searchScope === 'all' || searchScope === 'canvas') {
        const nowIso = now.toISOString()
        result.canvasAssignments = canvasAssignments
          .filter(a => !a.done && !a.hidden && a.dueAt && a.dueAt >= nowIso)
          .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
          .slice(0, 5)
          .map(a => ({
            kind: 'canvas',
            label: a.title,
            subtitle: a.courseName || 'Canvas assignment',
            source: 'Canvas',
            item: a,
            tagLabel: a.courseName || 'Canvas',
            tagColor: '#E8751A',
          }))
      }
      return result
    }

    if (searchScope === 'all' || searchScope === 'events') {
      result.events = events
        .filter(eventFilter)
        .filter(e => !e.start || new Date(e.start) >= now)
        .sort((a, b) => new Date(a.start) - new Date(b.start))
        .slice(0, 15)
        .map(event => ({
          kind: 'event',
          label: event.title || event.summary || 'Untitled event',
          subtitle: event.start ? new Date(event.start).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'No date',
          source: 'Event',
          item: event,
          hidden: !!eventPrefs[event.id]?.hidden,
          tagLabel: categoryLabel(event.extendedProps?.category),
          tagColor: categoryColor(event.extendedProps?.category),
        }))
      result.googleEvents = googleEvents
        .filter(googleFilter)
        .filter(e => !e.start || new Date(e.start) >= now)
        .sort((a, b) => new Date(a.start) - new Date(b.start))
        .slice(0, 15)
        .map(event => ({
          kind: 'google',
          label: event.summary || event.title || 'Untitled event',
          subtitle: event.start ? new Date(event.start).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'No date',
          source: 'Google Calendar',
          item: event,
          hidden: !!eventPrefs[event.id]?.hidden,
          tagLabel: 'Google',
          tagColor: event.color || event.backgroundColor || '#4285f4',
        }))
    }
    if (searchScope === 'all' || searchScope === 'canvas') {
      result.canvasAssignments = canvasAssignments.filter(canvasFilter).map(assignment => ({
        kind: 'canvas',
        label: assignment.title,
        subtitle: assignment.courseName || 'Canvas assignment',
        source: 'Canvas',
        item: assignment,
        tagLabel: assignment.courseName || 'Canvas',
        tagColor: assignment.color || '#E8751A',
      }))
    }
    if (searchScope === 'all' || searchScope === 'tasks') {
      result.todos = todos.filter(todoFilter).map(todo => ({
        kind: 'todo',
        label: todo.title,
        subtitle: smartDueLabel(todo.dueDate),
        source: 'Task',
        item: todo,
        tagLabel: todoCategories.find(c => c.id === todo.category)?.label || todo.category || 'Task',
        tagColor: todoCategories.find(c => c.id === todo.category)?.color || '#10b981',
      }))
    }
    return result
  }, [searchQuery, searchScope, searchStatus, events, googleEvents, canvasAssignments, todos, todoCategories, eventPrefs])

  const openSearchResult = useCallback((result) => {
    closeSearchPopup()
    if (result.kind === 'event' && result.item) {
      setActiveNav('calendar')
      setSearchHighlightId(result.item.id)
      const evDate = result.item.start?.slice(0, 10)
      if (evDate) setCalendarTargetDate(evDate)
      setEventModal({ open: true, event: result.item, date: null })
      return
    }
    if (result.kind === 'google' && result.item) {
      setActiveNav('calendar')
      setSearchHighlightId(result.item.id)
      const evDate = (result.item.start?.dateTime || result.item.start?.date || result.item.start)?.slice(0, 10)
      if (evDate) setCalendarTargetDate(evDate)
      return
    }
    if (result.kind === 'canvas') {
      setActiveNav('courses')
      return
    }
    if (result.kind === 'todo' && result.item) {
      setActiveNav('todos')
      setEditingTodo(result.item)
      setShowTodoModal(true)
      return
    }
  }, [closeSearchPopup, setToasts])

  const navigateToItem = useCallback((item, type) => {
    if (type === 'event') {
      setActiveNav('calendar')
      setSearchHighlightId(item.id)
      const evDate = item.start?.slice(0, 10)
      if (evDate) setCalendarTargetDate(evDate)
      setEventModal({ open: true, event: item, date: null })
    } else if (type === 'task') {
      setActiveNav('todos')
      setEditingTodo(item)
      setShowTodoModal(true)
    }
  }, [])

  const nextEventToday = useMemo(() => {
    if (!mounted) return null
    const todayStr    = clockTime.toISOString().slice(0, 10)
    const tomorrowDt  = new Date(clockTime); tomorrowDt.setDate(tomorrowDt.getDate() + 1)
    const tomorrowStr = tomorrowDt.toISOString().slice(0, 10)
    // First: soonest remaining event today
    const todayNext = visibleEvents
      .filter(e => !e.allDay && e.start?.startsWith(todayStr) && new Date(e.start) > clockTime)
      .sort((a, b) => new Date(a.start) - new Date(b.start))[0]
    if (todayNext) return todayNext
    // Fallback: first event tomorrow
    return visibleEvents
      .filter(e => !e.allDay && e.start?.startsWith(tomorrowStr))
      .sort((a, b) => new Date(a.start) - new Date(b.start))[0] || null
  }, [visibleEvents, clockTime, mounted])

  function timeUntil(start) {
    const diff = new Date(start) - clockTime
    if (diff <= 0) return null
    const h = Math.floor(diff / 3600000)
    const m = Math.floor((diff % 3600000) / 60000)
    const s = Math.floor((diff % 60000) / 1000)
    if (h > 0) return `${h}h ${m}m`
    if (m > 0) return `${m}m ${s}s`
    return `${s}s`
  }

  function weatherIcon(code) {
    if (code === 0)         return '☀️'
    if (code <= 3)          return '⛅'
    if (code <= 48)         return '🌫️'
    if (code <= 67)         return '🌧️'
    if (code <= 77)         return '🌨️'
    if (code <= 82)         return '🌦️'
    return '⛈️'
  }

  if (!mounted) return null

  const canvasConnected = canvasAssignments.length > 0
  const NAV_ITEMS = [
    { id: 'calendar', label: 'Calendar', icon: <CalendarDays size={22}/> },
    { id: 'todos',    label: 'To-Do',    icon: <ListTodo size={22}/> },
    { id: 'search',   label: 'Search',   icon: <Search size={22}/> },
    ...(canvasConnected
      ? [{ id: 'courses', label: 'Courses', icon: <BookOpen size={22}/> }]
      : []),
    { id: 'corvus',   label: 'Corvus',   icon: <CrowIcon size={21} color="currentColor"/> },
    // Settings tab — mobile only (sidebar handles settings on desktop)
    ...(isMobile ? [{ id: 'settings', label: 'Settings', icon: <Settings size={22}/> }] : []),
  ]

  return (
    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', height: '100dvh', overflow: 'hidden', background: 'var(--bg)', color: 'var(--text)' }}>

      {/* ── Sidebar (hidden on mobile — replaced by bottom tabs) ── */}
      {!isMobile && <aside style={{ width: isTablet ? 168 : 220, background: 'var(--sidebar)', display: 'flex', flexDirection: 'column', flexShrink: 0, boxShadow: 'var(--shadow-lg)', position: 'relative', overflow: 'hidden', transition: 'width 0.25s cubic-bezier(0.16,1,0.3,1)' }}>
        {/* Decorative blobs */}
        <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle, rgba(147,197,253,.12), transparent)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: 80, left: -30, width: 120, height: 120, borderRadius: '50%', background: 'radial-gradient(circle, rgba(96,165,250,.08), transparent)', pointerEvents: 'none' }} />

        {/* Logo */}
        <div style={{ padding: '20px 16px 16px', position: 'relative', display: 'flex', justifyContent: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CrowIcon size={isTablet ? 22 : 28} />
            <span style={{ fontSize: isTablet ? '0.72rem' : '0.78rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', overflow: 'hidden', whiteSpace: 'nowrap' }}>
              <span style={{ color: '#fff' }}>luminae</span><span style={{ color: '#93c5fd', marginLeft: 4 }}>Vigila</span>
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ padding: '0 10px', flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV_ITEMS.filter(item => item.id !== 'search').map(item => {
            const isActive = activeNav === item.id
            return (
              <button key={item.id} onClick={() => setActiveNav(item.id)}
                      style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
                      gap: 10, padding: '9px 12px',
                      borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                      fontSize: isTablet ? '0.78rem' : '0.82rem', fontWeight: 600, width: '100%', textAlign: 'left', transition: 'all .13s',
                      background: isActive ? 'rgba(255,255,255,.12)' : 'transparent',
                      color: isActive ? '#fff' : 'rgba(147,197,253,.6)',
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,.06)' }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}>
              {item.icon}
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.soon && <span style={{ fontSize: '0.62rem', fontWeight: 700, background: 'rgba(147,197,253,.2)', color: '#93c5fd', padding: '2px 6px', borderRadius: 999 }}>soon</span>}
              {isActive && <ChevronRight size={12} style={{ opacity: 0.4 }} />}
            </button>
            )
          })}
        </nav>

        {/* Live info panel */}
        <div style={{ margin: '0 10px 10px', padding: '12px 14px', borderRadius: 14, background: 'rgba(0,0,0,0.18)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: '1.05rem', fontWeight: 800, color: '#fff', letterSpacing: '0.01em', lineHeight: 1.2 }}>
              {militaryTime
                ? clockTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
                : clockTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })}
            </div>
            <button type="button" onClick={() => setMilitaryTime(v => !v)}
                    title={militaryTime ? 'Switch to 12h' : 'Switch to 24h'}
                    style={{ fontSize: '0.56rem', fontWeight: 700, color: 'rgba(147,197,253,.45)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: 1 }}>
              {militaryTime ? '12h' : '24h'}
            </button>
          </div>
          <div style={{ fontSize: '0.66rem', color: 'rgba(147,197,253,.55)', marginTop: 3, fontWeight: 500 }}>
            {clockTime.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </div>

          {weather && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: '1rem', lineHeight: 1 }}>{weatherIcon(weather.code)}</span>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fff' }}>{weather.temp}°C</span>
              </div>
              {weather.rainMsg && (
                <div style={{ marginTop: 4, fontSize: '0.65rem', fontWeight: 600, color: '#93c5fd', display: 'flex', alignItems: 'center', gap: 4 }}>
                  🌧 {weather.rainMsg}
                </div>
              )}
            </div>
          )}

          {nextEventToday && (() => {
            const todayStr   = clockTime.toISOString().slice(0, 10)
            const isTomorrow = !nextEventToday.start?.startsWith(todayStr)
            const until      = isTomorrow ? null : timeUntil(nextEventToday.start)
            const label      = isTomorrow ? 'Tomorrow' : until ? `In ${until}` : null
            return label ? (
              <div style={{ marginTop: 10, padding: '7px 9px', borderRadius: 9, background: 'rgba(96,165,250,.14)', borderLeft: '2.5px solid rgba(96,165,250,.5)' }}>
                <div style={{ fontSize: '0.6rem', color: 'rgba(147,197,253,.6)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  {label}
                </div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#fff', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {nextEventToday.title}
                </div>
              </div>
            ) : null
          })()}
        </div>

        {/* ── Google Calendar inline section ── */}
        <SidebarGoogleSection
          onOpenSettings={() => setShowGoogleSettings(true)}
          onSync={syncGoogleCalendar}
          syncing={gcSyncing}
        />

        {/* ── Canvas inline section ── */}
        <SidebarCanvasSection
          onOpenSettings={() => setShowCanvasSettings(true)}
          onSync={syncCanvas}
          syncing={cvSyncing}
          canvasCalPrefs={canvasCalPrefs}
          onToggleCanvasOnCalendar={toggleCanvasOnCalendar}
          onToggleCourseOnCalendar={toggleCourseOnCalendar}
        />

        {/* ── Class Schedule inline section (independent of Canvas) ── */}
        <SidebarScheduleSection
          canvasClasses={canvasClasses}
          onAddClass={() => { setEditingClass(null); setShowClassModal(true) }}
          onEditClass={cls => { setEditingClass(cls); setShowClassModal(true) }}
        />

        {/* Bottom actions */}
        <div style={{ padding: 12, borderTop: '1px solid rgba(255,255,255,.08)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Sign-in / user display */}
          {currentUser ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 9, background: 'rgba(255,255,255,.05)' }}>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: '0.62rem', color: 'rgba(147,197,253,.5)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: 1 }}>Signed in as</div>
                <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,.8)', fontWeight: 600, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentUser.email}</div>
              </div>
              <form action="/api/auth/logout" method="POST" style={{ flexShrink: 0 }}>
                <button type="submit" title="Sign out"
                        style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: 'rgba(147,197,253,.4)', display: 'flex', alignItems: 'center', borderRadius: 6, transition: 'color .13s' }}
                        onMouseEnter={e => e.currentTarget.style.color = '#fca5a5'}
                        onMouseLeave={e => e.currentTarget.style.color = 'rgba(147,197,253,.4)'}>
                  <LogOut size={14} />
                </button>
              </form>
            </div>
          ) : (
            <a href="/login"
               style={{
                 display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                 padding: '8px 12px', borderRadius: 10, textDecoration: 'none',
                 border: '1px solid rgba(255,255,255,.12)', background: 'transparent',
                 color: 'rgba(147,197,253,.6)', fontFamily: 'inherit',
                 fontSize: '0.78rem', fontWeight: 600, transition: 'all .13s',
               }}
               onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.28)'; e.currentTarget.style.color = '#fff' }}
               onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.12)'; e.currentTarget.style.color = 'rgba(147,197,253,.6)' }}
            >
              <GoogleLogo size={13} /> Sign in to sync
            </a>
          )}

          {/* + New button with Event / Task popup */}
          <div ref={addMenuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowAddMenu(v => !v)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 12px', borderRadius: 10, border: 'none', background: showAddMenu ? 'var(--blue-hover)' : 'var(--blue)', color: '#fff', fontFamily: 'inherit', fontSize: '0.84rem', fontWeight: 700, cursor: 'pointer', transition: 'filter .15s' }}
              onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.1)'}
              onMouseLeave={e => e.currentTarget.style.filter = 'none'}>
              <Plus size={14}/> New
            </button>
            {showAddMenu && (
              <div style={{ position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', boxShadow: 'var(--shadow-modal)', animation: 'modal-in .16s cubic-bezier(.22,1,.36,1)', zIndex: 300 }}>
                <button
                  onClick={() => { setActiveNav('calendar'); setEventModal({ open: true, event: null, date: null }); setShowAddMenu(false) }}
                  style={{ width: '100%', padding: '10px 14px', border: 'none', background: 'transparent', color: 'var(--text)', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, transition: 'background .12s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <CalendarDays size={13}/> Event
                </button>
                <div style={{ height: 1, background: 'var(--border)' }}/>
                <button
                  onClick={() => { setShowTodoModal(true); setShowAddMenu(false) }}
                  style={{ width: '100%', padding: '10px 14px', border: 'none', background: 'transparent', color: 'var(--text)', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, transition: 'background .12s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <ListTodo size={13}/> Task
                </button>
              </div>
            )}
          </div>

          {/* Dark mode toggle */}
          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,.08)', background: 'transparent', color: 'rgba(147,197,253,.5)', fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', transition: 'all .13s' }}
                  onMouseEnter={e => e.currentTarget.style.color = 'rgba(147,197,253,.9)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'rgba(147,197,253,.5)'}>
            {theme === 'dark' ? <><Sun size={12}/> Light mode</> : <><Moon size={12}/> Dark mode</>}
          </button>
        </div>
      </aside>}

      {/* ── Main ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', flexDirection: isTablet && activeNav === 'calendar' ? 'column' : 'row' }}>
        {activeNav === 'calendar' && (
          <>
            <main className="dot-grid" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: isMobile ? '10px 6px 6px' : 20, position: 'relative' }}>
              {isMobile && (
                <button
                  onClick={() => setShowGoogleSettings(true)}
                  title="Google Calendar settings"
                  style={{ position: 'absolute', bottom: hiddenEventCount > 0 ? 58 : 18, left: 18, zIndex: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 9px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, boxShadow: 'var(--shadow)', color: 'var(--text-2)', fontSize: '0.72rem', fontWeight: 600, transition: 'bottom .2s' }}>
                  <GoogleLogo size={14} />
                  {googleEvents.length > 0 && <span>{googleEvents.length}</span>}
                </button>
              )}
              {(hiddenEventCount > 0 || showHiddenGcal) && (
                <button
                  onClick={showHiddenEvents}
                  title={showHiddenGcal ? 'Hide hidden events' : 'Show hidden events semi-transparently'}
                  style={{
                    position: 'absolute',
                    bottom: 18,
                    left: 18,
                    zIndex: 10,
                    background: showHiddenGcal ? 'var(--blue-bg)' : 'var(--surface)',
                    border: `1px solid ${showHiddenGcal ? 'var(--blue)' : 'var(--border)'}`,
                    borderRadius: 8,
                    padding: '6px 10px',
                    cursor: 'pointer',
                    boxShadow: 'var(--shadow)',
                    color: 'var(--blue-text)',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    fontFamily: 'inherit',
                    transition: 'background .15s, border-color .15s',
                  }}>
                  {showHiddenGcal ? `Hide hidden (${hiddenEventCount})` : `Show hidden (${hiddenEventCount})`}
                </button>
              )}
              <ErrorBoundary>
                <WeeklyCalendar events={allCalendarEvents} todos={todos}
                                onDateClick={handleDateClick} onEventClick={handleEventClick}
                                onViewChange={handleViewChange}
                                isMobile={isMobile}
                                highlightEventId={searchHighlightId}
                                targetDate={calendarTargetDate} />
              </ErrorBoundary>
            </main>

            {/* Resize handle — desktop only */}
            {!isTablet && !isMobile && (
              <div
                style={{ width: 4, cursor: 'col-resize', flexShrink: 0, background: 'transparent', transition: 'background .15s', zIndex: 10 }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--blue)'}
                onMouseLeave={e => { if (!resizingRef.current) e.currentTarget.style.background = 'transparent' }}
                onMouseDown={e => {
                  resizingRef.current = true
                  startXRef.current   = e.clientX
                  startWRef.current   = todoPanelWidth
                  const onMove = mv => {
                    const delta = startXRef.current - mv.clientX
                    setTodoPanelWidth(Math.max(220, Math.min(600, startWRef.current + delta)))
                  }
                  const onUp = () => {
                    resizingRef.current = false
                    window.removeEventListener('mousemove', onMove)
                    window.removeEventListener('mouseup', onUp)
                  }
                  window.addEventListener('mousemove', onMove)
                  window.addEventListener('mouseup', onUp)
                }}
              />
            )}

            {/* Todo panel — side on desktop, bottom strip on tablet, hidden on mobile (own tab) */}
            {!isMobile && (
              <aside style={{
                width: isTablet ? '100%' : todoPanelWidth,
                height: isTablet ? 240 : 'auto',
                borderLeft: isTablet ? 'none' : '1px solid var(--border)',
                borderTop: isTablet ? '1px solid var(--border)' : 'none',
                background: 'var(--surface)', overflowY: 'auto', flexShrink: 0,
                transition: 'width 0.35s cubic-bezier(0.16,1,0.3,1)',
              }}>
                <ErrorBoundary>
                  <TodoPanel todos={todos} events={[...events, ...canvasClassEvents]} todoCategories={todoCategories}
                             onToggle={toggleTodo} onDelete={deleteTodo} onAddClick={() => setShowTodoModal(true)}
                             onEditClick={todo => { setEditingTodo(todo); setShowTodoModal(true) }}
                             onCategoriesChange={setTodoCategories}
                             canvasAssignments={canvasAssignments} canvasClasses={canvasClasses}
                             onToggleCanvas={toggleCanvasAssignment}
                             onEditCanvas={a => { setEditingCanvas(a); setCanvasTodoModal(true) }}
                             onHideCanvas={hideCanvasAssignment} />
                </ErrorBoundary>
              </aside>
            )}
          </>
        )}


        {activeNav === 'todos' && (
          <main className="dot-grid" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <ErrorBoundary>
              <TodoPanel todos={todos} events={[...events, ...canvasClassEvents]} todoCategories={todoCategories}
                         onToggle={toggleTodo} onDelete={deleteTodo} onAddClick={() => setShowTodoModal(true)}
                         onEditClick={todo => { setEditingTodo(todo); setShowTodoModal(true) }}
                         onCategoriesChange={setTodoCategories} fullPage isMobile={isMobile}
                         canvasAssignments={canvasAssignments} canvasClasses={canvasClasses}
                         onToggleCanvas={toggleCanvasAssignment}
                         onEditCanvas={a => { setEditingCanvas(a); setCanvasTodoModal(true) }}
                         onHideCanvas={hideCanvasAssignment} />
            </ErrorBoundary>
          </main>
        )}

        {activeNav === 'courses' && (
          <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
            <ErrorBoundary>
              <CoursesPanel
                canvasAssignments={canvasAssignments}
                courseColors={canvasCalPrefs.courseColors}
                onToggleCanvas={toggleCanvasAssignment}
                onUpdateCanvasNotes={updateCanvasNotes}
                onOpenSettings={() => setShowCanvasSettings(true)}
                onSync={syncCanvas}
                syncing={cvSyncing}
              />
            </ErrorBoundary>
          </main>
        )}

        {activeNav === 'corvus' && (
          <main style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            <ErrorBoundary>
            <Corvus
              events={events}
              canvasClassEvents={canvasClassEvents}
              todos={todos}
              canvasAssignments={canvasAssignments}
              todoCategories={todoCategories}
              eventCategories={EVENT_CATEGORIES}
              onAddTodo={addTodo}
              onSaveEvent={saveEvent}
              onUpdateTodo={updateTodo}
              onNavigateToItem={navigateToItem}
            />
            </ErrorBoundary>
          </main>
        )}

        {/* ── Mobile Search tab ── Full-screen search instead of a popup */}
        {activeNav === 'search' && isMobile && (
          <main className="dot-grid" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text)' }}>Search</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-3)', marginTop: 2 }}>Upcoming shown by default</div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 32px' }}>
              <ErrorBoundary>
                <SearchPanel
                  query={searchQuery}
                  onQueryChange={setSearchQuery}
                  scope={searchScope}
                  onScopeChange={setSearchScope}
                  status={searchStatus}
                  onStatusChange={setSearchStatus}
                  results={searchResults}
                  onSelect={openSearchResult}
                  onToggleTodo={toggleTodo}
                  isMobile={isMobile}
                />
              </ErrorBoundary>
            </div>
          </main>
        )}

        {/* ── Mobile Settings tab ── Shows all the sidebar features on small screens */}
        {activeNav === 'settings' && isMobile && (
          <main style={{ flex: 1, overflowY: 'auto', background: 'var(--sidebar)', display: 'flex', flexDirection: 'column', position: 'relative' }}>
            {/* Decorative blobs (match sidebar) */}
            <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle, rgba(147,197,253,.1), transparent)', pointerEvents: 'none' }} />

            <div style={{ padding: '20px 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <CrowIcon size={24} />
              <span style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                <span style={{ color: '#fff' }}>luminae</span><span style={{ color: '#93c5fd', marginLeft: 4 }}>Vigila</span>
              </span>
            </div>

            {/* Live info */}
            <div style={{ margin: '12px 12px 0', padding: '12px 14px', borderRadius: 14, background: 'rgba(0,0,0,0.18)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: '1.1rem', fontWeight: 800, color: '#fff', letterSpacing: '0.01em', lineHeight: 1.2 }}>
                  {militaryTime
                    ? clockTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
                    : clockTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })}
                </div>
                <button type="button" onClick={() => setMilitaryTime(v => !v)}
                        style={{ fontSize: '0.56rem', fontWeight: 700, color: 'rgba(147,197,253,.45)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: 1 }}>
                  {militaryTime ? '12h' : '24h'}
                </button>
              </div>
              <div style={{ fontSize: '0.66rem', color: 'rgba(147,197,253,.55)', marginTop: 3, fontWeight: 500 }}>
                {clockTime.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
              </div>
              {weather && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: '1rem' }}>{weatherIcon(weather.code)}</span>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fff' }}>{weather.temp}°C</span>
                  {weather.rainMsg && <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#93c5fd' }}>{weather.rainMsg}</span>}
                </div>
              )}
            </div>

            {/* Account */}
            <div style={{ margin: '10px 12px 0', padding: '10px 12px', borderRadius: 12, background: 'rgba(0,0,0,0.15)' }}>
              {currentUser ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontSize: '0.62rem', color: 'rgba(147,197,253,.5)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Signed in as</div>
                    <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,.85)', fontWeight: 600, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentUser.email}</div>
                  </div>
                  <form action="/api/auth/logout" method="POST">
                    <button type="submit" title="Sign out"
                            style={{ background: 'rgba(147,197,253,.12)', border: '1px solid rgba(147,197,253,.2)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', color: 'rgba(147,197,253,.7)', fontSize: '0.72rem', fontWeight: 600, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <LogOut size={12} /> Sign out
                    </button>
                  </form>
                </div>
              ) : (
                <a href="/login"
                   style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px 12px', borderRadius: 10, textDecoration: 'none', border: '1px solid rgba(255,255,255,.15)', background: 'transparent', color: 'rgba(147,197,253,.7)', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 600 }}>
                  <GoogleLogo size={14} /> Sign in to sync
                </a>
              )}
            </div>

            {/* Google Calendar */}
            <SidebarGoogleSection
              onOpenSettings={() => setShowGoogleSettings(true)}
              onSync={syncGoogleCalendar}
              syncing={gcSyncing}
            />

            {/* Canvas */}
            <SidebarCanvasSection
              onOpenSettings={() => setShowCanvasSettings(true)}
              onSync={syncCanvas}
              syncing={cvSyncing}
              canvasCalPrefs={canvasCalPrefs}
              onToggleCanvasOnCalendar={toggleCanvasOnCalendar}
              onToggleCourseOnCalendar={toggleCourseOnCalendar}
            />

            {/* Class Schedule */}
            <SidebarScheduleSection
              canvasClasses={canvasClasses}
              onAddClass={() => { setEditingClass(null); setShowClassModal(true) }}
              onEditClass={cls => { setEditingClass(cls); setShowClassModal(true) }}
            />

            {/* Quick actions + theme */}
            <div style={{ padding: '10px 12px', marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,.08)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={() => { setActiveNav('calendar'); setEventModal({ open: true, event: null, date: null }) }}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 12px', borderRadius: 10, border: 'none', background: 'var(--blue)', color: '#fff', fontFamily: 'inherit', fontSize: '0.84rem', fontWeight: 700, cursor: 'pointer' }}>
                <Plus size={14}/> Add Event
              </button>
              <button onClick={() => { setActiveNav('todos'); setShowTodoModal(true) }}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,.12)', background: 'transparent', color: 'rgba(147,197,253,.7)', fontFamily: 'inherit', fontSize: '0.84rem', fontWeight: 600, cursor: 'pointer' }}>
                <Plus size={14}/> Add Task
              </button>
              <ImportExportButton
                events={events} todos={todos} todoCategories={todoCategories}
                onImport={handleImport}
                inline
              />
              <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,.08)', background: 'transparent', color: 'rgba(147,197,253,.5)', fontFamily: 'inherit', fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer' }}>
                {theme === 'dark' ? <><Sun size={12}/> Light mode</> : <><Moon size={12}/> Dark mode</>}
              </button>
            </div>
          </main>
        )}
      </div>

      {/* ── Mobile bottom tab bar ── */}
      {isMobile && (
        <nav style={{
          display: 'flex', background: 'var(--sidebar)', borderTop: '1px solid rgba(255,255,255,.08)',
          flexShrink: 0, zIndex: 20,
          // Respect iOS home-indicator and Android navigation bar
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}>
          {NAV_ITEMS.map(item => {
            const isActive = activeNav === item.id
            return (
              <button key={item.id} onClick={() => {
                if (item.id === 'search' && activeNav !== 'search') {
                  setSearchQuery(''); setSearchScope('all'); setSearchStatus('upcoming')
                }
                setActiveNav(item.id)
              }}
                      style={{
                        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        gap: 4, padding: '12px 0', border: 'none', background: 'transparent',
                        color: isActive ? '#fff' : 'rgba(147,197,253,.5)',
                        fontFamily: 'inherit', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer',
                        borderTop: isActive ? '2px solid var(--blue)' : '2px solid transparent',
                        transition: 'all .15s',
                      }}>
                {item.icon}
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>
      )}

      {/* ── Modals ── */}
      {eventModal.open && (
        <EventModal event={eventModal.event} initialDate={eventModal.date}
                    categories={EVENT_CATEGORIES} onSave={saveEvent} onDelete={deleteEvent}
                    onHide={hideEvent}
                    onClose={() => setEventModal({ open: false, event: null, date: null })} />
      )}
      {showTodoModal && (
        <AddTodoModal events={events} canvasClasses={canvasClasses} todoCategories={todoCategories}
                      onAdd={addTodo} onEdit={updateTodo}
                      editTodo={editingTodo}
                      initialDate={initialTodoDate}
                      onClose={() => { setShowTodoModal(false); setEditingTodo(null); setInitialTodoDate(null) }} />
      )}

      <Toast toasts={toasts} onDismiss={id => setToasts(p => p.filter(t => t.id !== id))} />

      {showGoogleSettings && (
        <GoogleCalendarSettings
          onClose={() => {
            setShowGoogleSettings(false)
            window.dispatchEvent(new Event('gc-accounts-changed'))
            syncGoogleCalendar()
          }}
          onSync={syncGoogleCalendar}
        />
      )}

      {showCanvasSettings && (
        <CanvasSettingsModal
          onClose={() => {
            setShowCanvasSettings(false)
            window.dispatchEvent(new Event('canvas-credential-changed'))
            syncCanvas()
          }}
          onSync={syncCanvas}
          onColorsChange={updateCourseColors}
        />
      )}

      {showClassModal && (
        <ClassScheduleModal
          editClass={editingClass}
          onSave={saveCanvasClass}
          onDelete={deleteCanvasClass}
          onClose={() => { setShowClassModal(false); setEditingClass(null) }}
        />
      )}

      {canvasTodoModal && editingCanvas && (
        <AddTodoModal
          events={[...events, ...canvasClassEvents]}
          todoCategories={todoCategories}
          editTodo={editingCanvas}
          onEditCanvas={updateCanvasAssignment}
          onAdd={() => {}}
          onEdit={() => {}}
          onClose={() => { setCanvasTodoModal(false); setEditingCanvas(null) }}
        />
      )}

      {/* Search popup — desktop only; mobile uses the full-screen Search tab instead */}
      {showSearchPopup && !isMobile && (
        <div
          onClick={closeSearchPopup}
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
            animation: searchClosing ? 'lv-backdrop-out .18s ease forwards' : 'lv-backdrop-in .18s ease',
          }}>
          <div onClick={e => e.stopPropagation()}
               style={{
                 width: 'min(1040px,100%)', maxHeight: 'calc(100vh - 32px)', overflow: 'auto', borderRadius: 22,
                 background: 'var(--bg)', boxShadow: '0 30px 80px rgba(0,0,0,.35)', border: '1px solid rgba(255,255,255,.08)',
                 animation: searchClosing ? 'lv-modal-out .18s ease forwards' : 'lv-modal-in .22s cubic-bezier(.22,1,.36,1)',
               }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '18px 20px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
              <div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text)' }}>Search everything</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-3)', marginTop: 3 }}>Upcoming shown by default · Ctrl+K to open · Esc to close</div>
              </div>
              <button type="button" onClick={closeSearchPopup}
                      style={{ border: 'none', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: '0.95rem', fontWeight: 700, padding: '10px 14px' }}>
                ✕
              </button>
            </div>
            <div style={{ padding: '18px 20px' }}>
              <ErrorBoundary>
                <SearchPanel
                  query={searchQuery}
                  onQueryChange={setSearchQuery}
                  scope={searchScope}
                  onScopeChange={setSearchScope}
                  status={searchStatus}
                  onStatusChange={setSearchStatus}
                  results={searchResults}
                  onSelect={openSearchResult}
                  onToggleTodo={toggleTodo}
                  isMobile={isMobile}
                />
              </ErrorBoundary>
            </div>
          </div>
        </div>
      )}

      {/* ── Search FAB (desktop only — mobile keeps search in bottom tab bar) ── */}
      {!isMobile && (
        <button
          onClick={showSearchPopup ? closeSearchPopup : openSearchPopup}
          title="Search (Ctrl+K)"
          style={{
            position: 'fixed', bottom: 24, right: 144,
            width: 50, height: 50, borderRadius: '50%', border: '1px solid var(--border)',
            background: showSearchPopup ? 'var(--blue-bg)' : 'var(--surface)',
            color:      showSearchPopup ? 'var(--blue)'    : 'var(--text-2)',
            cursor: 'pointer', zIndex: 200,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'var(--shadow-md)', transition: 'background .15s, color .15s, transform .15s, box-shadow .15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--blue-bg)'; e.currentTarget.style.color = 'var(--blue)'; e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = 'var(--shadow-lg)' }}
          onMouseLeave={e => { e.currentTarget.style.background = showSearchPopup ? 'var(--blue-bg)' : 'var(--surface)'; e.currentTarget.style.color = showSearchPopup ? 'var(--blue)' : 'var(--text-2)'; e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)' }}
        >
          <Search size={20} />
        </button>
      )}

      {/* ── Import / Export FAB (desktop only — mobile has it in the Settings tab) ── */}
      {!isMobile && (
        <ImportExportButton
          events={events}
          todos={todos}
          todoCategories={todoCategories}
          onImport={handleImport}
        />
      )}

      {/* ── Floating Corvus widget (desktop only) ── */}
      {/* On mobile the bottom tab bar has a Corvus item — no floating button needed. */}
      {!isMobile && activeNav !== 'corvus' && (
        corvusFloat ? (
          <div style={{
            position: 'fixed', bottom: 24, right: 20,
            width: 360, height: 500, zIndex: 200,
            borderRadius: 18, overflow: 'hidden',
            border: '1px solid var(--border)',
            boxShadow: '0 12px 48px rgba(0,0,0,0.35)',
            animation: 'corvus-panel-in .22s cubic-bezier(.22,1,.36,1)',
          }}>
            <Corvus
              events={events} canvasClassEvents={canvasClassEvents} todos={todos}
              canvasAssignments={canvasAssignments}
              todoCategories={todoCategories} eventCategories={EVENT_CATEGORIES}
              onAddTodo={addTodo} onSaveEvent={saveEvent} onUpdateTodo={updateTodo}
              onNavigateToItem={navigateToItem}
              compact={true}
              onExpand={() => { setCorvusFloat(false); setActiveNav('corvus') }}
              onClose={() => setCorvusFloat(false)}
            />
          </div>
        ) : (
          <button
            onClick={() => setCorvusFloat(true)}
            title="Open Corvus"
            style={{
              position: 'fixed', bottom: 24, right: 20,
              width: 50, height: 50, borderRadius: '50%', border: 'none',
              background: 'var(--blue)', color: '#fff', cursor: 'pointer',
              zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
              transition: 'transform .15s, box-shadow .15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = '0 6px 28px rgba(0,0,0,0.4)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)';    e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)' }}
          >
            <CrowIcon size={22} />
          </button>
        )
      )}
    </div>
  )
}

function CrowIcon({ size = 24, color = 'white' }) {
  return (
    <svg width={size} height={size} viewBox="0 -64 640 640" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <path fill={color} d="M544 32h-16.36C513.04 12.68 490.09 0 464 0c-44.18 0-80 35.82-80 80v20.98L12.09 393.57A30.216 30.216 0 0 0 0 417.74c0 22.46 23.64 37.07 43.73 27.03L165.27 384h96.49l44.41 120.1c2.27 6.23 9.15 9.44 15.38 7.17l22.55-8.21c6.23-2.27 9.44-9.15 7.17-15.38L312.94 384H352c1.91 0 3.76-.23 5.66-.29l44.51 120.38c2.27 6.23 9.15 9.44 15.38 7.17l22.55-8.21c6.23-2.27 9.44-9.15 7.17-15.38l-41.24-111.53C485.74 352.8 544 279.26 544 192v-80l96-16c0-35.35-42.98-64-96-64zm-80 72c-13.25 0-24-10.75-24-24 0-13.26 10.75-24 24-24s24 10.74 24 24c0 13.25-10.75 24-24 24z"/>
    </svg>
  )
}
