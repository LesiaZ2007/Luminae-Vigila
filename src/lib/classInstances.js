/**
 * One-off changes to a recurring class.
 *
 * A class schedule entry describes the normal week — MWF at 9:00 until the end of
 * term. Reality has holidays, a professor who cancels, and the occasional extra
 * review session. Editing the schedule itself is the wrong tool for those: it would
 * rewrite every meeting to fix one, and there is nowhere to say "not this Tuesday".
 *
 * So exceptions live alongside the pattern rather than inside it:
 *
 *   exceptions: {
 *     cancelled: ['2026-08-25'],                                  // no meeting that day
 *     added:     [{ date, startTime, endTime, location, note }],  // an extra meeting
 *   }
 *
 * Stored on the class entry itself, which is JSONB — no migration. Keeping the
 * pattern intact also means a cancelled date stays meaningful if the time later
 * changes, and that "restore" is always available: nothing is destroyed.
 *
 * Dates are local `YYYY-MM-DD` throughout, never `Date` objects. A class meeting is a
 * thing that happens on a calendar day, and anchoring to an instant would move that
 * day across a timezone boundary.
 */

import { toYMDLocal } from '@/lib/calendarView'

/** A well-formed local calendar date, without pulling in a regex escape. */
export function isDateStr(value) {
  if (typeof value !== 'string' || value.length !== 10) return false
  if (value[4] !== '-' || value[7] !== '-') return false
  const [y, m, d] = value.split('-')
  const nums = [y, m, d].map(Number)
  if (nums.some(n => !Number.isInteger(n))) return false
  const [yy, mm, dd] = nums
  return yy > 1900 && mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31
}

/** Normalise whatever shape a class arrived in into the two lists. */
export function getExceptions(cls) {
  const ex = cls?.exceptions ?? {}
  return {
    cancelled: Array.isArray(ex.cancelled) ? ex.cancelled.filter(isDateStr) : [],
    added:     Array.isArray(ex.added)     ? ex.added.filter(a => isDateStr(a?.date)) : [],
  }
}

/** Every write goes through here so `updatedAt` is never forgotten — see the sync merge. */
function withExceptions(cls, exceptions) {
  return { ...cls, exceptions, updatedAt: new Date().toISOString() }
}

/** Is the regular meeting on this date called off? */
export function isCancelled(cls, dateStr) {
  return getExceptions(cls).cancelled.includes(dateStr)
}

/** Call off the meeting on `dateStr`. Idempotent. */
export function cancelInstance(cls, dateStr) {
  if (!isDateStr(dateStr)) return cls
  const { cancelled, added } = getExceptions(cls)
  if (cancelled.includes(dateStr)) return cls
  return withExceptions(cls, { cancelled: [...cancelled, dateStr].sort(), added })
}

/** Put a cancelled meeting back. Idempotent. */
export function restoreInstance(cls, dateStr) {
  const { cancelled, added } = getExceptions(cls)
  if (!cancelled.includes(dateStr)) return cls
  return withExceptions(cls, { cancelled: cancelled.filter(d => d !== dateStr), added })
}

/**
 * Add a one-off meeting.
 *
 * Replaces any existing extra on the same date rather than stacking a second one —
 * adding twice is far more likely to be a correction than a genuine double session.
 */
export function addInstance(cls, { date, startTime, endTime, location, note } = {}) {
  if (!isDateStr(date) || !startTime || !endTime) return cls
  if (startTime >= endTime) return cls
  const { cancelled, added } = getExceptions(cls)
  const entry = { date, startTime, endTime, ...(location ? { location } : {}), ...(note ? { note } : {}) }
  return withExceptions(cls, {
    cancelled,
    added: [...added.filter(a => a.date !== date), entry].sort((a, b) => a.date.localeCompare(b.date)),
  })
}

/** Drop a one-off meeting. */
export function removeInstance(cls, dateStr) {
  const { cancelled, added } = getExceptions(cls)
  if (!added.some(a => a.date === dateStr)) return cls
  return withExceptions(cls, { cancelled, added: added.filter(a => a.date !== dateStr) })
}

/** The local calendar day an expanded event falls on. */
export function eventDate(ev) {
  if (typeof ev?.start === 'string') return ev.start.slice(0, 10)
  return ev?.start ? toYMDLocal(ev.start) : null
}

/**
 * Apply a class's exceptions to its expanded meetings.
 *
 * Cancelled dates are dropped; extras are appended as events of the same shape, marked
 * so the UI can label them and offer "remove" rather than "cancel". Extras are allowed
 * on a date the pattern already covers — a second session that week is a real thing —
 * and on a cancelled date, which is how "moved to a different time" is expressed.
 */
export function applyExceptions(cls, expanded, makeExtraEvent) {
  const { cancelled, added } = getExceptions(cls)
  const kept = expanded.filter(ev => !cancelled.includes(eventDate(ev)))
  return [...kept, ...added.map(makeExtraEvent)]
}
