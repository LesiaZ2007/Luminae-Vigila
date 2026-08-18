/**
 * Reminder objects — one definition of the shape, shared by everything that makes one.
 *
 * Two forms, both understood by `reminderFireTime()` in the push cron:
 *
 *   { ms, label }            relative — fires `ms` before the item's own time
 *                            (an event's `start`, a task's `dueDate` at midnight)
 *   { at, label, ms: 0 }     absolute — fires at exactly `at`
 *
 * Notes only support the absolute form, having no time of their own.
 *
 * ## Why this file exists
 *
 * EventModal and AddTodoModal each built these inline from their own dropdown, which
 * was fine while a dropdown was the only way to make one. Then Corvus grew the
 * ability to create tasks and events and had no way to express a reminder at all:
 * its tool schemas had no reminder parameter, `executeAction` never passed one, and
 * `previewAsEvent` hardcoded `reminder: null`. Asking Corvus to remind you about
 * something produced an item with no reminder on it and no indication anything had
 * been dropped.
 *
 * Corvus speaks in minutes ("half an hour before"), not milliseconds, so the entry
 * point here takes minutes and produces labels matching the dropdowns exactly — a
 * reminder created by the assistant is indistinguishable from one created by hand.
 */

/** The relative presets offered for events, longest label match wins when labelling. */
export const EVENT_REMINDER_PRESETS = [
  { label: '15 min before', ms: 15 * 60_000 },
  { label: '30 min before', ms: 30 * 60_000 },
  { label: '1 hr before',   ms: 60 * 60_000 },
  { label: '2 hrs before',  ms: 2 * 60 * 60_000 },
  { label: '1 day before',  ms: 24 * 60 * 60_000 },
]

/** Task presets. Tasks are due on a date, so sub-day offsets are not offered. */
export const TASK_REMINDER_PRESETS = [
  { label: '1 day before',  ms: 24 * 60 * 60_000 },
  { label: '2 days before', ms: 2 * 24 * 60 * 60_000 },
  { label: '1 week before', ms: 7 * 24 * 60 * 60_000 },
]

/**
 * Human label for an arbitrary offset.
 *
 * Prefers an exact preset so "30 min before" reads identically however it was
 * created, and otherwise composes one — the cron accepts any `ms`, so Corvus is
 * not limited to the dropdown's five choices and "40 minutes before" should not
 * come out mislabelled as something else.
 */
export function reminderLabelForMs(ms, presets = EVENT_REMINDER_PRESETS) {
  const exact = presets.find(p => p.ms === ms)
  if (exact) return exact.label

  const mins = Math.round(ms / 60_000)
  if (mins % (24 * 60) === 0) {
    const d = mins / (24 * 60)
    if (d % 7 === 0) return `${d / 7} week${d / 7 === 1 ? '' : 's'} before`
    return `${d} day${d === 1 ? '' : 's'} before`
  }
  if (mins % 60 === 0) {
    const h = mins / 60
    return `${h} hr${h === 1 ? '' : 's'} before`
  }
  return `${mins} min before`
}

/** The `Custom: Aug 8, 8:00 AM` form both modals use, so absolute reminders match. */
export function absoluteReminderLabel(iso) {
  return `Custom: ${new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })}`
}

/**
 * Build a reminder from whatever an assistant tool call supplied.
 *
 * @param {object}  opts
 * @param {number} [opts.minutesBefore] Relative offset in minutes.
 * @param {string} [opts.at]            Absolute local time, 'YYYY-MM-DDTHH:MM[:SS]'.
 * @param {boolean}[opts.isTask]        Selects the preset list used for labelling.
 * @returns {{ms:number,label:string}|{at:string,label:string,ms:0}|null}
 */
export function buildReminder({ minutesBefore, at, isTask = false } = {}) {
  // Absolute wins: "remind me at 8am" is more specific than any offset, and a model
  // that supplies both has almost certainly restated the same intent twice.
  if (at) {
    const d = new Date(at.length === 10 ? `${at}T09:00:00` : at)
    if (Number.isNaN(d.getTime())) return null
    const iso = toLocalIso(d)
    return { at: iso, label: absoluteReminderLabel(iso), ms: 0 }
  }

  const mins = Number(minutesBefore)
  if (!Number.isFinite(mins) || mins <= 0) return null

  const ms = Math.round(mins) * 60_000
  return { ms, label: reminderLabelForMs(ms, isTask ? TASK_REMINDER_PRESETS : EVENT_REMINDER_PRESETS) }
}

/**
 * Serialise a Date as a local-time ISO string with no timezone suffix.
 *
 * Deliberately not `toISOString()`, which converts to UTC: the cron parses `at`
 * with `new Date(...)`, so a Z-suffixed value would fire at the wrong wall-clock
 * time for anyone not on UTC. This matches what the modals store.
 */
function toLocalIso(d) {
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`
}

/** One-line description for a preview card, or '' when there is no reminder. */
export function describeReminder(reminder) {
  if (!reminder) return ''
  return reminder.label || (reminder.at ? absoluteReminderLabel(reminder.at) : reminderLabelForMs(reminder.ms))
}
