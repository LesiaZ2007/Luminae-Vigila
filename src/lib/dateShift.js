/**
 * Whole-day date arithmetic for keeping linked events in step.
 *
 * Used when an exam moves and its auto-generated study sessions have to follow.
 *
 * Everything here works in *local* time on purpose. Study sessions are placed at
 * a particular hour of the local day (findBestSlot picks gaps around your
 * classes), and the app is used across DST boundaries. Doing this with raw
 * millisecond offsets would slide a 4pm session to 3pm or 5pm the moment the
 * clocks changed, so days are added to the calendar date and the wall-clock time
 * is written back unchanged.
 */

/**
 * Parse an ISO-ish datetime string as local time.
 *
 * A bare 'YYYY-MM-DD' is specified to parse as UTC midnight, which in any
 * negative-offset zone lands on the *previous* local day — so an all-day event
 * would shift a day every time it was touched. Adding an explicit time forces
 * local interpretation.
 */
function parseLocal(iso) {
  if (!iso) return null
  const str = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso
  const d = new Date(str)
  return Number.isNaN(d.getTime()) ? null : d
}

const pad = n => String(n).padStart(2, '0')

/**
 * Whole calendar days from `fromIso` to `toIso` (negative = moved earlier).
 *
 * Compares dates at midnight rather than subtracting timestamps, so a shift
 * from 9am Monday to 11pm Tuesday is 1 day, not 1.58 rounded to 2.
 */
export function daysBetween(fromIso, toIso) {
  const a = parseLocal(fromIso)
  const b = parseLocal(toIso)
  if (!a || !b) return 0
  const aMid = new Date(a.getFullYear(), a.getMonth(), a.getDate())
  const bMid = new Date(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((bMid - aMid) / 86_400_000)
}

/**
 * Move an ISO local datetime by whole days, preserving the time of day.
 *
 * Returns the input unchanged when it's missing or unparseable — an event with
 * no end time should stay that way rather than gain a bogus one.
 */
export function shiftIsoDays(iso, days) {
  const d = parseLocal(iso)
  if (!d || !days) return iso

  // Date handles month/year rollover and DST; reading the fields back out
  // afterwards is what preserves the wall-clock time.
  const moved = new Date(d.getFullYear(), d.getMonth(), d.getDate() + days,
                         d.getHours(), d.getMinutes(), d.getSeconds())

  const datePart = `${moved.getFullYear()}-${pad(moved.getMonth() + 1)}-${pad(moved.getDate())}`
  // Preserve a date-only input (all-day events) rather than inventing a time.
  if (!String(iso).includes('T')) return datePart
  return `${datePart}T${pad(moved.getHours())}:${pad(moved.getMinutes())}:${pad(moved.getSeconds())}`
}
