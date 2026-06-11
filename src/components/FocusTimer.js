'use client'

/**
 * FocusTimer — a Pomodoro-style focus timer that ties "todos and timings" together.
 *
 * Fully OPTIONAL and ADDITIVE: if never opened it changes nothing. It introduces a
 * single new localStorage key (`lv-focus`) and, when you focus on a task, writes an
 * additive `focusSeconds` field onto that todo (ignored by all existing code).
 *
 * Two surfaces:
 *   - Compact panel anchored to a FAB (desktop) / opened from Settings (mobile)
 *   - Full-screen "zen" mode with a depleting glow ring and a selectable ambient
 *     background (stars, snow, or a slow aurora) for distraction-free focus
 *
 * Time-blocking tie-in (no fragile drag-and-drop):
 *   - Toggle "Log to calendar" and every completed focus session is dropped onto the
 *     calendar as a real timed event via the existing onSaveEvent pipeline.
 *
 * Props:
 *   open, onClose, isMobile, todos, canvasAssignments,
 *   onUpdateTodo, onUpdateCanvas, onSaveEvent, pushToast
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Play, Pause, RotateCcw, SkipForward, X, Volume2, VolumeX, Sliders,
  CalendarPlus, Check, Maximize2, Minimize2, Lightbulb,
} from 'lucide-react'
import Confetti from './Confetti'
import Select from './Select'

const DEFAULTS = {
  focusMin: 25,
  shortMin: 5,
  longMin: 15,
  longEvery: 4,          // a long break after every N focus sessions
  autoStartNext: false,
  sound: true,
  logToCalendar: false,
  fx: 'stars',           // ambient background in full-screen: 'none' | 'stars' | 'snow' | 'aurora'
  showInfo: true,        // show the "how it works" note in the compact panel
  customDefaults: null,  // {focusMin, shortMin, longMin} saved as the user's personal default
}

// The built-in factory durations the "Reset" button falls back to.
const FACTORY = { focusMin: 25, shortMin: 5, longMin: 15 }

const PHASES = {
  focus: { label: 'Focus',  sub: 'Stay on task', color: '#3a6fa8' },
  short: { label: 'Short',  sub: 'Short break',  color: '#10b981' },
  long:  { label: 'Long',   sub: 'Long break',   color: '#8b5cf6' },
}

const FX_OPTIONS = [
  { id: 'none',       label: 'None'       },
  { id: 'stars',      label: 'Stars'      },
  { id: 'snow',       label: 'Snow'       },
  { id: 'aurora',     label: 'Aurora'     },
  { id: 'rain',       label: 'Rain'       },
  { id: 'fireflies',  label: 'Fireflies'  },
  { id: 'ocean',      label: 'Ocean'      },
]

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem('lv-focus') ?? '{}')
    const settings = { ...DEFAULTS, ...(raw.settings ?? {}) }
    const isToday = raw.day === todayStr()
    return {
      settings,
      taskId: raw.taskId ?? null,
      courseTag: raw.courseTag ?? null,  // { courseId, courseName } or null
      day: todayStr(),
      sessionsToday: isToday ? (raw.sessionsToday ?? 0) : 0,
      focusSecondsToday: isToday ? (raw.focusSecondsToday ?? 0) : 0,
    }
  } catch {
    return { settings: { ...DEFAULTS }, taskId: null, courseTag: null, day: todayStr(), sessionsToday: 0, focusSecondsToday: 0 }
  }
}

// ── Study session persistence (localStorage-only) ─────────────────────────────
// Key: 'lv-study-sessions'
// Shape: [{ id, courseId, courseName, durationSec, date }]  (date = 'YYYY-MM-DD')

function loadStudySessions() {
  try { return JSON.parse(localStorage.getItem('lv-study-sessions') ?? '[]') } catch { return [] }
}

function saveStudySession(session) {
  try {
    const arr = loadStudySessions()
    arr.push(session)
    localStorage.setItem('lv-study-sessions', JSON.stringify(arr))
  } catch {}
}

export default function FocusTimer({ open, onClose, isMobile, todos = [], canvasAssignments = [], onUpdateTodo, onUpdateCanvas, onSaveEvent, pushToast }) {
  const [hydrated,   setHydrated]   = useState(false)
  const [settings,   setSettings]   = useState(DEFAULTS)
  const [taskId,     setTaskId]     = useState(null)
  // courseTag: null = None, or { courseId, courseName }
  const [courseTag,  setCourseTag]  = useState(null)
  const [phase,      setPhase]      = useState('focus')
  const [running,    setRunning]    = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(DEFAULTS.focusMin * 60)
  const [sessionsToday, setSessionsToday] = useState(0)
  const [focusSecondsToday, setFocusSecondsToday] = useState(0)
  const [showSettings, setShowSettings] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [burst,      setBurst]      = useState(null)   // confetti { id, x, y }
  const [isDark,     setIsDark]     = useState(false)

  const endAtRef   = useRef(null)   // ms timestamp the running phase ends at
  const audioRef   = useRef(null)
  const ringRef    = useRef(null)

  const phaseDurMin = useCallback(
    (p) => (p === 'focus' ? settings.focusMin : p === 'short' ? settings.shortMin : settings.longMin),
    [settings],
  )

  /* ── Hydrate once from localStorage ── */
  useEffect(() => {
    const s = loadState()
    setSettings(s.settings)
    setTaskId(s.taskId)
    if (s.courseTag) setCourseTag(s.courseTag)
    setSessionsToday(s.sessionsToday)
    setFocusSecondsToday(s.focusSecondsToday)
    setSecondsLeft(s.settings.focusMin * 60)
    setHydrated(true)
  }, [])

  /* ── Persist (after hydration only) ── */
  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem('lv-focus', JSON.stringify({
        settings, taskId, courseTag, day: todayStr(), sessionsToday, focusSecondsToday,
      }))
    } catch {}
  }, [hydrated, settings, taskId, courseTag, sessionsToday, focusSecondsToday])

  /* ── If not running, keep the displayed time in sync with the phase length ── */
  useEffect(() => {
    if (!running) setSecondsLeft(phaseDurMin(phase) * 60)
  }, [phase, settings, running, phaseDurMin])

  /* ── Drift-free ticking ── */
  useEffect(() => {
    if (!running) return
    endAtRef.current = Date.now() + secondsLeft * 1000
    const tick = () => {
      const remain = Math.max(0, Math.round((endAtRef.current - Date.now()) / 1000))
      setSecondsLeft(remain)
      if (remain <= 0) handleComplete()
    }
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  /* ── Exit full-screen on Escape ── */
  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e) => { if (e.key === 'Escape') setFullscreen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen])

  /* ── Track theme so the ring glow can be stronger in light mode ── */
  useEffect(() => {
    const el = document.documentElement
    const update = () => setIsDark(el.classList.contains('dark'))
    update()
    const obs = new MutationObserver(update)
    obs.observe(el, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  function playChime() {
    if (!settings.sound) return
    try {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return
      if (!audioRef.current) audioRef.current = new AC()
      const ctx = audioRef.current
      const now = ctx.currentTime
      ;[880, 1318.5].forEach((freq, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq
        const t = now + i * 0.18
        gain.gain.setValueAtTime(0.0001, t)
        gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5)
        osc.connect(gain); gain.connect(ctx.destination)
        osc.start(t); osc.stop(t + 0.55)
      })
    } catch {}
  }

  // "Focusing on" can target a local todo or a Canvas assignment (value prefixed "canvas:")
  const isCanvas = typeof taskId === 'string' && taskId.startsWith('canvas:')
  const linkedTarget = isCanvas
    ? (canvasAssignments.find(a => `canvas:${a.id}` === taskId && !a.done) || null)
    : (todos.find(t => t.id === taskId && !t.completed) || null)

  function handleComplete() {
    setRunning(false)
    endAtRef.current = null

    if (phase === 'focus') {
      const elapsed = phaseDurMin('focus') * 60
      const endMs   = Date.now()
      const newCount = sessionsToday + 1
      setSessionsToday(newCount)
      setFocusSecondsToday(s => s + elapsed)

      // Persist completed session for study time tracking
      saveStudySession({
        id:          `fs-${endMs}`,
        courseId:    courseTag?.courseId   ?? null,
        courseName:  courseTag?.courseName ?? null,
        durationSec: elapsed,
        date:        todayStr(),
      })

      // Accumulate focus time on the task (additive field, ignored elsewhere)
      if (linkedTarget) {
        const updated = { ...linkedTarget, focusSeconds: (linkedTarget.focusSeconds || 0) + elapsed }
        if (isCanvas) onUpdateCanvas?.(updated)
        else          onUpdateTodo?.(updated)
      }

      // Log the session to the calendar as a real time-block.
      // Store local-naive ISO (no trailing Z) to match how every other event in the
      // app is stored — otherwise the modal/calendar would shift it across timezones.
      if (settings.logToCalendar && onSaveEvent) {
        const start = toLocalISO(new Date(endMs - elapsed * 1000))
        const end   = toLocalISO(new Date(endMs))
        onSaveEvent({
          id:    `focus-${endMs}`,
          title: linkedTarget ? `🎯 Focus · ${linkedTarget.title}` : '🎯 Focus session',
          start, end,
          color: PHASES.focus.color,
          extendedProps: { category: 'personal', focusBlock: true },
        }, 'single')
      }

      // Celebrate 🎉
      const rect = ringRef.current?.getBoundingClientRect()
      setBurst({ id: endMs, x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2, y: rect ? rect.top + rect.height / 2 : 200 })
      setTimeout(() => setBurst(null), 1600)
      playChime()
      notify('Focus session complete', linkedTarget ? `Nice work on "${linkedTarget.title}". Time for a break.` : 'Nice work. Time for a break.')

      // Next phase: long break every N sessions, else short break
      const next = newCount % settings.longEvery === 0 ? 'long' : 'short'
      setPhase(next)
      setSecondsLeft(phaseDurMin(next) * 60)
      if (settings.autoStartNext) setTimeout(() => setRunning(true), 60)
    } else {
      playChime()
      notify('Break over', 'Back to focus.')
      setPhase('focus')
      setSecondsLeft(phaseDurMin('focus') * 60)
      if (settings.autoStartNext) setTimeout(() => setRunning(true), 60)
    }
  }

  function notify(title, body) {
    pushToast?.(title, body)
    try {
      if (typeof window !== 'undefined' && Notification?.permission === 'granted') {
        new Notification(title, { body })
      }
      if (typeof navigator !== 'undefined' && navigator.serviceWorker?.controller) {
        fetch('/api/push/send', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, body }),
        }).catch(() => {})
      }
    } catch {}
  }

  function toggleRun() {
    if (running) {
      const remain = Math.max(0, Math.round(((endAtRef.current ?? Date.now()) - Date.now()) / 1000))
      setSecondsLeft(remain)
      setRunning(false)
    } else {
      try {
        const AC = window.AudioContext || window.webkitAudioContext
        if (AC && !audioRef.current) audioRef.current = new AC()
        audioRef.current?.resume?.()
      } catch {}
      setRunning(true)
    }
  }

  function reset() {
    setRunning(false)
    endAtRef.current = null
    setSecondsLeft(phaseDurMin(phase) * 60)
  }

  function skipPhase() {
    setRunning(false)
    endAtRef.current = null
    const next = phase === 'focus'
      ? ((sessionsToday + 1) % settings.longEvery === 0 ? 'long' : 'short')
      : 'focus'
    setPhase(next)
    setSecondsLeft(phaseDurMin(next) * 60)
  }

  function selectPhase(p) {
    if (p === phase) return
    setRunning(false)
    endAtRef.current = null
    setPhase(p)
    setSecondsLeft(phaseDurMin(p) * 60)
  }

  // Build unique course list: Canvas courses + any manual classes from canvasAssignments.
  // MUST stay above the `if (!open)` early return so hook order is stable when the timer
  // is closed vs open.
  const courseOptions = useMemo(() => {
    const seen = new Map()
    for (const a of canvasAssignments) {
      if (a.courseId && !seen.has(String(a.courseId))) {
        seen.set(String(a.courseId), a.courseName || String(a.courseId))
      }
    }
    const opts = [{ value: '', label: 'None' }]
    for (const [id, name] of seen) {
      opts.push({ value: id, label: name })
    }
    return opts
  }, [canvasAssignments])

  if (!open) {
    return burst ? <Confetti priority="high" x={burst.x} y={burst.y} /> : null
  }

  const total    = phaseDurMin(phase) * 60
  const fraction = total > 0 ? secondsLeft / total : 0
  const accent   = PHASES[phase].color
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const ss = String(secondsLeft % 60).padStart(2, '0')

  /* ── Shared building blocks (closures over state) ── */

  function Ring({ size }) {
    const big = size >= 220
    const stroke = big ? 12 : 9
    // Push the ring out toward the SVG edge so there is generous breathing room
    // between the time text and the ring itself.
    const R = size / 2 - stroke / 2 - 2
    const C = 2 * Math.PI * R
    const cx = size / 2
    // Keep the text well inside the ring with explicit padding.
    const innerPad = big ? size * 0.22 : size * 0.20
    // Full-screen sits on a dark backdrop (the soft 66 glow looks great there, like dark mode).
    // In light mode the soft glow washes out on white, so layer a stronger, tighter glow.
    const glow = !running
      ? 'none'
      : (big || isDark)
        ? `drop-shadow(0 0 10px ${accent}4d)`
        : `drop-shadow(0 0 7px ${accent}80) drop-shadow(0 0 14px ${accent}33)`
    return (
      <div ref={ringRef} style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', filter: glow, transition: 'filter .3s' }}>
          <circle cx={cx} cy={cx} r={R} fill="none" stroke={big ? 'rgba(255,255,255,0.12)' : 'var(--surface2)'} strokeWidth={stroke} />
          <circle cx={cx} cy={cx} r={R} fill="none" stroke={accent} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - fraction)}
            style={{ transition: 'stroke-dashoffset .35s linear, stroke .3s' }} />
        </svg>
        <div style={{ position: 'absolute', inset: innerPad, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: big ? '3.1rem' : '1.7rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: big ? '#fff' : 'var(--text)', lineHeight: 1 }}>
            {mm}:{ss}
          </div>
          <div style={{ fontSize: big ? '0.78rem' : '0.6rem', fontWeight: 700, color: big ? 'rgba(255,255,255,0.6)' : 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: big ? 10 : 4 }}>
            {PHASES[phase].sub}
          </div>
        </div>
      </div>
    )
  }

  function Tabs({ light }) {
    return (
      <div style={{ display: 'flex', gap: 4, width: '100%', maxWidth: light ? 280 : undefined }}>
        {Object.entries(PHASES).map(([key, p]) => {
          const isActive = phase === key
          return (
            <button key={key} onClick={() => selectPhase(key)}
              style={{
                flex: 1, padding: light ? '8px 4px' : '5px 4px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: light ? '0.74rem' : '0.66rem', fontWeight: 700,
                background: isActive ? (light ? 'rgba(255,255,255,0.16)' : p.color + '22') : 'transparent',
                color: isActive ? (light ? '#fff' : p.color) : (light ? 'rgba(255,255,255,0.45)' : 'var(--text-3)'),
                transition: 'background .15s, color .15s',
              }}>
              {p.label}
            </button>
          )
        })}
      </div>
    )
  }

  function Controls({ light }) {
    const muted = light ? 'rgba(255,255,255,0.55)' : 'var(--text-3)'
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: light ? 18 : 10 }}>
        <IconBtn title="Reset" onClick={reset} color={muted}><RotateCcw size={light ? 20 : 16} /></IconBtn>
        <button onClick={toggleRun}
          style={{
            width: light ? 72 : 56, height: light ? 72 : 56, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 6px 22px ${accent}66`, transition: 'transform .12s, filter .15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.06)'; e.currentTarget.style.filter = 'brightness(1.08)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.filter = 'none' }}>
          {running ? <Pause size={light ? 30 : 24} fill="#fff" /> : <Play size={light ? 30 : 24} fill="#fff" style={{ marginLeft: 3 }} />}
        </button>
        <IconBtn title="Skip phase" onClick={skipPhase} color={muted}><SkipForward size={light ? 20 : 16} /></IconBtn>
      </div>
    )
  }

  function CoursePicker({ light }) {
    const curVal = courseTag?.courseId ? String(courseTag.courseId) : ''
    return (
      <div>
        <label style={{ fontSize: '0.62rem', fontWeight: 700, color: light ? 'rgba(255,255,255,0.5)' : 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Course tag
        </label>
        <div style={{ marginTop: 5 }}>
          <Select
            value={curVal}
            onChange={v => {
              if (!v) { setCourseTag(null); return }
              const name = courseOptions.find(o => o.value === v)?.label ?? v
              setCourseTag({ courseId: v, courseName: name })
            }}
            options={courseOptions}
            placeholder="None"
          />
        </div>
      </div>
    )
  }

  function TaskPicker({ light }) {
    const focusOptions = [
      { value: '', label: 'No specific task' },
      ...(todos.some(t => !t.completed) ? [{ header: true, value: '__h_tasks', label: 'Tasks' }] : []),
      ...todos.filter(t => !t.completed).map(t => ({ value: t.id, label: t.title })),
      ...(canvasAssignments.some(a => !a.done) ? [{ header: true, value: '__h_canvas', label: 'Canvas assignments' }] : []),
      ...canvasAssignments.filter(a => !a.done).map(a => ({
        value: `canvas:${a.id}`, label: a.courseName ? `${a.title} · ${a.courseName}` : a.title,
      })),
    ]
    return (
      <div>
        <label style={{ fontSize: '0.62rem', fontWeight: 700, color: light ? 'rgba(255,255,255,0.5)' : 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Focusing on
        </label>
        <div style={{ marginTop: 5 }}>
          <Select value={taskId ?? ''} onChange={v => setTaskId(v || null)} options={focusOptions} placeholder="No specific task" />
        </div>
        {linkedTarget?.focusSeconds > 0 && (
          <div style={{ fontSize: '0.66rem', color: light ? 'rgba(255,255,255,0.55)' : 'var(--text-3)', marginTop: 6 }}>
            {fmtDuration(linkedTarget.focusSeconds)} focused on this so far
          </div>
        )}
      </div>
    )
  }

  function SettingsContent() {
    const def = settings.customDefaults || FACTORY
    const atDefault = settings.focusMin === def.focusMin && settings.shortMin === def.shortMin && settings.longMin === def.longMin
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <NumField label="Focus" value={settings.focusMin} min={1} max={120} onChange={v => setSettings(s => ({ ...s, focusMin: v }))} />
          <NumField label="Short" value={settings.shortMin} min={1} max={60}  onChange={v => setSettings(s => ({ ...s, shortMin: v }))} />
          <NumField label="Long"  value={settings.longMin}  min={1} max={60}  onChange={v => setSettings(s => ({ ...s, longMin: v }))} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setSettings(s => ({ ...s, ...(s.customDefaults || FACTORY) }))} disabled={atDefault}
            title={settings.customDefaults ? `Reset to your default (${def.focusMin}/${def.shortMin}/${def.longMin})` : 'Reset to 25 / 5 / 15'}
            style={{ flex: 1, padding: '7px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: atDefault ? 'var(--text-3)' : 'var(--text-2)', fontFamily: 'inherit', fontSize: '0.7rem', fontWeight: 700, cursor: atDefault ? 'default' : 'pointer', opacity: atDefault ? 0.55 : 1 }}>
            Reset to {def.focusMin}/{def.shortMin}/{def.longMin}
          </button>
          <button onClick={() => setSettings(s => ({ ...s, customDefaults: { focusMin: s.focusMin, shortMin: s.shortMin, longMin: s.longMin } }))}
            title="Save the current durations as your personal default"
            style={{ flex: 1, padding: '7px 8px', borderRadius: 8, border: 'none', background: 'var(--blue-bg)', color: 'var(--blue-text)', fontFamily: 'inherit', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}>
            Set as my default
          </button>
        </div>
        <ToggleRow label="Auto-start next phase" on={settings.autoStartNext} onClick={() => setSettings(s => ({ ...s, autoStartNext: !s.autoStartNext }))} />
        <ToggleRow label="Log sessions to calendar" icon={<CalendarPlus size={13} />} on={settings.logToCalendar} onClick={() => setSettings(s => ({ ...s, logToCalendar: !s.logToCalendar }))} />
      </div>
    )
  }

  /* ════════════ FULL-SCREEN ZEN MODE ════════════ */
  if (fullscreen) {
    return (
      <>
        {burst && <Confetti priority="high" x={burst.x} y={burst.y} />}
        <div style={{
          position: 'fixed', inset: 0, zIndex: 4000, overflow: 'hidden',
          background: 'radial-gradient(circle at 50% 30%, #243b55 0%, #16243a 55%, #0b1422 100%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          animation: 'lv-backdrop-in .25s ease',
        }}>
          <BackgroundFX type={settings.fx} accent={accent} />

          {/* Top bar */}
          <div style={{ position: 'absolute', top: 18, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: 'rgba(255,255,255,0.85)' }}>
              <CrowGlyph size={18} color="#93c5fd" />
              <span style={{ fontSize: '0.82rem', fontWeight: 800, letterSpacing: '0.04em' }}>Focus</span>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <IconBtn title="Timer settings" color={showSettings ? '#fff' : 'rgba(255,255,255,0.6)'} onClick={() => setShowSettings(v => !v)}>
                <Sliders size={17} />
              </IconBtn>
              <IconBtn title={settings.sound ? 'Mute' : 'Unmute'} color="rgba(255,255,255,0.6)" onClick={() => setSettings(s => ({ ...s, sound: !s.sound }))}>
                {settings.sound ? <Volume2 size={17} /> : <VolumeX size={17} />}
              </IconBtn>
              <IconBtn title="Exit full screen" color="rgba(255,255,255,0.6)" onClick={() => setFullscreen(false)}>
                <Minimize2 size={17} />
              </IconBtn>
            </div>
          </div>

          {/* Settings overlay — same controls as the compact panel, as a floating card */}
          {showSettings && (
            <div onClick={() => setShowSettings(false)}
              style={{ position: 'absolute', inset: 0, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', padding: 16, animation: 'lv-backdrop-in .16s ease' }}>
              <div onClick={e => e.stopPropagation()}
                style={{ width: 340, maxWidth: '100%', maxHeight: 'calc(100dvh - 60px)', overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, boxShadow: 'var(--shadow-modal)', padding: 16, animation: 'modal-in .18s cubic-bezier(.22,1,.36,1)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--text)' }}>Timer settings</span>
                  <IconBtn title="Done" onClick={() => setShowSettings(false)}><X size={16} /></IconBtn>
                </div>
                <div style={{ marginBottom: 12 }}>{TaskPicker({})}</div>
                {courseOptions.length > 1 && (
                  <div style={{ marginBottom: 12 }}>{CoursePicker({})}</div>
                )}
                {SettingsContent({})}
              </div>
            </div>
          )}

          {/* Center stack */}
          <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 26 }}>
            {Tabs({ light: true })}
            {Ring({ size: isMobile ? 260 : 320 })}
            {linkedTarget && (
              <div style={{ fontSize: '0.92rem', fontWeight: 600, color: 'rgba(255,255,255,0.8)', maxWidth: 360, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {linkedTarget.title}
              </div>
            )}
            {Controls({ light: true })}
          </div>

          {/* Background picker */}
          <div style={{ position: 'absolute', bottom: 30, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, zIndex: 2 }}>
            <div style={{ display: 'flex', gap: 6, background: 'rgba(0,0,0,0.25)', padding: 5, borderRadius: 999, backdropFilter: 'blur(8px)' }}>
              {FX_OPTIONS.map(opt => {
                const on = settings.fx === opt.id
                return (
                  <button key={opt.id} onClick={() => setSettings(s => ({ ...s, fx: opt.id }))}
                    style={{
                      padding: '6px 14px', borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                      fontSize: '0.72rem', fontWeight: 700, transition: 'background .15s, color .15s',
                      background: on ? 'rgba(255,255,255,0.92)' : 'transparent',
                      color: on ? '#16243a' : 'rgba(255,255,255,0.65)',
                    }}>
                    {opt.label}
                  </button>
                )
              })}
            </div>
            <div style={{ fontSize: '0.66rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
              {sessionsToday} session{sessionsToday !== 1 ? 's' : ''} · {fmtDuration(focusSecondsToday)} today · Esc to exit
            </div>
          </div>
        </div>
      </>
    )
  }

  /* ════════════ COMPACT PANEL ════════════ */
  const panelStyle = isMobile
    ? { position: 'fixed', left: 12, right: 12, bottom: 'calc(76px + env(safe-area-inset-bottom, 0px))', zIndex: 2001 }
    : { position: 'fixed', right: 20, bottom: 86, width: 320, zIndex: 2001 }

  return (
    <>
      {burst && <Confetti priority="high" x={burst.x} y={burst.y} />}

      <div style={{
        ...panelStyle,
        maxWidth: 'calc(100vw - 24px)',
        maxHeight: isMobile ? 'calc(100dvh - 92px)' : 'calc(100dvh - 110px)',
        overflowY: 'auto',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 20, boxShadow: 'var(--shadow-modal)',
        animation: 'modal-in .18s cubic-bezier(.22,1,.36,1)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CrowGlyph size={18} color={accent} />
            <div style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>Focus</div>
          </div>
          <div style={{ display: 'flex', gap: 2 }}>
            <IconBtn title="How it works" active={settings.showInfo} onClick={() => setSettings(s => ({ ...s, showInfo: !s.showInfo }))}>
              <Lightbulb size={15} />
            </IconBtn>
            <IconBtn title="Full screen" onClick={() => setFullscreen(true)}><Maximize2 size={15} /></IconBtn>
            <IconBtn title={settings.sound ? 'Mute' : 'Unmute'} onClick={() => setSettings(s => ({ ...s, sound: !s.sound }))}>
              {settings.sound ? <Volume2 size={15} /> : <VolumeX size={15} />}
            </IconBtn>
            <IconBtn title="Timer settings" active={showSettings} onClick={() => setShowSettings(v => !v)}>
              <Sliders size={15} />
            </IconBtn>
            <IconBtn title="Close" onClick={onClose}><X size={15} /></IconBtn>
          </div>
        </div>

        {/* Phase tabs */}
        <div style={{ padding: '0 14px' }}>{Tabs({})}</div>

        {/* Ring */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0 6px' }}>
          {Ring({ size: 150 })}
        </div>

        {/* Controls */}
        <div style={{ padding: '4px 14px 10px' }}>{Controls({})}</div>

        {/* Task picker */}
        <div style={{ padding: '0 14px 10px' }}>{TaskPicker({})}</div>

        {/* Course tag picker */}
        {courseOptions.length > 1 && (
          <div style={{ padding: '0 14px 10px' }}>{CoursePicker({})}</div>
        )}

        {/* Settings drawer */}
        {showSettings && (
          <div style={{ padding: '10px 14px 12px', borderTop: '1px solid var(--border)', background: 'var(--surface2)' }}>
            {SettingsContent({})}
          </div>
        )}

        {/* How it works — toggled by the lightbulb, dismissible with the X; adapts to settings */}
        {settings.showInfo && (
          <div style={{ padding: '0 14px 10px' }}>
            <div style={{ position: 'relative', fontSize: '0.66rem', color: 'var(--text-3)', lineHeight: 1.45, background: 'var(--surface2)', borderRadius: 9, padding: '8px 26px 8px 10px' }}>
              <button onClick={() => setSettings(s => ({ ...s, showInfo: false }))} title="Hide"
                style={{ position: 'absolute', top: 5, right: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, display: 'flex', borderRadius: 6, lineHeight: 0 }}>
                <X size={12} />
              </button>
              Focus → break → repeat, with a <b style={{ color: 'var(--text-2)' }}>long break every {settings.longEvery}</b> sessions.{' '}
              {settings.autoStartNext
                ? 'Phases start automatically.'
                : 'The timer pauses between phases — press ▶ to start the next one.'}
              {settings.logToCalendar && ' Finished focus sessions are added to your calendar.'}
            </div>
          </div>
        )}

        {/* Today's stats footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', borderTop: '1px solid var(--border)', fontSize: '0.68rem', color: 'var(--text-2)' }}>
          <span style={{ fontWeight: 600 }}>Today</span>
          <span style={{ display: 'flex', gap: 12 }}>
            <span><b style={{ color: 'var(--text)' }}>{sessionsToday}</b> session{sessionsToday !== 1 ? 's' : ''}</span>
            <span><b style={{ color: 'var(--text)' }}>{fmtDuration(focusSecondsToday)}</b> focused</span>
          </span>
        </div>
      </div>
    </>
  )
}

/* ── Ambient backgrounds for full-screen mode ── */
function BackgroundFX({ type, accent }) {
  if (type === 'none') return null

  if (type === 'aurora') {
    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 1, pointerEvents: 'none' }}>
        {[
          { c: 'rgba(58,111,168,0.45)',  top: '-10%', left: '-5%',  size: 620, dur: 22 },
          { c: 'rgba(16,185,129,0.30)',  top: '20%',  left: '55%',  size: 540, dur: 28 },
          { c: 'rgba(139,92,246,0.28)',  top: '45%',  left: '10%',  size: 500, dur: 25 },
        ].map((b, i) => (
          <div key={i} style={{
            position: 'absolute', top: b.top, left: b.left, width: b.size, height: b.size, borderRadius: '50%',
            background: `radial-gradient(circle, ${b.c}, transparent 70%)`, filter: 'blur(20px)',
            animation: `lv-aurora ${b.dur}s ease-in-out ${i * -4}s infinite`,
          }} />
        ))}
      </div>
    )
  }

  if (type === 'rain') return <RainFX />
  if (type === 'fireflies') return <FirefliesFX />
  if (type === 'ocean') return <OceanFX />
  return <ParticleFX type={type} />
}

// Each effect lives in its own component so hook order never changes when the
// user switches backgrounds mid-session.

// ── Rain ──
// Each streak is a very thin tall rectangle with a negative
// skew so it looks like a diagonal rain streak.  Pure CSS animation, no images.
function RainFX() {
    const drops = useMemo(() => Array.from({ length: 80 }, (_, i) => ({
      id: i,
      left:   Math.random() * 110 - 5,     // allow some off-screen starts
      dur:    0.55 + Math.random() * 0.5,  // fast rain: 0.55–1.05s
      delay:  -(Math.random() * 2),
      height: 14 + Math.random() * 18,     // streak length in px
      drift:  (Math.random() * 2 - 1) * 8, // subtle sideways jitter
      opacity: 0.35 + Math.random() * 0.35,
    })), [])

    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 1, pointerEvents: 'none' }}>
        {/* Subtle water-surface sheen at the very bottom */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '6px',
          background: 'linear-gradient(180deg, transparent, rgba(180,220,255,0.08))',
        }} />
        {drops.map(p => (
          <span key={p.id} style={{
            position: 'absolute', left: `${p.left}%`, top: '-5%',
            width: 1.5, height: p.height, borderRadius: 1,
            background: 'rgba(180,220,255,0.65)',
            willChange: 'transform, opacity',
            ['--drift']: `${p.drift}px`,
            animation: `lv-rain ${p.dur}s linear ${p.delay}s infinite`,
          }} />
        ))}
      </div>
    )
}

// ── Fireflies ──
// Warm glowing dots that drift randomly through the screen.
// Two separate animations run simultaneously: a slow drift path and a glow pulse.
function FirefliesFX() {
    const flies = useMemo(() => Array.from({ length: 38 }, (_, i) => ({
      id: i,
      left: Math.random() * 95,
      top:  Math.random() * 90,
      size: 3 + Math.random() * 4,
      driftDur:  8 + Math.random() * 12,
      glowDur:   1.5 + Math.random() * 2.5,
      driftDelay: -(Math.random() * 16),
      glowDelay:  -(Math.random() * 4),
      // Four random waypoints for the drift path
      fx:  (Math.random() * 80 - 40) + 'px',
      fy:  (Math.random() * 60 - 30) + 'px',
      fx2: (Math.random() * 80 - 40) + 'px',
      fy2: (Math.random() * 60 - 30) + 'px',
      fx3: (Math.random() * 80 - 40) + 'px',
      fy3: (Math.random() * 60 - 30) + 'px',
    })), [])

    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 1, pointerEvents: 'none' }}>
        {flies.map(f => (
          <span key={f.id} style={{
            position: 'absolute', left: `${f.left}%`, top: `${f.top}%`,
            width: f.size, height: f.size, borderRadius: '50%',
            background: 'rgba(255,225,80,0.9)',
            willChange: 'transform, opacity, box-shadow',
            ['--fx']:  f.fx,  ['--fy']:  f.fy,
            ['--fx2']: f.fx2, ['--fy2']: f.fy2,
            ['--fx3']: f.fx3, ['--fy3']: f.fy3,
            // Stack both animations on the same element
            animation: [
              `lv-firefly-drift ${f.driftDur}s ease-in-out ${f.driftDelay}s infinite`,
              `lv-firefly-glow  ${f.glowDur}s  ease-in-out ${f.glowDelay}s  infinite`,
            ].join(', '),
          }} />
        ))}
      </div>
    )
}

// ── Ocean ──
// Three sinusoidal wave bands rendered as large rounded rectangles that
// slowly oscillate horizontally.  Deep blue palette, feels calm and meditative.
function OceanFX() {
    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 1, pointerEvents: 'none' }}>
        {/* Sky gradient */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, #0a1628 0%, #0d2040 40%, #0e3060 70%, #1a4a7a 100%)',
        }} />
        {/* Foam / crest sparkles — subtle dots near the wave tops */}
        {[15, 35, 58, 72, 88].map((l, i) => (
          <div key={i} style={{
            position: 'absolute', left: `${l}%`, bottom: `${42 + (i % 2) * 6}%`,
            width: 3, height: 3, borderRadius: '50%',
            background: 'rgba(255,255,255,0.55)',
            animation: `lv-twinkle ${2 + i * 0.4}s ease-in-out ${i * -0.7}s infinite`,
          }} />
        ))}
        {/* Wave band 3 — back (darkest) */}
        <div style={{
          position: 'absolute', bottom: '38%', left: '-10%', right: '-10%', height: '60%',
          borderRadius: '50% 50% 0 0 / 30px 30px 0 0',
          background: 'linear-gradient(180deg, #1e4d7a 0%, #0e2c55 100%)',
          animation: 'lv-wave3 9s ease-in-out infinite',
          willChange: 'transform',
        }} />
        {/* Wave band 2 — mid */}
        <div style={{
          position: 'absolute', bottom: '28%', left: '-10%', right: '-10%', height: '60%',
          borderRadius: '55% 45% 0 0 / 28px 28px 0 0',
          background: 'linear-gradient(180deg, #1a5e8f 0%, #0c3560 100%)',
          animation: 'lv-wave2 7s ease-in-out 0.5s infinite',
          willChange: 'transform',
        }} />
        {/* Wave band 1 — front (brightest) */}
        <div style={{
          position: 'absolute', bottom: '18%', left: '-10%', right: '-10%', height: '60%',
          borderRadius: '60% 40% 0 0 / 24px 24px 0 0',
          background: 'linear-gradient(180deg, #2272ae 0%, #0f4070 100%)',
          animation: 'lv-wave1 5.5s ease-in-out 1s infinite',
          willChange: 'transform',
        }} />
        {/* Foreground water */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '20%',
          background: 'linear-gradient(180deg, #2272ae 0%, #1a5580 100%)',
        }} />
        {/* Subtle foam line at the leading wave edge */}
        <div style={{
          position: 'absolute', bottom: '17.5%', left: '-10%', right: '-10%', height: 2,
          background: 'rgba(200,235,255,0.25)',
          borderRadius: 999,
          animation: 'lv-wave1 5.5s ease-in-out 1s infinite',
          willChange: 'transform',
        }} />
      </div>
    )
}

// stars / snow — generated particle field.
// Memoized on `type` ONLY: the timer re-renders every 250ms, and without this the
// random positions would be regenerated each render, making the stars teleport/twitch.
function ParticleFX({ type }) {
  const isSnow = type === 'snow'
  const particles = useMemo(() => {
    const count = isSnow ? 70 : 55
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      top: Math.random() * 100,
      size: isSnow ? 2 + Math.random() * 4 : 1.4 + Math.random() * 1.8,
      // Slow, long fades so the opacity fluctuates smoothly rather than blinking
      dur: isSnow ? 7 + Math.random() * 9 : 5 + Math.random() * 7,
      delay: Math.random() * -12,
      drift: (Math.random() * 2 - 1) * 40,
    }))
  }, [type, isSnow])

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 1, pointerEvents: 'none' }}>
      {particles.map(p => (
        <span key={p.id} style={{
          position: 'absolute', left: `${p.left}%`, top: isSnow ? '-5%' : `${p.top}%`,
          width: p.size, height: p.size, borderRadius: '50%',
          background: isSnow ? 'rgba(255,255,255,0.9)' : '#fff',
          boxShadow: isSnow ? 'none' : '0 0 3px rgba(255,255,255,0.5)',
          willChange: 'opacity',
          ['--drift']: `${p.drift}px`,
          animation: isSnow
            ? `lv-snow ${p.dur}s linear ${p.delay}s infinite`
            : `lv-twinkle ${p.dur}s ease-in-out ${p.delay}s infinite`,
        }} />
      ))}
    </div>
  )
}

/* ── Small helpers ── */
// Local-naive ISO "YYYY-MM-DDTHH:mm:ss" (no Z) so stored times match the user's wall clock.
function toLocalISO(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function fmtDuration(sec) {
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function IconBtn({ children, onClick, title, active, color }) {
  const base = color || (active ? 'var(--blue)' : 'var(--text-3)')
  return (
    <button onClick={onClick} title={title}
      style={{
        background: active ? 'var(--blue-bg)' : 'transparent', border: 'none', cursor: 'pointer',
        color: base, padding: 6, borderRadius: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .12s, color .12s, opacity .12s',
      }}
      onMouseEnter={e => { e.currentTarget.style.opacity = '0.7' }}
      onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}>
      {children}
    </button>
  )
}

function NumField({ label, value, min, max, onChange }) {
  return (
    <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <input type="number" className="field" value={value} min={min} max={max}
        onChange={e => {
          const n = parseInt(e.target.value, 10)
          if (!Number.isNaN(n)) onChange(Math.max(min, Math.min(max, n)))
        }}
        style={{ padding: '6px 8px', fontSize: '0.8rem', textAlign: 'center' }} />
    </label>
  )
}

function ToggleRow({ label, on, onClick, icon }) {
  return (
    <button onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 2px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', width: '100%' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-2)' }}>
        {icon}{label}
      </span>
      <span style={{
        width: 36, height: 20, borderRadius: 999, flexShrink: 0, position: 'relative',
        background: on ? 'var(--blue)' : 'var(--border)', transition: 'background .15s',
      }}>
        <span style={{
          position: 'absolute', top: 2, left: on ? 18 : 2, width: 16, height: 16, borderRadius: '50%',
          background: '#fff', transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {on && <Check size={10} color="var(--blue)" strokeWidth={3.5} />}
        </span>
      </span>
    </button>
  )
}

function CrowGlyph({ size = 20, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 -64 640 640" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <path fill={color} d="M544 32h-16.36C513.04 12.68 490.09 0 464 0c-44.18 0-80 35.82-80 80v20.98L12.09 393.57A30.216 30.216 0 0 0 0 417.74c0 22.46 23.64 37.07 43.73 27.03L165.27 384h96.49l44.41 120.1c2.27 6.23 9.15 9.44 15.38 7.17l22.55-8.21c6.23-2.27 9.44-9.15 7.17-15.38L312.94 384H352c1.91 0 3.76-.23 5.66-.29l44.51 120.38c2.27 6.23 9.15 9.44 15.38 7.17l22.55-8.21c6.23-2.27 9.44-9.15 7.17-15.38l-41.24-111.53C485.74 352.8 544 279.26 544 192v-80l96-16c0-35.35-42.98-64-96-64zm-80 72c-13.25 0-24-10.75-24-24 0-13.26 10.75-24 24-24s24 10.74 24 24c0 13.25-10.75 24-24 24z"/>
    </svg>
  )
}
