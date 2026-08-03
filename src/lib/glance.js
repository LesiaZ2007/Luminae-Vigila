/**
 * glance.js — "what does today look like" summary.
 *
 * Shared deliberately between the /today glance view and the daily push
 * notification so the two can never disagree. The push is the widget you get on
 * a locked phone; the page is the one you get on a tablet. If they were computed
 * separately they would drift, and a notification that contradicts the app is
 * worse than no notification.
 *
 * Pure: takes already-loaded arrays and a date string, returns plain data. It
 * never reads the clock itself, so the caller decides what "today" means (and
 * the server, which runs in UTC, can pass a local date).
 */
import { dateStrOf, todayStr } from './localDate'

/** Sortable HH:MM for a timestamp, or '' for all-day / undated items. */
function timeOf(iso) {
  if (!iso || /^\d{4}-\d{2}-\d{2}$/.test(iso)) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 12-hour label for display: '14:05' → '2:05 PM'. */
export function displayTime(hhmm) {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  const period = h < 12 ? 'AM' : 'PM'
  const hour   = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${String(m).padStart(2, '0')} ${period}`
}

/**
 * @param {object}  input
 * @param {array}   input.todos        - { id, title, dueDate, completed, priority }
 * @param {array}   input.events       - { id, title, start, end, allDay }
 * @param {array}   input.assignments  - Canvas: { id, name, dueAt, done, hidden }
 * @param {string}  input.dateStr      - the day to summarise, local YYYY-MM-DD
 */
export function buildGlance({ todos = [], events = [], assignments = [], dateStr = todayStr() } = {}) {
  const liveTodos = (todos ?? []).filter(t => t && !t.completed && !t.deletedAt)

  const dueToday = liveTodos
    .filter(t => dateStrOf(t.dueDate) === dateStr)
    .map(t => ({ id: t.id, title: t.title ?? 'Untitled task', kind: 'task', priority: t.priority ?? null }))

  // Overdue is unbounded in principle, so it is sorted oldest-first: if it gets
  // truncated for display, the most urgent items are the ones that survive.
  const overdue = liveTodos
    .filter(t => { const d = dateStrOf(t.dueDate); return d && d < dateStr })
    .map(t => ({ id: t.id, title: t.title ?? 'Untitled task', kind: 'task', due: dateStrOf(t.dueDate) }))
    .sort((a, b) => a.due.localeCompare(b.due))

  const canvasToday = (assignments ?? [])
    .filter(a => a && !a.done && !a.hidden && dateStrOf(a.dueAt) === dateStr)
    .map(a => ({ id: a.id, title: a.name ?? a.title ?? 'Assignment', kind: 'assignment', time: timeOf(a.dueAt) }))

  const eventsToday = (events ?? [])
    .filter(e => e && !e.deletedAt && dateStrOf(e.start) === dateStr)
    .map(e => ({
      id: e.id,
      title: e.title ?? 'Untitled event',
      kind: 'event',
      allDay: Boolean(e.allDay),
      time: e.allDay ? '' : timeOf(e.start),
      endTime: e.allDay ? '' : timeOf(e.end),
    }))
    // All-day first, then chronological. Sorting on the HH:MM string works
    // because it is zero-padded.
    .sort((a, b) => (a.allDay === b.allDay ? a.time.localeCompare(b.time) : a.allDay ? -1 : 1))

  return {
    dateStr,
    overdue,
    dueToday,
    assignments: canvasToday,
    events: eventsToday,
    counts: {
      overdue:     overdue.length,
      dueToday:    dueToday.length + canvasToday.length,
      events:      eventsToday.length,
    },
    isEmpty: overdue.length === 0 && dueToday.length === 0 && canvasToday.length === 0 && eventsToday.length === 0,
  }
}

/** One-line summary — the notification body, and the /today subheading. */
export function glanceSummaryLine(glance) {
  if (!glance || glance.isEmpty) return 'Nothing scheduled — enjoy it.'
  const parts = []
  if (glance.counts.overdue)  parts.push(`${glance.counts.overdue} overdue`)
  if (glance.counts.dueToday) parts.push(`${glance.counts.dueToday} due today`)
  if (glance.counts.events)   parts.push(`${glance.counts.events} event${glance.counts.events !== 1 ? 's' : ''}`)
  return parts.join(' · ')
}

/**
 * Longer body for the daily push: the summary line plus the first event, since
 * "when do I have to be somewhere" is the thing worth reading from a lock screen.
 */
export function glanceNotificationBody(glance) {
  const line  = glanceSummaryLine(glance)
  const first = glance?.events?.find(e => !e.allDay)
  if (!first) return line
  return `${line} — first up: ${first.title} at ${displayTime(first.time)}`
}
