/**
 * zonedTime.js — wall-clock time in a *named* zone, never the process's own.
 *
 * ## Why this exists
 *
 * The app stores times the way people say them: an event is `2026-10-08T09:00:00`
 * with no zone attached, a task is due on `2026-10-08`, an absolute reminder fires at
 * `2026-10-08T08:30:00`. On the device that wrote them that is exactly right —
 * `new Date('2026-10-08T09:00:00')` in a browser means 9am where the browser is, which
 * is what the person typing it meant.
 *
 * On the server it is wrong by the reader's whole UTC offset. Vercel runs in UTC, so the
 * same `new Date(...)` there means 9am *UTC*: a New York student's 9:00 class with a
 * 15-minute reminder was being pushed at 08:45 UTC, which is 4:45 in the morning where
 * they actually are. Every server-side reader of a floating time — the reminder cron,
 * the daily glance, the weekly digest, Corvus's view of the calendar — has to say *whose*
 * 9am it means, and this module is how it says it.
 *
 * ## What a "zone" is here
 *
 * Either an IANA name (`'America/New_York'`), which carries its own DST rules, or a
 * fixed offset `{ utcOffsetMinutes }` — minutes *ahead* of UTC, the sign ISO 8601 uses,
 * so New York in summer is `-240`. The fixed form exists for devices that subscribed
 * before the app recorded zone names and left only a `getTimezoneOffset()` behind; see
 * `resolveUserZone`. It is right for the season it was recorded in and an hour out for
 * the other one, which is still a great deal better than UTC.
 *
 * Every function that takes a zone treats a missing one (`null`/`undefined`) as "the
 * process's own", i.e. exactly what `new Date(...)` already does. Client code calls the
 * shared helpers without a zone and is unchanged by any of this.
 *
 * ## Why not a timezone library
 *
 * `Intl.DateTimeFormat` already ships the IANA database with every runtime the app runs
 * on. The one operation it lacks — "which instant is this wall-clock time in that zone"
 * — is a few lines on top of "what is that zone's offset at this instant", which `Intl`
 * can answer. See `zonedWallToMs` for the DST edge cases.
 */
import { toDateStr } from './localDate'

const MINUTE_MS = 60_000
const DAY_MS    = 24 * 60 * MINUTE_MS

/**
 * Longest zone name accepted from a client. The longest real IANA name is a little over
 * 30 characters; the cap only exists so a request cannot park an arbitrary string in a
 * database column.
 */
export const MAX_ZONE_LENGTH = 64

/**
 * `YYYY-MM-DD`, optionally `THH:MM`, optionally `:SS` and a fraction, optionally a `Z`
 * or `±HH:MM` suffix. The shapes the app writes, and the shapes a Z-suffixed API value
 * (Canvas `dueAt`, Google `dateTime`) arrives in.
 */
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?(Z|[+-]\d{2}(?::?\d{2})?)?$/i

const pad = n => String(n).padStart(2, '0')

/**
 * Most zones the formatter cache holds before it starts again from empty. Far more than
 * the handful real devices report, so honest traffic never notices it.
 */
export const MAX_CACHED_ZONES = 200

// Constructing an Intl.DateTimeFormat is far slower than using one, and the cron asks
// the same handful of zones the same question for every candidate it looks at.
//
// Keyed by the *canonical* name, and bounded, because the names come from clients.
// `Intl` accepts any casing of a zone ('america/new_york', 'AMERICA/NEW_YORK', …) and
// any spelling of an offset ('+0530', '+05:30'), so keying on the string as sent let
// one signed-in client mint a new ~23 KB formatter per request until the instance ran
// out of memory. Every spelling of a zone now shares one entry, and the distinct zones
// that remain (real names, and every whole-minute offset) cannot pile up past the cap.
const formatters = new Map()

/** `Intl`'s own spelling of a zone name — throws a RangeError for one it does not know. */
function canonicalName(timeZone) {
  return new Intl.DateTimeFormat('en-US', { timeZone }).resolvedOptions().timeZone
}

function partsFormatter(timeZone) {
  // The canonical spelling — which is what devices send — hits without building anything.
  let f = formatters.get(timeZone)
  if (f) return f
  const canonical = canonicalName(timeZone)
  f = formatters.get(canonical)
  if (!f) {
    // Clearing outright rather than evicting one at a time: a full cache only happens
    // under a flood of made-up zones, and rebuilding a few real ones afterwards is cheap.
    if (formatters.size >= MAX_CACHED_ZONES) formatters.clear()
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: canonical,
      hourCycle: 'h23', // avoids a `hour12: false` quirk that formats midnight as "24"
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    formatters.set(canonical, f)
  }
  return f
}

/** How many zones have a cached formatter. Only the tests that bound the cache need it. */
export function cachedZoneCount() {
  return formatters.size
}

/**
 * Is this a zone name `Intl` recognises (and short enough to store)?
 *
 * The test is the one every caller actually depends on: would `Intl.DateTimeFormat`
 * accept it. Anything else — a typo, an empty string, a non-string, a name longer than
 * `MAX_ZONE_LENGTH` — is not a zone.
 */
export function isValidTimeZone(name) {
  if (typeof name !== 'string' || name.length === 0 || name.length > MAX_ZONE_LENGTH) return false
  try {
    partsFormatter(name)
    return true
  } catch {
    return false
  }
}

/**
 * A fixed-offset zone from a device's `getTimezoneOffset()` value.
 *
 * `getTimezoneOffset()` is minutes to ADD to local time to reach UTC — positive west of
 * Greenwich, the opposite sign to every offset anyone writes down — which is why it is
 * converted here, once, rather than at each use.
 *
 * @param {number} tzOffset
 * @returns {{utcOffsetMinutes: number}|null}
 */
export function zoneFromTzOffset(tzOffset) {
  const n = Number(tzOffset)
  if (tzOffset === null || tzOffset === undefined || tzOffset === '' || !Number.isFinite(n)) return null
  // `0 - 0` would be `-0`, which is harmless but prints oddly in a test failure.
  return { utcOffsetMinutes: n === 0 ? 0 : -Math.trunc(n) }
}

/** Most frequent value, ties broken by sort order — stable across calls. */
function consensus(values) {
  const counts = new Map()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best = null, bestCount = 0
  for (const [v, c] of counts) {
    if (c > bestCount || (c === bestCount && String(v) < String(best))) { best = v; bestCount = c }
  }
  return best
}

/**
 * The zone to read one user's floating times in, from their push subscription rows.
 *
 * In order: a recorded IANA name (DST-correct all year); else the fixed offset from
 * `tz_offset`; else UTC — which is no worse than what the server did before it asked.
 *
 * A user with several devices has one row each, and nothing records which was written
 * most recently (the table has no `updated_at`). So the choice is made by consensus
 * rather than by row order: the zone most of their devices report, ties broken
 * alphabetically. Being *deterministic* matters more than which one wins. A reminder's
 * dedup key contains its fire time, so a zone that flipped between two scans would
 * give the same reminder two keys — and two pushes.
 *
 * @param {object|object[]} rows  `{ time_zone, tz_offset }` rows (extra fields ignored).
 * @returns {string|{utcOffsetMinutes: number}}
 */
export function resolveUserZone(rows) {
  const list = (Array.isArray(rows) ? rows : [rows]).filter(Boolean)

  const named = consensus(list.map(r => r.time_zone).filter(isValidTimeZone))
  if (named) return named

  const offsets = list.map(r => zoneFromTzOffset(r.tz_offset)).filter(Boolean).map(z => z.utcOffsetMinutes)
  if (offsets.length > 0) {
    const off = consensus(offsets)
    return off === 0 ? 'UTC' : { utcOffsetMinutes: off }
  }
  return 'UTC'
}

/**
 * Minutes `zone` is ahead of UTC at the instant `utcMs` (DST included), or `null` when
 * `zone` is not something `Intl` recognises.
 *
 * Computed by formatting the instant *as if it were* that zone's wall clock, then
 * reading the same six fields back as a second UTC instant and diffing against the
 * first. The difference is the zone's offset at that moment — there is no other
 * standards-track way to get an IANA zone's offset at an arbitrary instant without
 * shipping a timezone database of our own.
 *
 * @param {string|{utcOffsetMinutes:number}} zone
 * @param {number} utcMs
 * @returns {number|null}
 */
export function offsetMinutesAt(zone, utcMs) {
  if (zone && typeof zone === 'object') {
    const off = Number(zone.utcOffsetMinutes)
    return Number.isFinite(off) ? off : null
  }
  if (!isValidTimeZone(zone) || !Number.isFinite(utcMs)) return null
  const parts = partsFormatter(zone).formatToParts(new Date(utcMs))
  const get = type => Number(parts.find(p => p.type === type)?.value)
  // Seconds are dropped from the instant first, so a sub-minute remainder in `utcMs`
  // cannot round the result to a nonsense offset.
  const wholeSecond = Math.floor(utcMs / 1000) * 1000
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return Math.round((asUtc - wholeSecond) / MINUTE_MS)
}

/**
 * The instant at which a zone's clocks read a given wall-clock time.
 *
 * `wallMs` is that wall-clock time written as if it were UTC (`Date.UTC(y, m, d, h, mi)`)
 * — the one representation of "these digits, no zone" that arithmetic works on.
 *
 * Twice a year the answer is not simply "subtract the offset":
 *
 *   - **The spring-forward gap.** 02:30 on the night clocks go from 02:00 to 03:00 never
 *     happens. It resolves to the instant the clocks would have read 02:30 had they not
 *     jumped — which they then call 03:30. This is what `new Date()` does in a browser,
 *     so a reminder set in the gap fires at the same moment on both sides.
 *   - **The fall-back overlap.** 01:30 on the night clocks go back happens twice. The
 *     earlier one wins, again matching `new Date()`: firing an hour early is a
 *     reminder, firing an hour late is a missed class.
 *
 * Both are found by taking the offsets in force a day either side of the wall time
 * (which bracket any single transition near it) and checking which of the two
 * candidate instants actually reads back as the requested time.
 *
 * @returns {number|null} epoch ms, or null when the zone is not recognised.
 */
export function zonedWallToMs(wallMs, zone) {
  if (!Number.isFinite(wallMs)) return null
  const before = offsetMinutesAt(zone, wallMs - DAY_MS)
  const after  = offsetMinutesAt(zone, wallMs + DAY_MS)
  if (before === null || after === null) return null

  const tBefore = wallMs - before * MINUTE_MS
  if (before === after) return tBefore

  const tAfter       = wallMs - after * MINUTE_MS
  const beforeHolds  = offsetMinutesAt(zone, tBefore) === before
  const afterHolds   = offsetMinutesAt(zone, tAfter)  === after
  if (beforeHolds && afterHolds) return Math.min(tBefore, tAfter) // overlap: the earlier
  if (afterHolds) return tAfter
  // Either `before` alone holds, or neither does — the gap, which moves forward by
  // reading the time with the offset from before the jump.
  return tBefore
}

/** Days in a month, for rejecting `2026-02-30` rather than rolling it into March. */
function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * Split a stored value into its wall-clock fields, or null when it is not one of the
 * ISO shapes above or a field is out of range.
 */
function parseIso(value) {
  if (typeof value !== 'string') return null
  const m = ISO_RE.exec(value.trim())
  if (!m) return null
  const [, Y, Mo, D, h, mi, s, frac, suffix] = m
  const year = +Y, month = +Mo, day = +D
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null
  const hasTime = h !== undefined
  const hour = hasTime ? +h : 0, minute = hasTime ? +mi : 0, second = s ? +s : 0
  if (hour > 23 || minute > 59 || second > 59) return null
  const ms = frac ? Math.round(Number(`0.${frac}`) * 1000) : 0
  return { year, month, day, hour, minute, second, ms, hasTime, suffix: suffix ?? null }
}

/** `Date.UTC` of a parsed value's own digits — "this wall time, read as if UTC". */
function wallMsOf(p) {
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, p.ms)
}

/**
 * Epoch ms of a stored time, read in `zone`.
 *
 *   - `2026-10-08T09:00:00` (floating) → 9am on the 8th, in `zone`.
 *   - `2026-10-08` (a bare date) → local midnight that day, in `zone`.
 *   - `2026-10-08T13:00:00Z` / `…-04:00` → already an instant; parsed as-is, `zone`
 *     plays no part.
 *   - Anything else, or an unrecognised `zone` → null.
 *
 * With no `zone` at all this is exactly `new Date(value).getTime()` — the process's
 * own local time, and JavaScript's own reading of a bare date as UTC midnight — with
 * null in place of NaN (and for an empty value, which `new Date` would read as 1970).
 * A client caller that passes no zone gets precisely what it got before.
 *
 * @param {string} value
 * @param {string|{utcOffsetMinutes:number}} [zone]
 * @returns {number|null}
 */
export function floatingToMs(value, zone) {
  if (zone === undefined || zone === null || typeof value !== 'string') {
    if (value === null || value === undefined || value === '') return null
    const t = new Date(value).getTime()
    return Number.isNaN(t) ? null : t
  }
  const p = parseIso(value)
  if (!p) return null
  if (p.suffix) {
    const t = Date.parse(value.trim())
    return Number.isNaN(t) ? null : t
  }
  return zonedWallToMs(wallMsOf(p), zone)
}

/**
 * `YYYY-MM-DD` of an instant, on `zone`'s calendar.
 *
 * With no zone, the process's own calendar (lib/localDate's `toDateStr`). Returns ''
 * for an invalid instant or an unrecognised zone, matching `toDateStr`.
 *
 * @param {number|Date} ms
 * @param {string|{utcOffsetMinutes:number}} [zone]
 */
export function dateStrInZone(ms, zone) {
  const t = ms instanceof Date ? ms.getTime() : Number(ms)
  if (!Number.isFinite(t)) return ''
  if (zone === undefined || zone === null) return toDateStr(new Date(t))
  const off = offsetMinutesAt(zone, t)
  if (off === null) return ''
  const wall = new Date(t + off * MINUTE_MS)
  return `${wall.getUTCFullYear()}-${pad(wall.getUTCMonth() + 1)}-${pad(wall.getUTCDate())}`
}

/**
 * The calendar date a stored value falls on, for a reader in `zone`.
 *
 * A bare date or a floating time is *already* on the reader's calendar — its own date
 * digits are the answer, whatever the zone. Only a Z/offset-suffixed instant needs
 * converting, and it is converted to `zone`'s calendar. This is lib/localDate's
 * `dateStrOf` with the zone made explicit, which is what lets a server answer it.
 *
 * @returns {string} `YYYY-MM-DD`, or '' when the value cannot be read.
 */
export function localDateOf(value, zone) {
  const p = parseIso(value)
  if (!p) return ''
  if (!p.suffix) return `${p.year}-${pad(p.month)}-${pad(p.day)}`
  const t = Date.parse(value.trim())
  return Number.isNaN(t) ? '' : dateStrInZone(t, zone)
}

/**
 * Calendar arithmetic on a `YYYY-MM-DD` string — no clock, no zone, no DST.
 *
 * @returns {string} '' for an unreadable date.
 */
export function addDaysToDateStr(dateStr, days) {
  const p = parseIso(dateStr)
  if (!p || p.hasTime) return ''
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + days))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/**
 * A stored time as a reader in `zone` would say it: `{ date: 'Thu, Oct 8', time:
 * '9:00 AM' }`, with `time` null for a bare date and both null for an unreadable value.
 *
 * Floating values and bare dates are formatted from their own digits, with no zone
 * conversion at all — they already *are* the reader's wall clock, and converting them
 * from the server's UTC is precisely the bug this exists to avoid (Corvus was told a
 * 9am class was at 5am, and an all-day event that it fell on the day before). Only a
 * Z/offset-suffixed instant is converted into `zone`.
 *
 * Every value is first turned into "wall time written as UTC" and then formatted *in*
 * UTC, which is what lets a fixed-offset zone work as well as a named one.
 *
 * @param {string} value
 * @param {string|{utcOffsetMinutes:number}} [zone] Defaults to UTC.
 * @returns {{date: string|null, time: string|null}}
 */
export function formatWallTime(value, zone = 'UTC') {
  const p = parseIso(value)
  if (!p) return { date: null, time: null }

  let wallMs
  if (p.suffix) {
    const t = Date.parse(value.trim())
    if (Number.isNaN(t)) return { date: null, time: null }
    const off = offsetMinutesAt(zone, t) ?? 0 // an unknown zone reads as UTC, not as an error
    wallMs = t + off * MINUTE_MS
  } else {
    wallMs = wallMsOf(p)
  }

  const at   = new Date(wallMs)
  const date = at.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
  const time = (p.hasTime || p.suffix)
    ? at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' })
    : null
  return { date, time }
}
