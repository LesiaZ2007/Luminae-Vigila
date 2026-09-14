/**
 * todoBuckets.js — which heading a task falls under in the grouped task list.
 *
 * The list used to jump straight from "Today" to "This Week", and a week is a long
 * time: in a normal school week that one heading collected most of the list, so the
 * thing due tomorrow sat in the same undifferentiated pile as the thing due Friday.
 * "Upcoming" splits the near half out, which is the part you can actually act on now.
 *
 * ## Why the boundaries are computed from a date string
 *
 * Due dates are stored as bare `YYYY-MM-DD` — wall-clock dates with no zone — so the
 * boundaries have to be built the same way. The previous inline version used
 * `new Date(); d.setDate(d.getDate() + 7); d.toISOString().slice(0, 10)`, and
 * `toISOString` converts to UTC first: west of Greenwich, every boundary rolled over
 * to the next day in the evening and tasks quietly jumped a heading at dinner time.
 * See localDate.js, which exists for exactly this.
 *
 * Taking today as a parameter rather than reading the clock also keeps the list
 * consistent with the `todayStr` the panel was handed, and makes this testable
 * without freezing time.
 */

import { toDateStr } from '@/lib/localDate'

/**
 * How far "Upcoming" reaches. Three days is roughly the horizon you can still do
 * something about — far enough to plan tonight's work around, near enough that
 * everything in it is genuinely soon.
 */
export const UPCOMING_DAYS = 3

/** Shifts a `YYYY-MM-DD` string by whole days, staying in local wall-clock time. */
function shiftDays(dateStr, days) {
  const [y, m, d] = String(dateStr).split('-').map(Number)
  if (!y || !m || !d) return ''
  // Month is 0-based, and an out-of-range day rolls the month over for us.
  return toDateStr(new Date(y, m - 1, d + days))
}

/**
 * The upper bound of each dated bucket, as `YYYY-MM-DD` strings.
 *
 * Each is inclusive: a task lands in the first bucket whose bound it does not exceed.
 */
export function todoBucketBounds(todayStr) {
  return {
    today:    todayStr,
    upcoming: shiftDays(todayStr, UPCOMING_DAYS),
    week:     shiftDays(todayStr, 7),
    later:    shiftDays(todayStr, 14),
  }
}

/**
 * The bucket id for one due date.
 *
 * @param {string|null|undefined} dateStr  A `YYYY-MM-DD` due date, or nothing.
 * @param {object} bounds                  From {@link todoBucketBounds}.
 * @returns {'overdue'|'today'|'upcoming'|'week'|'later'|'future'|'none'}
 */
export function bucketForDate(dateStr, bounds) {
  if (!dateStr) return 'none'
  if (dateStr <  bounds.today)    return 'overdue'
  if (dateStr === bounds.today)   return 'today'
  if (dateStr <= bounds.upcoming) return 'upcoming'
  if (dateStr <= bounds.week)     return 'week'
  if (dateStr <= bounds.later)    return 'later'
  return 'future'
}
