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
 *     exams:     [{ date, title, startTime, endTime, location, note }],  // that day is an exam
 *   }
 *
 * An exam is a *transform* of the meeting on that date rather than an event of its
 * own. A midterm happens in the class period — same room, usually the same hour — so
 * describing it as a separate event would mean cancelling the period and recreating
 * most of it by hand, and the two could then drift apart.
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

/**
 * What an exam block is painted.
 *
 * Deliberately the same red as the "Exam / Quiz" event category, so an exam looks like
 * an exam whether it came from the class schedule or was added by hand. It overrides
 * the course colour, because a midterm needs to stand out from the fifteen ordinary
 * meetings around it — that is the whole point of marking it.
 */
export const EXAM_COLOR = '#ef4444'

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
    exams:     Array.isArray(ex.exams)     ? ex.exams.filter(e => isDateStr(e?.date)) : [],
  }
}

/**
 * Every write goes through here so `updatedAt` is never forgotten — see the sync merge.
 *
 * The patch is merged over the normalised set rather than replacing it, so a function
 * that only touches one list cannot drop the other two on the way past.
 */
function withExceptions(cls, patch) {
  return { ...cls, exceptions: { ...getExceptions(cls), ...patch }, updatedAt: new Date().toISOString() }
}

/** Is the regular meeting on this date called off? */
export function isCancelled(cls, dateStr) {
  return getExceptions(cls).cancelled.includes(dateStr)
}

/** Call off the meeting on `dateStr`. Idempotent. */
export function cancelInstance(cls, dateStr) {
  if (!isDateStr(dateStr)) return cls
  const { cancelled } = getExceptions(cls)
  if (cancelled.includes(dateStr)) return cls
  return withExceptions(cls, { cancelled: [...cancelled, dateStr].sort() })
}

/** Put a cancelled meeting back. Idempotent. */
export function restoreInstance(cls, dateStr) {
  const { cancelled } = getExceptions(cls)
  if (!cancelled.includes(dateStr)) return cls
  return withExceptions(cls, { cancelled: cancelled.filter(d => d !== dateStr) })
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
  const { added } = getExceptions(cls)
  const entry = { date, startTime, endTime, ...(location ? { location } : {}), ...(note ? { note } : {}) }
  return withExceptions(cls, {
    added: [...added.filter(a => a.date !== date), entry].sort((a, b) => a.date.localeCompare(b.date)),
  })
}

/** Drop a one-off meeting. */
export function removeInstance(cls, dateStr) {
  const { added } = getExceptions(cls)
  if (!added.some(a => a.date === dateStr)) return cls
  return withExceptions(cls, { added: added.filter(a => a.date !== dateStr) })
}

/** The exam sitting in this class's period on `dateStr`, or null. */
export function examFor(cls, dateStr) {
  return getExceptions(cls).exams.find(e => e.date === dateStr) ?? null
}

/**
 * Turn the meeting on `date` into an exam block.
 *
 * Every field but the date is optional, and an omitted one means "same as the normal
 * period" — the common case is a midterm in the usual room at the usual hour, and
 * making the caller restate the time would mean the exam stops following the class if
 * the schedule later moves.
 *
 * Marking a cancelled date as an exam un-cancels it: an exam is a meeting, and leaving
 * the date cancelled would file the exam and then show nothing on the calendar.
 * Replaces any existing exam on the same date rather than stacking a second one.
 */
export function setExamInstance(cls, { date, title, startTime, endTime, location, note } = {}) {
  if (!isDateStr(date)) return cls
  if (startTime && endTime && startTime >= endTime) return cls
  const { cancelled, exams } = getExceptions(cls)
  const entry = {
    date,
    ...(title     ? { title } : {}),
    ...(startTime ? { startTime } : {}),
    ...(endTime   ? { endTime } : {}),
    ...(location  ? { location } : {}),
    ...(note      ? { note } : {}),
  }
  return withExceptions(cls, {
    cancelled: cancelled.filter(d => d !== date),
    exams: [...exams.filter(e => e.date !== date), entry].sort((a, b) => a.date.localeCompare(b.date)),
  })
}

/** Turn an exam block back into an ordinary class period. Idempotent. */
export function clearExamInstance(cls, dateStr) {
  const { exams } = getExceptions(cls)
  if (!exams.some(e => e.date === dateStr)) return cls
  return withExceptions(cls, { exams: exams.filter(e => e.date !== dateStr) })
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
export function applyExceptions(cls, expanded, makeExtraEvent, toExam) {
  const { cancelled, added, exams } = getExceptions(cls)
  const kept = expanded.filter(ev => !cancelled.includes(eventDate(ev)))
  const meetings = [...kept, ...added.map(makeExtraEvent)]
  if (!toExam || exams.length === 0) return meetings

  /* Applied last, and to extras as well as regular periods: a review session that
     turns out to be the exam itself is the same edit. An exam on a date with no
     meeting left — cancelled after the fact, or the class day moved — transforms
     nothing and is simply carried, so restoring the date brings the exam back rather
     than having quietly discarded it. */
  return meetings.map(ev => {
    const exam = exams.find(e => e.date === eventDate(ev))
    return exam ? toExam(ev, exam) : ev
  })
}
