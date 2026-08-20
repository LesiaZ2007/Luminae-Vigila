/**
 * Remembering where you were on the calendar.
 *
 * The calendar is unmounted when you switch tabs (`activeNav === 'calendar' && …`),
 * so every view and date it was showing is thrown away — leaving the Notes tab and
 * coming back dropped you on today in the default view, even if you had spent the last
 * minute lining up next week. These preferences survive that, and a page reload.
 */

const KEY = 'lv-cal-view'

/** Views the toolbar can actually produce. Anything else is treated as absent. */
const VIEWS = new Set(['timeGridDay', 'timeGridWeek', 'dayGridMonth'])

/**
 * How long a remembered *date* stays worth restoring.
 *
 * The view is a preference and never goes stale — if you work in month view, you want
 * month view tomorrow too. The date is different: it is where you happened to be
 * looking. Restoring it after a tab switch is the whole point; restoring it when you
 * open the app the next morning would mean landing on a stale week for no reason.
 * Six hours covers an evening's planning session without surviving a night's sleep.
 */
export const DATE_TTL_MS = 6 * 60 * 60 * 1000

/** The focused range — a school day, rather than all 24 hours. */
export const FOCUSED_RANGE = { min: '07:00:00', max: '22:00:00' }
export const FULL_RANGE    = { min: '00:00:00', max: '24:00:00' }

export function slotRange(focused) {
  return focused ? FOCUSED_RANGE : FULL_RANGE
}

function readStorage(storage) {
  try {
    const raw = storage?.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    // Malformed JSON, or storage blocked entirely (private mode, embedded webview).
    return null
  }
}

/**
 * Load the remembered view, date and focus.
 *
 * Every field is independently optional — a stored blob from an older version, or one
 * whose date has expired, still contributes whatever it does have. Returns nulls
 * rather than defaults so the caller can decide what "no preference" means; on mobile
 * that is day view, on desktop week view, and only the caller knows which it is.
 */
export function loadCalendarPrefs(storage = globalThis.localStorage, now = Date.now()) {
  const saved = readStorage(storage)
  if (!saved) return { view: null, date: null, focused: null }

  const view = VIEWS.has(saved.view) ? saved.view : null

  const savedAt  = Number(saved.savedAt)
  const fresh    = Number.isFinite(savedAt) && now - savedAt < DATE_TTL_MS
  const dateOk   = typeof saved.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(saved.date)
  const date     = fresh && dateOk ? saved.date : null

  const focused = typeof saved.focused === 'boolean' ? saved.focused : null

  return { view, date, focused }
}

/**
 * Persist the calendar's position. Silently does nothing when storage is unavailable —
 * losing a view preference is not worth an exception on a hot path (`datesSet` fires
 * on every navigation).
 */
export function saveCalendarPrefs({ view, date, focused }, storage = globalThis.localStorage, now = Date.now()) {
  try {
    storage?.setItem(KEY, JSON.stringify({ view, date, focused, savedAt: now }))
  } catch {
    /* full, blocked, or absent — not worth surfacing */
  }
}

/** Local YYYY-MM-DD. `toISOString()` would shift the day for anyone west of UTC. */
export function toYMDLocal(date) {
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
