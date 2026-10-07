'use client'

/**
 * The ticking parts of the sidebar's live-info card: the clock, and the "next up"
 * countdown beneath it.
 *
 * Each owns its own one-second timer (lib/useNow), so a tick re-renders this card
 * and nothing else. The clock used to live in the planner shell's state, which made
 * the whole page — every panel and every derived event list — re-render once a
 * second for as long as the app was open.
 */
import { useMemo } from 'react'
import { useNow } from '@/lib/useNow'
import { toDateStr, addDaysStr } from '@/lib/localDate'

const TIME_24H = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }
const TIME_12H = { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }
const DAY_LINE = { weekday: 'long', month: 'short', day: 'numeric' }

export default function LiveClock({ militaryTime, onToggle, fontSize = '1.05rem' }) {
  const now = useNow(1000)
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <div style={{ fontVariantNumeric: 'tabular-nums', fontSize, fontWeight: 800, color: '#fff', letterSpacing: '0.01em', lineHeight: 1.2 }}>
          {now.toLocaleTimeString('en-US', militaryTime ? TIME_24H : TIME_12H)}
        </div>
        <button type="button" onClick={onToggle}
                title={militaryTime ? 'Switch to 12h' : 'Switch to 24h'}
                style={{ fontSize: '0.56rem', fontWeight: 700, color: 'rgba(147,197,253,.45)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: 1 }}>
          {militaryTime ? '12h' : '24h'}
        </button>
      </div>
      <div style={{ fontSize: '0.66rem', color: 'rgba(147,197,253,.55)', marginTop: 3, fontWeight: 500 }}>
        {now.toLocaleDateString('en-US', DAY_LINE)}
      </div>
    </>
  )
}

/** "2h 5m", "4m 12s", "30s" — or null once the moment has passed. */
export function timeUntil(start, now) {
  const diff = new Date(start) - now
  if (diff <= 0) return null
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const s = Math.floor((diff % 60000) / 1000)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

/**
 * The soonest timed event still to come today, else the first one tomorrow.
 *
 * `events` should already include class meetings. Class periods are the most
 * predictable thing on a student's day, which is exactly why leaving them out made
 * the card feel wrong: it would announce a 4pm club meeting while saying nothing
 * about the 9am lecture.
 */
export function NextUpCard({ events }) {
  const now   = useNow(1000)
  // Local, not UTC: event starts are naive local strings, so comparing them
  // against a UTC date meant the card jumped to tomorrow every evening.
  const today = toDateStr(now)

  // The sorting only has to happen when the events or the date change. A tick just
  // walks the sorted list for the first start that is still ahead.
  const { todayTimed, firstTomorrow } = useMemo(() => {
    const tomorrow = addDaysStr(1, new Date(`${today}T12:00:00`))
    const timedOn = day => events
      .filter(e => !e.allDay && e.start?.startsWith(day))
      .map(e => ({ event: e, at: new Date(e.start).getTime() }))
      .sort((a, b) => a.at - b.at)
    return { todayTimed: timedOn(today), firstTomorrow: timedOn(tomorrow)[0]?.event ?? null }
  }, [events, today])

  const nextToday = todayTimed.find(x => x.at > now.getTime())?.event
  const next      = nextToday ?? firstTomorrow
  if (!next) return null

  const until = nextToday ? timeUntil(next.start, now) : null
  const label = nextToday ? (until ? `In ${until}` : null) : 'Tomorrow'
  if (!label) return null

  // Where to be matters more than what it is called for a class period, so the
  // room rides along when the item carries one.
  const where = next.location || next.extendedProps?.location || ''

  return (
    <div style={{ marginTop: 10, padding: '7px 9px', borderRadius: 9, background: 'rgba(96,165,250,.14)', borderLeft: '2.5px solid rgba(96,165,250,.5)' }}>
      <div style={{ fontSize: '0.6rem', color: 'rgba(147,197,253,.6)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        {label}
      </div>
      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#fff', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {next.title}
      </div>
      {where && (
        <div style={{ fontSize: '0.62rem', color: 'rgba(147,197,253,.6)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {where}
        </div>
      )}
    </div>
  )
}
