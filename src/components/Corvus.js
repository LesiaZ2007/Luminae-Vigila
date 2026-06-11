'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Zap, ZapOff, Calendar, CheckSquare, ChevronRight, Maximize2, X, Pencil, RefreshCw, Trash2, Clock, CalendarDays } from 'lucide-react'
import EventModal   from '@/components/EventModal'
import AddTodoModal from '@/components/AddTodoModal'

// ── Storage keys ─────────────────────────────────────────────────────────────
const SESSION_KEY       = 'corvus-session'
const SESSION_TTL       = 30 * 60 * 1000   // 30 min
const NUDGE_DISMISS_KEY = 'corvus-nudge-dismissed'   // value = YYYY-MM-DD
const MAX_HISTORY       = 50   // max messages kept in localStorage
const MAX_CONTEXT       = 16   // max messages sent per request (keeps Groq token usage sane)

function CrowIcon({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 -64 640 640" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <path fill={color} d="M544 32h-16.36C513.04 12.68 490.09 0 464 0c-44.18 0-80 35.82-80 80v20.98L12.09 393.57A30.216 30.216 0 0 0 0 417.74c0 22.46 23.64 37.07 43.73 27.03L165.27 384h96.49l44.41 120.1c2.27 6.23 9.15 9.44 15.38 7.17l22.55-8.21c6.23-2.27 9.44-9.15 7.17-15.38L312.94 384H352c1.91 0 3.76-.23 5.66-.29l44.51 120.38c2.27 6.23 9.15 9.44 15.38 7.17l22.55-8.21c6.23-2.27 9.44-9.15 7.17-15.38l-41.24-111.53C485.74 352.8 544 279.26 544 192v-80l96-16c0-35.35-42.98-64-96-64zm-80 72c-13.25 0-24-10.75-24-24 0-13.26 10.75-24 24-24s24 10.74 24 24c0 13.25-10.75 24-24 24z"/>
    </svg>
  )
}

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
function formatTime(iso) {
  if (!iso || !iso.includes('T')) return ''
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

// ── Build a "plan my week" structured prompt ──────────────────────────────────
function buildPlanMyWeekPrompt(events, todos, canvasAssignments) {
  const now    = new Date()
  const in7    = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const dateOf = d => new Date(d + (d.length === 10 ? 'T12:00:00' : ''))

  const upcomingEvents = [...(events || [])].filter(e => {
    if (!e.start) return false
    const d = new Date(e.start)
    return d >= now && d <= in7
  }).sort((a, b) => new Date(a.start) - new Date(b.start))

  const pendingTasks = [...(todos || [])].filter(t => !t.completed && t.dueDate && dateOf(t.dueDate) <= in7)
    .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))

  const dueAssignments = [...(canvasAssignments || [])].filter(a => {
    if (a.done || a.hidden || !a.dueAt) return false
    const d = new Date(a.dueAt)
    return d >= now && d <= in7
  }).sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))

  const lines = [
    'Please look at my next 7 days and propose a balanced study/work schedule.',
    '',
    `DATE RANGE: ${now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} → ${in7.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`,
    '',
  ]

  if (upcomingEvents.length) {
    lines.push('EVENTS THIS WEEK:')
    upcomingEvents.forEach(e => lines.push(`  • ${formatDate(e.start)}${formatTime(e.start) ? ' ' + formatTime(e.start) : ''} — ${e.title}`))
    lines.push('')
  }
  if (pendingTasks.length) {
    lines.push('TASKS DUE THIS WEEK:')
    pendingTasks.forEach(t => lines.push(`  • Due ${formatDate(t.dueDate)} — ${t.title} [${t.priority || 'medium'} priority]`))
    lines.push('')
  }
  if (dueAssignments.length) {
    lines.push('CANVAS ASSIGNMENTS DUE THIS WEEK:')
    dueAssignments.forEach(a => lines.push(`  • Due ${formatDate(a.dueAt)} — [${a.courseName}] ${a.title}`))
    lines.push('')
  }

  lines.push('Suggest specific study blocks I should add to my calendar (day + time + subject + rough duration). You can use preview_event to create them after I confirm your plan — just describe the plan first, then I\'ll tell you to go ahead.')
  return lines.join('\n')
}

// ── Build a deadline-cluster nudge prompt ──────────────────────────────────────
function buildNudgePrompt(cluster) {
  const lines = [
    `I have ${cluster.items.length} deadlines in the next 72 hours and no study blocks covering them yet. Here's what's coming up:`,
    '',
  ]
  cluster.items.forEach(item => {
    lines.push(`  • ${item.label} — due ${formatDate(item.due)}`)
  })
  lines.push('')
  lines.push('Can you help me plan study time for these? Suggest specific time blocks and I\'ll confirm each one.')
  return lines.join('\n')
}

// ── Detect deadline cluster (client-side, zero AI cost) ───────────────────────
function detectDeadlineCluster(events, todos, canvasAssignments) {
  const now      = new Date()
  const cutoff   = new Date(now.getTime() + 72 * 60 * 60 * 1000)

  // Gather upcoming deadlines within 72h
  const items = []
  ;(todos || []).forEach(t => {
    if (!t.completed && t.dueDate) {
      const d = new Date(t.dueDate + 'T23:59:00')
      if (d >= now && d <= cutoff) items.push({ label: t.title, due: t.dueDate, type: 'task' })
    }
  })
  ;(canvasAssignments || []).forEach(a => {
    if (!a.done && !a.hidden && a.dueAt) {
      const d = new Date(a.dueAt)
      if (d >= now && d <= cutoff) items.push({ label: `[${a.courseName}] ${a.title}`, due: a.dueAt, type: 'assignment' })
    }
  })

  if (items.length < 3) return null

  // Check whether any user events in the 72h window look like study blocks
  const studyKeywords = ['study', 'review', 'work on', 'prep', 'prepare', 'homework', 'hw', 'read', 'practice']
  const hasStudyBlock = (events || []).some(e => {
    if (!e.start) return false
    const d = new Date(e.start)
    if (d < now || d > cutoff) return false
    const title = (e.title || '').toLowerCase()
    return studyKeywords.some(kw => title.includes(kw))
  })

  if (hasStudyBlock) return null
  return { items }
}

// ── Nudge banner ──────────────────────────────────────────────────────────────
function NudgeBanner({ cluster, onOpen, onDismiss }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      background: 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(245,158,11,0.10))',
      border: '1px solid rgba(239,68,68,0.28)', borderRadius: 12,
      padding: '10px 14px', margin: '0 0 10px 0',
      animation: 'corvus-panel-in .3s cubic-bezier(.22,1,.36,1)',
    }}>
      <span style={{ fontSize: '1.0rem', flexShrink: 0 }}>🚦</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text)', lineHeight: 1.3 }}>
          Busy stretch ahead
        </div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-2)', lineHeight: 1.3 }}>
          {cluster.items.length} deadlines in 72 h — no study blocks yet
        </div>
      </div>
      <button
        onClick={onOpen}
        style={{
          flexShrink: 0, padding: '5px 10px', borderRadius: 8, border: 'none',
          background: '#ef4444', color: '#fff',
          fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
        }}
      >
        Help me plan
      </button>
      <button
        onClick={onDismiss}
        style={{
          flexShrink: 0, padding: 4, borderRadius: 6, border: 'none',
          background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center',
        }}
        title="Dismiss"
      >
        <X size={13} />
      </button>
    </div>
  )
}

const BASE_QUICK_ACTIONS = [
  { id: 'urgent',   label: 'Urgent deadlines',  prompt: 'Review my upcoming events, tasks, and Canvas assignments and tell me which ones are urgent.' },
  { id: 'week',     label: 'Summarize my week', prompt: 'Summarize my schedule and to-dos for this week, including Canvas deadlines.' },
  { id: 'focus',    label: 'What next?',         prompt: 'What should I focus on next based on my current schedule and tasks?' },
  { id: 'planweek', label: 'Plan my week',       prompt: null, icon: <CalendarDays size={11} /> },
  { id: 'estimate', label: 'Estimate task time', prompt: 'I want to estimate how long one of my upcoming tasks or assignments will take. Which one should I pick? List my pending items and I\'ll choose.', icon: <Clock size={11} /> },
]

function DetailRow({ label, value, dot }) {
  return (
    <div>
      <div style={{ fontSize: '0.67rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: '0.88rem', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
        {dot && <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flexShrink: 0, display: 'inline-block' }} />}
        {value}
      </div>
    </div>
  )
}

// ── Full-width preview panel (right column, non-compact mode) ─────────────
function PreviewPanel({ pending, events, eventCategories, onConfirm, onCancel, onEditDetails }) {
  const { name, data } = pending
  const isTask = name === 'preview_task'
  const cat    = !isTask && (eventCategories || []).find(c => c.id === data.category)
  const accent = isTask ? '#10b981' : (cat?.color || '#3a6fa8')
  const linked = data.linkedEventId ? events.find(e => e.id === data.linkedEventId) : null

  return (
    <div style={{
      width: 320, flexShrink: 0, borderLeft: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', background: 'var(--surface)',
      animation: 'corvus-panel-in .22s cubic-bezier(.22,1,.36,1)', overflow: 'hidden',
    }}>
      <div style={{ height: 4, background: accent, flexShrink: 0 }} />

      <div style={{ flex: 1, overflowY: 'auto', padding: '22px 20px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: accent + '18', borderRadius: 999, padding: '4px 10px', marginBottom: 16 }}>
          {isTask ? <CheckSquare size={11} style={{ color: accent }} /> : <Calendar size={11} style={{ color: accent }} />}
          <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: accent }}>
            {isTask ? 'New Task' : 'New Event'}
          </span>
        </div>
        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1.25, marginBottom: 20 }}>{data.title}</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {isTask ? (<>
            {data.dueDate  && <DetailRow label="Due date" value={formatDate(data.dueDate)} />}
            {data.priority && <DetailRow label="Priority" value={data.priority === 'high' ? '🔴  High' : data.priority === 'medium' ? '🟡  Medium' : '🟢  Low'} />}
            {data.category && <DetailRow label="Category" value={data.category.charAt(0).toUpperCase() + data.category.slice(1)} />}
            {linked        && <DetailRow label="Linked to" value={linked.title} />}
          </>) : (<>
            <DetailRow label="Date"  value={formatDate(data.start)} />
            {formatTime(data.start) && <DetailRow label="Time" value={
              formatTime(data.start) + (data.end && data.end !== data.start ? ` → ${formatTime(data.end)}` : '')
            } />}
            {cat && <DetailRow label="Category" value={cat.name || data.category} dot={cat.color} />}
          </>)}
          {data.repeatType && (
            <div>
              <div style={{ fontSize: '0.67rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)', marginBottom: 3 }}>Repeats</div>
              <div style={{ fontSize: '0.88rem', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <RefreshCw size={12} style={{ color: 'var(--blue)', flexShrink: 0 }} />
                {data.repeatType === 'daily' ? 'Daily' : data.repeatType === 'weekly' ? 'Weekly' : data.repeatType === 'biweekly' ? 'Every 2 weeks' : data.repeatType === 'monthly' ? 'Monthly' : 'Custom days'}
                {data.repeatUntil && ` · until ${formatDate(data.repeatUntil)}`}
              </div>
            </div>
          )}
          {data.notes && (
            <div>
              <div style={{ fontSize: '0.67rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)', marginBottom: 3 }}>Notes</div>
              <div style={{ fontSize: '0.84rem', color: 'var(--text-2)', lineHeight: 1.5, fontStyle: 'italic' }}>{data.notes}</div>
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: '14px 20px 18px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button onClick={onEditDetails} style={{
          width: '100%', padding: '9px', borderRadius: 9, border: '1px solid var(--border)',
          background: 'var(--surface2)', color: 'var(--text-2)',
          fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          <Pencil size={12} /> Edit details
        </button>
        <button onClick={onConfirm} style={{
          width: '100%', padding: '10px', borderRadius: 9, border: 'none',
          background: accent, color: '#fff',
          fontFamily: 'inherit', fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer',
        }}>
          Add {isTask ? 'Task' : 'Event'}
        </button>
        <button onClick={onCancel} style={{
          width: '100%', padding: '9px', borderRadius: 9, border: '1px solid var(--border)',
          background: 'transparent', color: 'var(--text-2)',
          fontFamily: 'inherit', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer',
        }}>
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Inline preview card (compact mode) ───────────────────────────────────
function InlinePreviewCard({ item, eventCategories, events, onConfirm, onCancel, onEditDetails }) {
  const isTask = item.type === 'preview_task'
  const d      = item.data
  const cat    = !isTask && (eventCategories || []).find(c => c.id === d.category)
  const accent = isTask ? '#10b981' : (cat?.color || '#3a6fa8')
  const linked = d.linkedEventId ? (events || []).find(e => e.id === d.linkedEventId) : null
  const isPending = item.state === 'pending'

  return (
    <div style={{
      background: 'var(--surface2)', border: `1px solid ${isPending ? accent + '55' : 'var(--border)'}`,
      borderLeft: `3px solid ${accent}`, borderRadius: 11, padding: '11px 13px',
      maxWidth: 280, opacity: item.state === 'cancelled' ? 0.45 : 1, transition: 'opacity .2s',
    }}>
      <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: accent, marginBottom: 5 }}>
        {isTask ? '📋 New Task' : '📅 New Event'}
      </div>
      <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text)', marginBottom: 5 }}>{d.title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: isPending ? 10 : 0 }}>
        {isTask ? (<>
          {d.dueDate  && <span style={{ fontSize: '0.74rem', color: 'var(--text-2)' }}>Due {formatDate(d.dueDate)}</span>}
          {d.priority && d.priority !== 'medium' && <span style={{ fontSize: '0.74rem', color: 'var(--text-2)' }}>{d.priority === 'high' ? '🔴' : '🟡'} {d.priority}</span>}
          {linked     && <span style={{ fontSize: '0.74rem', color: 'var(--text-2)' }}>↳ {linked.title}</span>}
        </>) : (<>
          <span style={{ fontSize: '0.74rem', color: 'var(--text-2)' }}>{formatDate(d.start)}{formatTime(d.start) ? ` · ${formatTime(d.start)}` : ''}</span>
        </>)}
        {d.repeatType && (
          <span style={{ fontSize: '0.72rem', color: 'var(--blue)', display: 'flex', alignItems: 'center', gap: 3 }}>
            <RefreshCw size={9} />
            {d.repeatType === 'daily' ? 'Daily' : d.repeatType === 'weekly' ? 'Weekly' : d.repeatType === 'biweekly' ? 'Bi-weekly' : d.repeatType === 'monthly' ? 'Monthly' : 'Custom'}
            {d.repeatUntil && ` · until ${formatDate(d.repeatUntil)}`}
          </span>
        )}
      </div>
      {isPending && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={onConfirm} style={{ flex: 1, padding: '6px', borderRadius: 7, border: 'none', background: accent, color: '#fff', fontFamily: 'inherit', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}>Add</button>
          <button onClick={onEditDetails} style={{ padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)', fontFamily: 'inherit', fontSize: '0.76rem', cursor: 'pointer' }}><Pencil size={11} /></button>
          <button onClick={onCancel} style={{ flex: 1, padding: '6px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontFamily: 'inherit', fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
        </div>
      )}
      {!isPending && (
        <div style={{ fontSize: '0.7rem', fontWeight: 600, color: item.state === 'confirmed' ? '#10b981' : 'var(--text-3)' }}>
          {item.state === 'confirmed' ? '✓ Added' : '✕ Cancelled'}
        </div>
      )}
    </div>
  )
}

// ── Mention card (existing event/task, clickable to navigate) ─────────────
function MentionCard({ item, type, eventCategories, onNavigate }) {
  const isTask = type === 'task'
  const cat    = !isTask && (eventCategories || []).find(c => c.id === item.extendedProps?.category)
  const accent = isTask
    ? (item.priority === 'high' ? '#ef4444' : item.priority === 'low' ? '#10b981' : '#f59e0b')
    : (cat?.color || '#3a6fa8')

  return (
    <button
      onClick={() => onNavigate?.(item, type)}
      style={{
        background: 'var(--surface2)', border: `1px solid var(--border)`,
        borderLeft: `3px solid ${accent}`, borderRadius: 11, padding: '10px 13px',
        maxWidth: 280, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
        transition: 'background .15s, transform .1s', display: 'block', width: '100%',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--blue-bg)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.transform = 'none' }}
    >
      <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: accent, marginBottom: 4 }}>
        {isTask ? '📋 Task' : '📅 Event'}
      </div>
      <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text)', marginBottom: 3 }}>
        {item.title}
      </div>
      {!isTask && item.start && (
        <div style={{ fontSize: '0.74rem', color: 'var(--text-2)' }}>
          {formatDate(item.start)}{formatTime(item.start) ? ` · ${formatTime(item.start)}` : ''}
        </div>
      )}
      {isTask && item.dueDate && (
        <div style={{ fontSize: '0.74rem', color: 'var(--text-2)' }}>
          Due {formatDate(item.dueDate)}
          {item.priority && item.priority !== 'medium' && (
            <span style={{ marginLeft: 6 }}>{item.priority === 'high' ? '🔴' : '🟢'}</span>
          )}
        </div>
      )}
      <div style={{ fontSize: '0.68rem', color: 'var(--blue-text)', marginTop: 5, display: 'flex', alignItems: 'center', gap: 3 }}>
        <ChevronRight size={10} /> View
      </div>
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Corvus({ events, canvasClassEvents = [], todos, canvasAssignments = [], todoCategories, eventCategories, onAddTodo, onSaveEvent, onUpdateTodo, onNavigateToItem, compact = false, onExpand, onClose, nudgeCluster = null, onNudgeDismiss }) {

  // ── Lazy-init state from localStorage so history survives tab switches ──
  const [history, setHistory] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}')
      if (saved.t && Date.now() - saved.t < SESSION_TTL && saved.history?.length) return saved.history
    } catch (_) {}
    return []
  })
  const [items, setItems] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}')
      if (saved.t && Date.now() - saved.t < SESSION_TTL && saved.items?.length) {
        return saved.items.map(it => it.state === 'pending' ? { ...it, state: 'cancelled' } : it)
      }
    } catch (_) {}
    return [{ type: 'assistant', text: "Hi! I'm Corvus. Tell me what you need — I'll add tasks or events, or edit existing ones." }]
  })
  const [pending,        setPending]        = useState(null)
  const [editingPreview, setEditingPreview] = useState(false)
  const [autoAdd,        setAutoAdd]        = useState(false)
  const [loading,        setLoading]        = useState(false)
  const [input,          setInput]          = useState('')
  const [rateLimitCountdown, setRateLimitCountdown] = useState(0)
  // Nudge: only show in-panel banner if we haven't dismissed today and a cluster exists
  const [nudgeDismissed, setNudgeDismissed] = useState(() => {
    try {
      const d = localStorage.getItem(NUDGE_DISMISS_KEY)
      return d === new Date().toISOString().slice(0, 10)
    } catch (_) { return false }
  })
  const countdownRef = useRef(null)
  const bottomRef    = useRef(null)

  // Clean up countdown interval on unmount
  useEffect(() => () => clearInterval(countdownRef.current), [])

  // ── Persist session (cap at MAX_HISTORY messages) ──
  useEffect(() => {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        history: history.slice(-MAX_HISTORY),
        items:   items.slice(-60),
        t:       Date.now(),
      }))
    } catch (_) {}
  }, [history, items])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [items, loading])

  // ── If opened via nudge, pre-load the prompt once ──
  const nudgeLoadedRef = useRef(false)
  useEffect(() => {
    if (nudgeCluster && !nudgeDismissed && !nudgeLoadedRef.current && !loading) {
      nudgeLoadedRef.current = true
      // Slight delay so component renders first
      const timer = setTimeout(() => {
        sendMessage(buildNudgePrompt(nudgeCluster))
      }, 300)
      return () => clearTimeout(timer)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nudgeCluster])

  // ── Clear conversation ──
  function clearConversation() {
    setHistory([])
    setItems([{ type: 'assistant', text: "Hi! I'm Corvus. Tell me what you need — I'll add tasks or events, or edit existing ones." }])
    setPending(null)
    try { localStorage.removeItem(SESSION_KEY) } catch (_) {}
  }

  // ── Dismiss nudge (set daily flag + notify parent) ──
  function dismissNudge() {
    const today = new Date().toISOString().slice(0, 10)
    try { localStorage.setItem(NUDGE_DISMISS_KEY, today) } catch (_) {}
    setNudgeDismissed(true)
    onNudgeDismiss?.()
  }

  // ── API call — sends last MAX_CONTEXT messages as context ──
  async function callApi(msgs) {
    const res = await fetch('/api/corvus', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: msgs.slice(-MAX_CONTEXT),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        events: [...events, ...canvasClassEvents]
          .filter(e => !e.start || new Date(e.start) >= new Date(Date.now() - 86400_000))
          .sort((a, b) => new Date(a.start) - new Date(b.start))
          .slice(0, 30),
        todos: todos.filter(t => !t.completed).slice(0, 20),
        canvasAssignments: canvasAssignments.filter(a => !a.done && !a.hidden).slice(0, 30),
      }),
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  }

  async function processBlocks(content, hist) {
    const newHist = [...hist, { role: 'assistant', content }]
    setHistory(newHist)
    const hasShowItems = content.some(b => b.type === 'tool_use' && b.name === 'show_items')
    for (const b of content) {
      if (b.type === 'text' && b.text.trim()) {
        setItems(p => [...p, { type: 'assistant', text: b.text.trim() }])
        // Fallback: if model didn't call show_items, auto-match mentioned events/tasks by title
        if (!hasShowItems) {
          const txt = b.text.toLowerCase()
          const matchedEvents = events.filter(e => e.title && txt.includes(e.title.toLowerCase()))
          const matchedTasks  = todos.filter(t => t.title && txt.includes(t.title.toLowerCase()))
          if (matchedEvents.length > 0 || matchedTasks.length > 0) {
            setItems(p => [...p, { type: 'mention_items', events: matchedEvents, tasks: matchedTasks }])
          }
        }
      }
      else if (b.type === 'tool_use') await handleTool(b, newHist)
    }
    return newHist
  }

  async function handleTool(block, hist) {
    const { name, input: inp, id } = block

    if (name === 'preview_task' || name === 'preview_event') {
      if (autoAdd) {
        executeAction(name, inp)
        setItems(p => [...p, { type: name, data: inp, toolUseId: id, state: 'confirmed' }])
        await sendResult(hist, id, 'Auto-added.')
      } else {
        setPending({ toolUseId: id, name, data: inp, historyAt: hist })
        setItems(p => [...p, { type: name, data: inp, toolUseId: id, state: 'pending' }])
      }
    } else if (name === 'edit_event') {
      const ev = events.find(e => e.id === inp.eventId)
      if (ev) {
        const updated = { ...ev }
        if (inp.title) updated.title = inp.title
        if (inp.start) updated.start = inp.start
        if (inp.end)   updated.end   = inp.end
        if (inp.category || inp.notes !== undefined) {
          updated.extendedProps = { ...ev.extendedProps }
          if (inp.category) {
            updated.extendedProps.category = inp.category
            const cat = (eventCategories || []).find(c => c.id === inp.category)
            if (cat) updated.color = cat.color
          }
          if (inp.notes !== undefined) updated.extendedProps.notes = inp.notes
        }
        onSaveEvent(updated)
        setItems(p => [...p, { type: 'action', text: `Updated "${updated.title}"` }])
        setHistory(h => [...h, { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'Event updated.' }] }])
      } else {
        setItems(p => [...p, { type: 'action', text: "Couldn't find that event." }])
        await sendResult(hist, id, 'Event not found.')
      }
    } else if (name === 'edit_task') {
      const t = todos.find(t => t.id === inp.taskId)
      if (t) {
        const { taskId, ...changes } = inp
        onUpdateTodo({ ...t, ...changes })
        setItems(p => [...p, { type: 'action', text: `Updated "${t.title}"` }])
        setHistory(h => [...h, { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'Task updated.' }] }])
      } else {
        setItems(p => [...p, { type: 'action', text: "Couldn't find that task." }])
        await sendResult(hist, id, 'Task not found.')
      }
    } else if (name === 'complete_task') {
      const t = todos.find(t => t.id === inp.taskId)
      if (t) {
        onUpdateTodo({ ...t, completed: true })
        setItems(p => [...p, { type: 'action', text: `✓ Completed "${t.title}"` }])
        setHistory(h => [...h, { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'Task marked complete.' }] }])
      } else {
        setItems(p => [...p, { type: 'action', text: "Couldn't find that task." }])
        await sendResult(hist, id, 'Task not found.')
      }
    } else if (name === 'show_items') {
      const resolvedEvents = (inp.eventIds || []).map(id => events.find(e => e.id === id)).filter(Boolean)
      const resolvedTasks  = (inp.taskIds  || []).map(id => todos.find(t => t.id === id)).filter(Boolean)
      if (resolvedEvents.length > 0 || resolvedTasks.length > 0) {
        setItems(p => [...p, { type: 'mention_items', events: resolvedEvents, tasks: resolvedTasks }])
      }
      setHistory(h => [...h, { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'Items shown to user.' }] }])
    }
  }

  async function sendResult(hist, toolUseId, resultText) {
    const msg = { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseId, content: resultText }] }
    const upd = [...hist, msg]
    setHistory(upd)
    try {
      const data = await callApi(upd)
      const fin  = [...upd, { role: 'assistant', content: data.content }]
      setHistory(fin)
      for (const b of data.content)
        if (b.type === 'text' && b.text.trim()) setItems(p => [...p, { type: 'assistant', text: b.text.trim() }])
    } catch (_) {}
  }

  function executeAction(toolName, data) {
    if (toolName === 'preview_task') {
      const recurrence = data.repeatType ? {
        type: data.repeatType,
        days: data.repeatType === 'custom' ? (data.repeatDays || []) : [],
        until: data.repeatUntil || null,
      } : null
      onAddTodo({
        title: data.title, dueDate: data.dueDate || '', priority: data.priority || 'medium',
        category: data.category || todoCategories[0]?.id || 'academic',
        linkedEventId: data.linkedEventId || '', notes: data.notes || '',
        recurrence,
      })
    } else {
      const cat    = (eventCategories || []).find(c => c.id === data.category) || eventCategories?.[0]
      const isAllDay = data.allDay || !data.start?.includes('T')
      let end = data.end
      if (isAllDay && end?.length === 10) {
        const d = new Date(end + 'T12:00:00'); d.setDate(d.getDate() + 1); end = d.toISOString().slice(0, 10)
      }
      const recurrence = data.repeatType ? {
        type: data.repeatType,
        days: data.repeatType === 'custom' ? (data.repeatDays || []) : [],
        until: data.repeatUntil || null,
      } : null
      onSaveEvent({ title: data.title, start: data.start, end: end || data.start, allDay: isAllDay, color: cat?.color, extendedProps: { category: cat?.id, notes: data.notes || null }, recurrence })
    }
  }

  async function handleConfirm() {
    if (!pending) return
    const { toolUseId, name, data, historyAt } = pending
    executeAction(name, data)
    setItems(p => p.map(it => it.toolUseId === toolUseId ? { ...it, state: 'confirmed' } : it))
    setPending(null)
    setLoading(true)
    await sendResult(historyAt, toolUseId, 'User confirmed. Item added.')
    setLoading(false)
  }

  async function handleCancel() {
    if (!pending) return
    const { toolUseId, historyAt } = pending
    setItems(p => p.map(it => it.toolUseId === toolUseId ? { ...it, state: 'cancelled' } : it))
    setPending(null)
    setLoading(true)
    await sendResult(historyAt, toolUseId, 'User cancelled. Item not added.')
    setLoading(false)
  }

  async function sendMessage(text) {
    if (!text || loading || pending) return
    setInput('')
    setLoading(true)
    const userMsg    = { role: 'user', content: text }
    // Send recent history as context (capped), not the entire accumulated history
    const newHistory = [...history.slice(-(MAX_HISTORY - 1)), userMsg]
    setHistory(newHistory)
    setItems(p => [...p, { type: 'user', text }])
    try {
      const data = await callApi(newHistory)
      if (data.error) throw new Error(data.error)
      await processBlocks(data.content, newHistory)
    } catch (e) {
      const is429 = e?.message?.includes('429')
      const msg = is429 ? "I'm getting rate-limited — give me a moment and try again."
                : e?.message?.includes('401') ? "API key issue — check your GROQ_API_KEY in .env.local."
                : "Hmm, something went wrong on my end. Try again?"
      setItems(p => [...p, { type: 'assistant', text: msg }])
      if (is429) {
        setRateLimitCountdown(30)
        clearInterval(countdownRef.current)
        countdownRef.current = setInterval(() => {
          setRateLimitCountdown(prev => {
            if (prev <= 1) { clearInterval(countdownRef.current); return 0 }
            return prev - 1
          })
        }, 1000)
      }
    }
    setLoading(false)
  }

  async function handleSend() {
    await sendMessage(input.trim())
  }

  async function handleQuickAction(action) {
    if (action.id === 'planweek') {
      await sendMessage(buildPlanMyWeekPrompt(
        [...events, ...canvasClassEvents],
        todos,
        canvasAssignments,
      ))
    } else {
      await sendMessage(action.prompt)
    }
  }

  // Build the event object to pass to EventModal for editing the preview
  function previewAsEvent() {
    if (!pending) return null
    const d = pending.data
    const start = d.start ? (d.start.length === 10 ? d.start + 'T09:00:00' : d.start) : new Date().toISOString()
    const recurrence = d.repeatType ? { type: d.repeatType, days: d.repeatDays || [], until: d.repeatUntil || null } : null
    return { title: d.title, start, end: d.end || start, allDay: d.allDay || !d.start?.includes('T'), extendedProps: { category: d.category || eventCategories?.[0]?.id, notes: d.notes || '' }, reminder: null, recurrence }
  }

  function handleEditModalSave(saved) {
    const newData = {
      title: saved.title, start: saved.start, end: saved.end,
      allDay: saved.allDay, category: saved.extendedProps?.category, notes: saved.extendedProps?.notes,
      repeatType:  saved.recurrence?.type  || null,
      repeatDays:  saved.recurrence?.days  || [],
      repeatUntil: saved.recurrence?.until || null,
    }
    setPending(p => ({ ...p, data: { ...p.data, ...newData } }))
    setItems(p => p.map(it => it.toolUseId === pending.toolUseId ? { ...it, data: { ...it.data, ...newData } } : it))
    setEditingPreview(false)
  }
  function handleEditTodoSave(updated) {
    const newData = {
      title: updated.title, dueDate: updated.dueDate, priority: updated.priority,
      category: updated.category, linkedEventId: updated.linkedEventId, notes: updated.notes,
      repeatType:  updated.recurrence?.type  || null,
      repeatDays:  updated.recurrence?.days  || [],
      repeatUntil: updated.recurrence?.until || null,
    }
    setPending(p => ({ ...p, data: { ...p.data, ...newData } }))
    setItems(p => p.map(it => it.toolUseId === pending.toolUseId ? { ...it, data: { ...it.data, ...newData } } : it))
    setEditingPreview(false)
  }

  // ── Render ──────────────────────────────────────────────────────────────
  const showSidePanel   = !compact && !!pending && !autoAdd
  const showNudgeBanner = !!nudgeCluster && !nudgeDismissed

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden', background: 'var(--surface)' }}>

      {/* ── Chat column ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* Header */}
        <div style={{ padding: compact ? '10px 14px' : '13px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CrowIcon size={compact ? 14 : 16} color="var(--blue)" />
            <span style={{ fontWeight: 700, fontSize: compact ? '0.82rem' : '0.9rem', color: 'var(--text)' }}>Corvus</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Clear conversation button */}
            <button
              onClick={clearConversation}
              title="Clear conversation"
              style={{
                display: 'flex', alignItems: 'center', padding: '3px 8px', borderRadius: 999,
                border: '1px solid var(--border)', background: 'var(--surface2)',
                color: 'var(--text-3)', fontFamily: 'inherit', fontSize: '0.67rem', fontWeight: 600,
                cursor: 'pointer', gap: 4,
              }}
            >
              <Trash2 size={9} />
              {!compact && 'Clear'}
            </button>
            <button onClick={() => setAutoAdd(v => !v)} title={autoAdd ? 'Auto-add on' : 'Preview on'} style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 999,
              border: '1px solid var(--border)', background: autoAdd ? 'var(--blue-bg)' : 'var(--surface2)',
              color: autoAdd ? 'var(--blue-text)' : 'var(--text-3)', fontFamily: 'inherit', fontSize: '0.67rem', fontWeight: 600, cursor: 'pointer',
            }}>
              {autoAdd ? <Zap size={9} /> : <ZapOff size={9} />}
              {autoAdd ? 'Auto-add' : 'Preview'}
            </button>
            {compact && onExpand && (
              <button onClick={onExpand} title="Open full screen" style={{ display: 'flex', alignItems: 'center', padding: 5, borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer' }}>
                <Maximize2 size={13} />
              </button>
            )}
            {compact && onClose && (
              <button onClick={onClose} title="Close" style={{ display: 'flex', alignItems: 'center', padding: 5, borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}>
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div style={{ padding: compact ? '8px 14px' : '12px 20px', gap: 8, overflowX: 'auto', display: 'flex', flexWrap: 'wrap', borderBottom: '1px solid var(--border)' }}>
          {BASE_QUICK_ACTIONS.map(action => (
            <button key={action.id} onClick={() => handleQuickAction(action)} disabled={loading || !!pending}
                    style={{
                      flex: '0 0 auto', padding: '8px 12px', borderRadius: 999, border: '1px solid',
                      borderColor: action.id === 'planweek' ? 'rgba(58,111,168,0.45)' : action.id === 'estimate' ? 'rgba(16,185,129,0.35)' : 'rgba(255,255,255,.12)',
                      background: action.id === 'planweek' ? 'var(--blue-bg)' : action.id === 'estimate' ? 'rgba(16,185,129,0.08)' : 'var(--surface2)',
                      color: action.id === 'planweek' ? 'var(--blue-text)' : action.id === 'estimate' ? '#10b981' : 'var(--text-2)',
                      fontSize: '0.75rem', fontWeight: 700,
                      cursor: loading || pending ? 'not-allowed' : 'pointer',
                      opacity: loading || pending ? 0.45 : 1,
                      display: 'flex', alignItems: 'center', gap: 5,
                    }}>
              {action.icon && action.icon}
              {action.label}
            </button>
          ))}
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: compact ? '14px' : '20px', display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Proactive nudge banner (shown inside chat area, above messages) */}
          {showNudgeBanner && (
            <NudgeBanner
              cluster={nudgeCluster}
              onOpen={() => {
                dismissNudge()
                sendMessage(buildNudgePrompt(nudgeCluster))
              }}
              onDismiss={dismissNudge}
            />
          )}

          {items.map((item, i) => {
            if (item.type === 'user') return (
              <div key={i} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ maxWidth: '72%', background: 'var(--blue)', color: '#fff', borderRadius: '18px 18px 4px 18px', padding: '9px 14px', fontSize: '0.875rem', lineHeight: 1.45 }}>
                  {item.text}
                </div>
              </div>
            )
            if (item.type === 'assistant') return (
              <div key={i} style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ maxWidth: '78%', background: 'var(--surface2)', color: 'var(--text)', borderRadius: '18px 18px 18px 4px', padding: '9px 14px', fontSize: '0.875rem', lineHeight: 1.5 }}>
                  {item.text}
                </div>
              </div>
            )
            if (item.type === 'action') return (
              <div key={i} style={{ fontSize: '0.74rem', color: 'var(--text-3)', padding: '1px 4px' }}>✓ {item.text}</div>
            )
            if (item.type === 'mention_items') return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
                {(item.events || []).map((ev, j) => (
                  <MentionCard key={`ev-${j}`} item={ev} type="event" eventCategories={eventCategories} onNavigate={onNavigateToItem} />
                ))}
                {(item.tasks || []).map((t, j) => (
                  <MentionCard key={`t-${j}`} item={t} type="task" eventCategories={eventCategories} onNavigate={onNavigateToItem} />
                ))}
              </div>
            )
            if (item.type === 'preview_task' || item.type === 'preview_event') {
              if (compact) {
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <InlinePreviewCard
                      item={item} eventCategories={eventCategories} events={events}
                      onConfirm={item.state === 'pending' ? handleConfirm : undefined}
                      onCancel={item.state === 'pending' ? handleCancel : undefined}
                      onEditDetails={item.state === 'pending' ? () => setEditingPreview(true) : undefined}
                    />
                  </div>
                )
              }
              // Pill reference in full mode — side panel shows the detail
              const isTask = item.type === 'preview_task'
              const cat    = !isTask && (eventCategories || []).find(c => c.id === item.data?.category)
              const accent = isTask ? '#10b981' : (cat?.color || '#3a6fa8')
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7,
                    background: 'var(--surface2)', border: `1px solid ${item.state !== 'pending' ? 'var(--border)' : accent + '55'}`,
                    borderRadius: 10, padding: '8px 12px', opacity: item.state === 'cancelled' ? 0.5 : 1, transition: 'opacity .2s',
                  }}>
                    {isTask ? <CheckSquare size={13} style={{ color: accent, flexShrink: 0 }} /> : <Calendar size={13} style={{ color: accent, flexShrink: 0 }} />}
                    <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text)' }}>{item.data?.title}</span>
                    {item.state === 'pending'    && <span style={{ fontSize: '0.71rem', color: accent, display: 'flex', alignItems: 'center', gap: 2 }}><ChevronRight size={11} />Preview →</span>}
                    {item.state === 'confirmed'  && <span style={{ fontSize: '0.71rem', color: '#10b981', fontWeight: 600 }}>✓ Added</span>}
                    {item.state === 'cancelled'  && <span style={{ fontSize: '0.71rem', color: 'var(--text-3)' }}>Cancelled</span>}
                  </div>
                </div>
              )
            }
            return null
          })}

          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{ background: 'var(--surface2)', borderRadius: '18px 18px 18px 4px', padding: '11px 15px', display: 'flex', gap: 5, alignItems: 'center' }}>
                {[0,1,2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-3)', animation: `corvus-dot 1.1s ${i*.18}s ease-in-out infinite` }} />)}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ padding: compact ? '10px 14px' : '14px 20px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          {pending && <div style={{ marginBottom: 7, fontSize: '0.7rem', color: 'var(--text-3)', textAlign: 'center' }}>Confirm or cancel the preview to continue</div>}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              placeholder={pending ? 'Waiting for confirmation…' : rateLimitCountdown > 0 ? `Rate limited — retry in ${rateLimitCountdown}s…` : 'Ask me to add or edit anything…'}
              disabled={!!pending || loading || rateLimitCountdown > 0} rows={1}
              style={{
                flex: 1, resize: 'none', background: 'var(--input-bg)', border: '1.5px solid var(--border)',
                borderRadius: 11, padding: compact ? '9px 12px' : '11px 14px',
                fontFamily: 'inherit', fontSize: compact ? '0.82rem' : '0.875rem', color: 'var(--text)',
                outline: 'none', lineHeight: 1.4, opacity: (pending || loading) ? 0.5 : 1, transition: 'opacity .15s, border-color .15s',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--blue)' }}
              onBlur={e  => { e.currentTarget.style.borderColor = 'var(--border)' }}
            />
            <button onClick={handleSend} disabled={!input.trim() || loading || !!pending || rateLimitCountdown > 0} style={{
              padding: compact ? '9px 11px' : '11px 13px', borderRadius: 11, border: 'none',
              background: rateLimitCountdown > 0 ? 'var(--surface2)' : 'var(--blue)',
              color: rateLimitCountdown > 0 ? 'var(--text-2)' : '#fff',
              flexShrink: 0, minWidth: rateLimitCountdown > 0 ? 72 : undefined,
              cursor: (!input.trim() || loading || pending || rateLimitCountdown > 0) ? 'not-allowed' : 'pointer',
              opacity: (!input.trim() || loading || pending) && rateLimitCountdown === 0 ? 0.4 : 1,
              transition: 'opacity .15s, background .2s',
              fontSize: rateLimitCountdown > 0 ? '0.7rem' : undefined,
              fontWeight: rateLimitCountdown > 0 ? 700 : undefined,
              fontFamily: rateLimitCountdown > 0 ? 'inherit' : undefined,
            }}>
              {rateLimitCountdown > 0 ? `${rateLimitCountdown}s` : <Send size={compact ? 13 : 15} />}
            </button>
          </div>
        </div>
      </div>

      {/* ── Side preview panel (full mode only) ── */}
      {showSidePanel && (
        <PreviewPanel
          pending={pending} events={events} eventCategories={eventCategories}
          onConfirm={handleConfirm} onCancel={handleCancel}
          onEditDetails={() => setEditingPreview(true)}
        />
      )}

      {/* ── Edit modals ── */}
      {editingPreview && pending && (
        pending.name === 'preview_event' ? (
          <EventModal
            event={previewAsEvent()} categories={eventCategories || []}
            onSave={handleEditModalSave}
            onDelete={() => setEditingPreview(false)}
            onClose={() => setEditingPreview(false)}
          />
        ) : (
          <AddTodoModal
            events={events} todoCategories={todoCategories || []}
            editTodo={{ ...pending.data, id: 'corvus-preview' }}
            onAdd={() => {}} onEdit={handleEditTodoSave}
            onClose={() => setEditingPreview(false)}
          />
        )
      )}
    </div>
  )
}
