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

import { expandRecurringTodo } from './recurrence'
import { visible } from './tombstones'

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
 * Everything dated that belongs in an exported calendar, as event-shaped rows.
 *
 * The export was `[...events, ...classMeetings]`, so a file called "your calendar"
 * held no **tasks** — the thing a student planner is mostly *for*. Nor the due dates
 * on checklist items. All of it sits on the app's own calendar, so the omission was
 * invisible until you opened the file somewhere else.
 *
 * Tasks become **all-day entries prefixed `☑`**, which is not a new invention: it is
 * exactly how `lib/googleMirror.js` already represents a task on a Google calendar,
 * and matching it means a task looks the same wherever this app puts one. The
 * alternative, `VTODO`, is the technically correct iCalendar type and the wrong
 * choice here — Google Calendar ignores VTODO entirely and Apple diverts it into
 * Reminders, so the export would be silently empty of tasks in the two places it is
 * most likely to be opened.
 *
 * What is deliberately *not* here:
 *
 * - **Notes.** A note has no date and no duration; it is a document. There is nothing
 *   for a VEVENT to say about one. The JSON backup carries them in full.
 * - **Canvas assignments.** They are Canvas's records, not ours, and Canvas publishes
 *   its own ICS feed — exporting them here would duplicate every assignment for
 *   anyone subscribed to both.
 */
export function collectIcsRows({
  events = [], classMeetings = [], todos = [], customLists = [],
} = {}) {
  const rows = []

  // A tombstone records a deletion. No calendar wants to import one.
  for (const ev of events) if (ev && !ev.deletedAt) rows.push(ev)
  for (const m of classMeetings) if (m) rows.push(m)

  for (const td of todos) {
    // A task with no due date has nowhere to sit on a calendar, and a finished one is
    // noise — the same two rules the Google mirror applies.
    if (!td || td.deletedAt || td.completed || !td.dueDate || !td.title) continue

    /* Occurrences rather than an RRULE. The app already expands recurring tasks for
       its own calendar, bounded and skipping dates already ticked off, so reusing it
       keeps the file agreeing with the app — and avoids translating this app's
       recurrence into iCalendar's, which is where a subtly wrong RRULE would live.
       The horizon is the expander's own (8 weeks, 60 occurrences); the full rule
       survives in the JSON backup, which is the thing that round-trips. */
    for (const inst of expandRecurringTodo(td)) {
      if (!inst?.dueDate) continue
      rows.push({
        id:     `lv-todo-${inst.id ?? td.id}`,
        title:  `☑ ${td.title}`,
        start:  inst.dueDate,
        allDay: true,
        extendedProps: { notes: td.notes || null },
      })
    }
  }

  /* Checklist due dates, by the same rules the calendar's own markers use: a list
     shows its due date only while it is unfinished, and an item only while unchecked. */
  for (const list of customLists) {
    if (!list || list.deletedAt) continue
    const items = visible(list.items ?? [])
    const isComplete = items.length > 0 && items.every(i => i.checked)

    if (list.dueDate && !isComplete && list.name) {
      rows.push({
        id: `lv-list-${list.id}`, title: `☑ ${list.name}`, start: list.dueDate, allDay: true,
      })
    }

    for (const item of items) {
      if (item.checked || !item.dueDate || !item.text) continue
      rows.push({
        id: `lv-listitem-${list.id}-${item.id}`, title: `☑ ${item.text}`,
        start: item.dueDate, allDay: true,
      })
    }
  }

  return rows
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
