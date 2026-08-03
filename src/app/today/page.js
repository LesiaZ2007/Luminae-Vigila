'use client'

/**
 * /today — the glance view.
 *
 * A deliberately small, chrome-free read-only page: no sidebar, no nav, no
 * editing. It exists to be *looked at* rather than used — pinned to a home
 * screen as its own icon, parked in a tablet split-screen, or opened from the
 * daily push. That framing is why it reads straight from localStorage instead of
 * mounting the app's state: it must paint instantly and work with no network,
 * which a full app boot cannot promise.
 *
 * Everything it shows comes from lib/glance, shared with the daily push, so the
 * page and the notification can never disagree about what today looks like.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, CheckCircle2, AlertTriangle, Clock, ArrowRight, RefreshCw } from 'lucide-react'
import { buildGlance, glanceSummaryLine, displayTime } from '@/lib/glance'
import { todayStr } from '@/lib/localDate'

function readLocal(key) {
  try {
    const raw = localStorage.getItem(key)
    const val = raw ? JSON.parse(raw) : []
    return Array.isArray(val) ? val : []
  } catch {
    return []
  }
}

const LONG_DATE = { weekday: 'long', month: 'long', day: 'numeric' }

export default function TodayGlance() {
  // Starts null so the server render and the first client render agree; reading
  // localStorage during render would hydration-mismatch every time.
  const [glance, setGlance] = useState(null)

  useEffect(() => {
    const load = () => setGlance(buildGlance({
      todos:       readLocal('lv-todos'),
      events:      readLocal('lv-events'),
      assignments: readLocal('lv-canvas-assignments'),
      dateStr:     todayStr(),
    }))
    load()

    // The main app writes to localStorage as you work. `storage` fires only in
    // *other* tabs, which is exactly the case that matters here: this page is
    // usually the one sitting in a split-screen while you edit next door.
    window.addEventListener('storage', load)
    // Coming back to a backgrounded glance should not show yesterday.
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('storage', load)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const heading = new Date().toLocaleDateString(undefined, LONG_DATE)

  return (
    <main style={S.page}>
      <div style={S.card}>
        <header style={S.header}>
          <div>
            <h1 style={S.h1}>{heading}</h1>
            <p style={S.sub}>{glance ? glanceSummaryLine(glance) : 'Loading…'}</p>
          </div>
          <Link href="/" style={S.openApp} aria-label="Open the full app">
            Open <ArrowRight size={15} />
          </Link>
        </header>

        {!glance && <p style={S.muted}><RefreshCw size={14} /> Reading your schedule…</p>}

        {glance?.isEmpty && (
          <div style={S.empty}>
            <CheckCircle2 size={30} color="var(--green)" />
            <p style={S.emptyText}>Nothing scheduled today.</p>
          </div>
        )}

        {glance?.overdue.length > 0 && (
          <Section title="Overdue" icon={<AlertTriangle size={15} color="var(--red)" />} accent="var(--red)">
            {glance.overdue.slice(0, 5).map(t => (
              <Row key={t.id} title={t.title} meta={t.due} accent="var(--red)" />
            ))}
            {glance.overdue.length > 5 && (
              <p style={S.more}>+{glance.overdue.length - 5} more</p>
            )}
          </Section>
        )}

        {glance?.events.length > 0 && (
          <Section title="Today's schedule" icon={<CalendarDays size={15} color="var(--blue)" />} accent="var(--blue)">
            {glance.events.map(e => (
              <Row
                key={e.id}
                title={e.title}
                meta={e.allDay ? 'All day' : `${displayTime(e.time)}${e.endTime ? ` – ${displayTime(e.endTime)}` : ''}`}
                accent="var(--blue)"
              />
            ))}
          </Section>
        )}

        {glance && (glance.dueToday.length > 0 || glance.assignments.length > 0) && (
          <Section title="Due today" icon={<Clock size={15} color="var(--amber)" />} accent="var(--amber)">
            {glance.dueToday.map(t => <Row key={t.id} title={t.title} accent="var(--amber)" />)}
            {glance.assignments.map(a => (
              <Row key={a.id} title={a.title} meta={a.time ? displayTime(a.time) : 'Canvas'} accent="var(--amber)" />
            ))}
          </Section>
        )}
      </div>
    </main>
  )
}

function Section({ title, icon, accent, children }) {
  return (
    <section style={S.section}>
      <h2 style={{ ...S.h2, color: accent }}>{icon}{title}</h2>
      <div style={S.rows}>{children}</div>
    </section>
  )
}

function Row({ title, meta, accent }) {
  return (
    <div style={{ ...S.row, borderLeftColor: accent }}>
      <span style={S.rowTitle}>{title}</span>
      {meta && <span style={S.rowMeta}>{meta}</span>}
    </div>
  )
}

const S = {
  page: {
    // Fixed height + own scroller: the root layout sets `overflow-hidden` on
    // <body> for the app shell, so a tall glance would otherwise be clipped
    // rather than scrolled.
    height: '100dvh', overflowY: 'auto',
    background: 'var(--bg)', color: 'var(--text)',
    padding: 'clamp(12px, 4vw, 32px)', display: 'flex', justifyContent: 'center',
    fontFamily: 'inherit',
  },
  card: {
    width: '100%', maxWidth: 560, background: 'var(--surface)',
    borderRadius: 16, boxShadow: 'var(--shadow-md)', border: '1px solid var(--border)',
    padding: 'clamp(16px, 4vw, 24px)', height: 'fit-content',
  },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 18 },
  h1:  { fontSize: 'clamp(18px, 5vw, 22px)', fontWeight: 700, margin: 0, letterSpacing: '-0.01em' },
  sub: { fontSize: 13, color: 'var(--text-2)', margin: '4px 0 0' },
  openApp: {
    display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
    fontSize: 13, fontWeight: 600, textDecoration: 'none',
    color: 'var(--blue-text)', background: 'var(--blue-bg)',
    padding: '7px 12px', borderRadius: 9,
  },
  muted: { display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--text-3)' },
  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '28px 0' },
  emptyText: { fontSize: 14, color: 'var(--text-2)', margin: 0 },
  section: { marginTop: 18 },
  h2: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', margin: '0 0 8px' },
  rows: { display: 'flex', flexDirection: 'column', gap: 6 },
  row: {
    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12,
    background: 'var(--surface2)', borderLeft: '3px solid', borderRadius: 8,
    padding: '9px 12px',
  },
  rowTitle: { fontSize: 14, fontWeight: 500, minWidth: 0, overflowWrap: 'anywhere' },
  rowMeta:  { fontSize: 12, color: 'var(--text-2)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' },
  more: { fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0 3px' },
}
