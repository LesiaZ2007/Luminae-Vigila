/**
 * Writing an .ics file.
 *
 * Lifted out of ImportExportButton, where it was a closure inside a render function
 * and therefore impossible to test — which is how it came to lose three different
 * things at once:
 *
 *   1. **Class meetings were absent.** The export was handed `events`, the *stored*
 *      local events. Class meetings are not stored: they are expanded from the class
 *      schedule every render (`canvasClassEvents`), so a term's worth of classes
 *      simply was not in the file. Exams, being a transform of a meeting, went with
 *      them.
 *   2. **Location and notes were always empty.** It read `event.location` and
 *      `event.description`; an event stores those under `extendedProps`, so every
 *      VEVENT went out without a room or a note.
 *   3. **All-day events landed on the wrong day.** `new Date('2026-03-04')` parses as
 *      UTC midnight, and formatting that as a UTC timestamp puts it on 3 March for
 *      anyone west of Greenwich. An all-day event is a *date*, and iCalendar has a
 *      type for exactly that.
 *
 * The common thread with the rest of this codebase: a day is a day, and turning one
 * into an instant is where the bugs live.
 */

/** Text escaping per RFC 5545 §3.3.11. Backslash first, or it escapes its own output. */
function escapeText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/** `YYYYMMDD` from a local calendar date, with no timezone conversion anywhere. */
function dateValue(dateStr) {
  return String(dateStr).slice(0, 10).replace(/-/g, '')
}

/** A UTC timestamp, for events that happen at an instant rather than on a day. */
function dateTimeValue(value) {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  const pad = n => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T` +
         `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

/** The day after a `YYYY-MM-DD`, since an all-day DTEND is exclusive. */
function nextDay(dateStr) {
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number)
  const next = new Date(y, m - 1, d + 1)
  const pad = n => String(n).padStart(2, '0')
  return `${next.getFullYear()}${pad(next.getMonth() + 1)}${pad(next.getDate())}`
}

/** True when a value is a bare calendar date rather than a timestamp. */
function isDateOnly(value) {
  return typeof value === 'string' && value.length === 10 && value[4] === '-'
}

/**
 * Fold a line to 75 octets, as the spec requires.
 *
 * Long lines are not a theoretical problem here: a class meeting's summary carries the
 * course name and section, and some calendar clients reject an over-long line outright
 * rather than tolerating it.
 */
function fold(line) {
  if (line.length <= 75) return [line]
  const out = [line.slice(0, 75)]
  let rest = line.slice(75)
  while (rest.length > 74) {
    out.push(` ${rest.slice(0, 74)}`)
    rest = rest.slice(74)
  }
  if (rest) out.push(` ${rest}`)
  return out
}

/** Location and notes live under extendedProps; older//flat shapes still work. */
function propOf(event, key) {
  return event?.extendedProps?.[key] ?? event?.[key] ?? null
}

/**
 * One VEVENT, or null when the event has no usable start.
 *
 * An event we cannot place in time is dropped rather than emitted with a missing
 * DTSTART — an .ics with a malformed VEVENT can fail to import *entirely*, taking the
 * valid events down with it.
 */
export function serializeEvent(event) {
  if (!event?.start) return null

  const allDay = event.allDay || isDateOnly(event.start)
  const lines  = ['BEGIN:VEVENT']

  const uid = event.id ?? `lv-${Math.abs(String(event.title ?? '').length)}-${dateValue(event.start)}`
  lines.push(`UID:${escapeText(uid)}`)

  if (allDay) {
    lines.push(`DTSTART;VALUE=DATE:${dateValue(event.start)}`)
    // Exclusive, so a one-day event ends on the following day. Without this a
    // single-day event imports as zero-length and some clients hide it.
    lines.push(`DTEND;VALUE=DATE:${event.end && isDateOnly(event.end) ? dateValue(event.end) : nextDay(event.start)}`)
  } else {
    const start = dateTimeValue(event.start)
    if (!start) return null
    lines.push(`DTSTART:${start}`)
    const end = event.end ? dateTimeValue(event.end) : null
    if (end) lines.push(`DTEND:${end}`)
  }

  if (event.title) lines.push(`SUMMARY:${escapeText(event.title)}`)

  const notes = propOf(event, 'notes') ?? event.description
  if (notes) lines.push(`DESCRIPTION:${escapeText(notes)}`)

  const location = propOf(event, 'location')
  if (location) lines.push(`LOCATION:${escapeText(location)}`)

  lines.push('END:VEVENT')
  return lines
}

/**
 * A complete calendar.
 *
 * Callers pass everything that should appear — stored events *and* the expanded class
 * meetings. Expanding here would mean this module knowing about class schedules and
 * recurrence; the app has already done that work for the calendar view, so it hands
 * the result over instead.
 */
export function serializeIcs(events = []) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//luminae-vigila//EN',
    'CALSCALE:GREGORIAN',
  ]
  for (const event of events) {
    const vevent = serializeEvent(event)
    if (vevent) lines.push(...vevent)
  }
  lines.push('END:VCALENDAR')

  return lines.flatMap(fold).join('\r\n')
}
