/**
 * localDate.js — "what day is it *here*" helpers.
 *
 * The app stores due dates as bare `YYYY-MM-DD` strings, which are wall-clock
 * dates with no zone. Comparing them against `new Date().toISOString()` is
 * therefore wrong: `toISOString` converts to UTC first, so anywhere west of
 * Greenwich the string rolls over to tomorrow in the evening. In New York that
 * means from 8pm (EDT) onward the app thinks "today" is the next day — the
 * badge, the glance view, and the up-next card all quietly shift a day early.
 *
 * These helpers stay in local time so a date string always means the date the
 * user would name if you asked them.
 */

const pad = n => String(n).padStart(2, '0')

/** Formats a Date as a local `YYYY-MM-DD` string. */
export function toDateStr(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Today's date, in the viewer's own timezone. */
export function todayStr(now = new Date()) {
  return toDateStr(now)
}

/** `days` from now as a local date string; negative values go backwards. */
export function addDaysStr(days, now = new Date()) {
  const d = new Date(now)
  d.setDate(d.getDate() + days)
  return toDateStr(d)
}

/**
 * Local date portion of a stored timestamp.
 *
 * Bare `YYYY-MM-DD` values are returned untouched — `new Date('2026-08-03')`
 * parses as UTC midnight, which would shift the date backwards for anyone in a
 * negative offset. Only full timestamps get converted.
 */
export function dateStrOf(iso) {
  if (!iso) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  return toDateStr(new Date(iso))
}

/** True when a stored due date is before today (and so overdue). */
export function isOverdue(dueDate, now = new Date()) {
  const d = dateStrOf(dueDate)
  return Boolean(d) && d < todayStr(now)
}
