/**
 * Event spans — which days an event actually covers.
 *
 * The app could always *store* a multi-day event: the editor has an "All day /
 * multi-day" toggle with a start and end date, and FullCalendar draws the bar across
 * the week correctly. Everything else in the app only ever looked at `start`.
 *
 * So a conference running Monday to Wednesday appeared on Monday, was missing from
 * Tuesday and Wednesday, and — because the agenda and the glance both skip anything
 * whose `start` is before today — vanished completely the moment it began. The one
 * kind of event you most want a planner to keep telling you about was the one it
 * forgot first.
 *
 * ## The end-date convention
 *
 * All-day events store an **exclusive** end, which is FullCalendar's convention and
 * what the editor writes: a single-day event on the 4th is `start: '2026-03-04'`,
 * `end: '2026-03-05'`. That is why `endDate` is shown +1 day back in the form, and
 * why the last covered day here is the day *before* `end`.
 *
 * Timed events are the opposite: an event from 10pm Monday to 2am Tuesday genuinely
 * happens on both days, so a timed end is **inclusive** of the day it lands on.
 * Getting these two backwards is the whole difficulty, so they are separate branches
 * rather than one clever expression.
 */
import { toYMDLocal } from './calendarView'

/** A local `YYYY-MM-DD` from either a plain date or a timestamp. */
function dayOf(value) {
  if (!value) return null
  const s = String(value)
  // A plain date, or the date half of a zoneless timestamp. Sliced rather than
  // parsed: `new Date('2026-03-04')` is UTC midnight, which is the previous day
  // for anyone west of Greenwich.
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : toYMDLocal(d)
}

/** The day after a local `YYYY-MM-DD`. */
function nextDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return toYMDLocal(new Date(y, m - 1, d + 1))
}

/* A corrupt or hostile end date must not spin the loop below for a decade. A year is
   far more than any real event and still cheap to walk. */
const MAX_SPAN_DAYS = 366

/**
 * The last day an event covers, or null if it has no usable start.
 *
 * An event with no end covers one day — its start. So does one whose end is before
 * its start, which is corrupt data rather than a reason to return nothing.
 */
export function lastDayOf(ev) {
  const first = dayOf(ev?.start)
  if (!first) return null

  const rawEnd = dayOf(ev?.end)
  if (!rawEnd) return first

  // All-day ends are exclusive: step back a day to get the last covered one. An
  // all-day event whose end equals its start is a single day, not a negative span.
  const last = ev?.allDay ? (rawEnd > first ? previousDay(rawEnd) : first) : rawEnd
  return last < first ? first : last
}

function previousDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return toYMDLocal(new Date(y, m - 1, d - 1))
}

/** Every local day this event covers, in order. `[]` if it has no usable start. */
export function eventDays(ev) {
  const first = dayOf(ev?.start)
  if (!first) return []

  const last = lastDayOf(ev)
  const days = []
  let cur = first
  while (cur <= last && days.length < MAX_SPAN_DAYS) {
    days.push(cur)
    cur = nextDay(cur)
  }
  return days
}

/** Does this event cover `dateStr`? The cheap check, for filtering by one day. */
export function coversDay(ev, dateStr) {
  const first = dayOf(ev?.start)
  if (!first || !dateStr) return false
  return first <= dateStr && dateStr <= lastDayOf(ev)
}

/** Is this event longer than a single day? */
export function isMultiDay(ev) {
  const first = dayOf(ev?.start)
  return !!first && lastDayOf(ev) > first
}

/**
 * Where `dateStr` falls in a multi-day event — `{ day, total }`, or null.
 *
 * Null for a single-day event rather than `{ day: 1, total: 1 }`: every ordinary
 * event would otherwise be labelled "day 1 of 1", which is noise on every row to
 * serve the few that span.
 */
export function spanPosition(ev, dateStr) {
  if (!isMultiDay(ev)) return null
  const days = eventDays(ev)
  const idx  = days.indexOf(dateStr)
  if (idx === -1) return null
  return { day: idx + 1, total: days.length }
}

/** "Day 2 of 3", or null when there is nothing worth saying. */
export function spanLabel(ev, dateStr) {
  const pos = spanPosition(ev, dateStr)
  return pos ? `Day ${pos.day} of ${pos.total}` : null
}

/**
 * Clamp an event's days to a window, both ends inclusive.
 *
 * This is what lets an in-progress event appear on today: the agenda asks for the
 * days it covers *from today onwards*, rather than asking whether it starts today.
 */
export function eventDaysWithin(ev, fromDateStr, toDateStr) {
  return eventDays(ev).filter(d =>
    (!fromDateStr || d >= fromDateStr) && (!toDateStr || d <= toDateStr))
}
