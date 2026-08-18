/**
 * Mirror luminaeVigila items into a Google Calendar, so they reach surfaces this app
 * cannot reach on its own — chiefly Pixel's **At a Glance**.
 *
 * ## Why a mirror at all
 *
 * At a Glance has no third-party API. Nothing can register content with it; it reads
 * Google's own services. A PWA additionally cannot provide an Android home-screen
 * widget at any version, which is why the daily push exists and calls itself "the
 * closest thing to a home-screen widget a PWA can deliver". Writing to Google
 * Calendar is the only route to that surface, and it comes free with lock-screen
 * glances, Assistant, and Wear.
 *
 * ## Why this cannot create a feedback loop
 *
 * The app already *imports* Google events. Naively writing app events out to Google
 * would re-import them as duplicates, then mirror the duplicates, and so on. Three
 * things stop that:
 *
 *   1. Mirrored events live on their own calendar, created by this app.
 *   2. That calendar is filtered out of `GET /api/google/calendars`, so it can never
 *      be selected as an import source in the first place.
 *   3. Every mirrored event carries `extendedProperties.private.lvId`, so even a
 *      hand-added import selection could be filtered.
 *
 * Only the app's *own* events and tasks are mirrored. Imported Google events are
 * never stored in the `events` table (the sync route is explicit that Google events
 * are live, not synced), so they cannot be picked up and written back.
 *
 * ## Deterministic ids instead of a local mapping table
 *
 * Google lets the caller choose an event id, provided it is base32hex
 * (`[a-v0-9]{5,1024}`). Hex is a subset of that alphabet, so `lv` + hex(appId) is
 * always legal and always the same for a given item. That makes the write a true
 * upsert — `insert`, or `update` on 409 — with no table mapping app ids to Google
 * ids, and nothing to get out of sync if a write half-fails.
 */

/** Name of the calendar this app creates and owns. */
export const MIRROR_CALENDAR_NAME = 'luminaeVigila'

/**
 * The one write scope the mirror needs.
 *
 * `calendar.app.created` permits creating secondary calendars and managing events
 * *only on calendars this app created*. Deliberately not `calendar.events` (which
 * would grant event write access to every calendar the user has) or `calendar` (which
 * would grant everything). The mirror should be incapable of touching a real calendar
 * even if this code were wrong.
 *
 * Exported so the readiness probe can check the grant against the same constant the
 * consent screen requests, instead of inferring write access from a call that only
 * needs read.
 */
export const MIRROR_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created'

/**
 * How far around today to mirror. Bounded on purpose: mirroring all history would
 * spend API calls on events nobody will glance at, and At a Glance only ever looks
 * forward. The past week is kept so a glance at "today" is right on a slow day.
 */
export const MIRROR_PAST_DAYS   = 7
export const MIRROR_FUTURE_DAYS = 60

/** Marker written on every mirrored event so ours are always identifiable. */
export const LV_PROP = 'lvId'

/**
 * Google event id for an app item.
 *
 * Google requires base32hex and rejects anything else with a 400. Hex encoding the
 * source id keeps it in the alphabet whatever the app id contains — they are a mix of
 * `note-<ts>-<rand>` strings and bare millisecond timestamps.
 */
export function googleEventId(kind, appId) {
  const hex = Buffer.from(`${kind}:${appId}`, 'utf8').toString('hex')
  return `lv${hex}`
}

/**
 * Content fingerprint, so a reconcile only writes what actually changed.
 *
 * Without this, every reconcile would PATCH every event — hundreds of API calls to
 * write values identical to what is already there. Stored on the event itself rather
 * than locally, so it survives a redeploy and needs no extra storage.
 */
export function contentHash(desired) {
  const basis = JSON.stringify([
    desired.summary, desired.description ?? '',
    desired.start?.dateTime ?? desired.start?.date ?? '',
    desired.end?.dateTime   ?? desired.end?.date   ?? '',
  ])
  // djb2 — short, stable, and this only needs to detect change, not resist attack.
  let h = 5381
  for (let i = 0; i < basis.length; i++) h = ((h << 5) + h + basis.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Local-date string, matching how the app stores `dueDate`. */
function dateStr(d) {
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Google wants an exclusive end date for all-day events. */
function nextDay(ymd) {
  const d = new Date(`${ymd}T12:00:00`)
  d.setDate(d.getDate() + 1)
  return dateStr(d)
}

/**
 * Build the set of Google events that *should* exist, from the app's own data.
 *
 * Pure, so the mapping is testable without touching Google. `now` is injectable for
 * the same reason.
 *
 * @param {object} opts
 * @param {Array}  opts.events    App events (local only — never imported Google ones).
 * @param {Array}  opts.todos     App tasks.
 * @param {string} opts.timeZone  IANA zone for timed events.
 * @param {number} [opts.now]     Epoch ms.
 * @returns {Array<object>} Google event resources, each with an `id`.
 */
export function buildDesiredEvents({ events = [], todos = [], timeZone = 'UTC', now = Date.now() } = {}) {
  const lo = now - MIRROR_PAST_DAYS   * DAY_MS
  const hi = now + MIRROR_FUTURE_DAYS * DAY_MS
  const out = []

  for (const ev of events) {
    if (!ev?.id || !ev.start || !ev.title) continue
    const startMs = new Date(ev.start).getTime()
    if (Number.isNaN(startMs) || startMs < lo || startMs > hi) continue

    const isAllDay = !!ev.allDay || !String(ev.start).includes('T')
    const resource = isAllDay
      ? {
          start: { date: String(ev.start).slice(0, 10) },
          end:   { date: ev.end ? String(ev.end).slice(0, 10) : nextDay(String(ev.start).slice(0, 10)) },
        }
      : {
          start: { dateTime: toRfc3339(ev.start), timeZone },
          // Google rejects a zero-length event, so a missing end becomes one hour.
          end:   { dateTime: toRfc3339(ev.end && ev.end !== ev.start ? ev.end : plusHour(ev.start)), timeZone },
        }

    out.push(withMeta({
      id:      googleEventId('ev', ev.id),
      summary: ev.title,
      description: ev.extendedProps?.notes || undefined,
      ...resource,
    }, 'ev', ev.id))
  }

  for (const td of todos) {
    // A task with no due date has nowhere to sit on a calendar, and a completed one
    // is noise on a glance surface.
    if (!td?.id || !td.dueDate || !td.title || td.completed) continue
    const dueMs = new Date(`${td.dueDate}T12:00:00`).getTime()
    if (Number.isNaN(dueMs) || dueMs < lo || dueMs > hi) continue

    out.push(withMeta({
      id:      googleEventId('td', td.id),
      // Prefixed so a glance distinguishes work due from somewhere to be.
      summary: `☑ ${td.title}`,
      description: td.notes || undefined,
      start: { date: td.dueDate },
      end:   { date: nextDay(td.dueDate) },
    }, 'td', td.id))
  }

  return out
}

function withMeta(resource, kind, appId) {
  return {
    ...resource,
    extendedProperties: {
      private: { [LV_PROP]: `${kind}:${appId}`, lvHash: contentHash(resource) },
    },
  }
}

/** The app stores naive local datetimes; RFC3339 with an explicit zone needs seconds. */
function toRfc3339(v) {
  const s = String(v)
  if (/[Z+]|-\d{2}:\d{2}$/.test(s.slice(10))) return s // already offset-qualified
  return s.length === 16 ? `${s}:00` : s
}

function plusHour(v) {
  const d = new Date(v)
  d.setHours(d.getHours() + 1)
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`
}

/**
 * Work out the minimum set of writes to make Google match `desired`.
 *
 * @param {Array} desired  From buildDesiredEvents.
 * @param {Array} existing Google events already on the mirror calendar.
 * @returns {{inserts:Array, updates:Array, deletes:Array, unchanged:number}}
 */
export function diffMirror(desired, existing) {
  const byId = new Map()
  for (const e of existing ?? []) {
    // Key on our own marker rather than the Google id: an event the user duplicated
    // by hand keeps the marker but gets a fresh id, and should still be reconciled.
    const lv = e?.extendedProperties?.private?.[LV_PROP]
    if (lv) byId.set(lv, e)
  }

  const inserts = [], updates = []
  const seen = new Set()

  for (const d of desired) {
    const lv = d.extendedProperties.private[LV_PROP]
    seen.add(lv)
    const prev = byId.get(lv)
    if (!prev) { inserts.push(d); continue }
    if (prev.extendedProperties?.private?.lvHash !== d.extendedProperties.private.lvHash) {
      updates.push({ ...d, googleId: prev.id })
    }
  }

  // Anything of ours Google still has but the app no longer wants: deleted, completed,
  // or aged out of the mirror window.
  const deletes = [...byId.entries()]
    .filter(([lv]) => !seen.has(lv))
    .map(([, e]) => e.id)

  return { inserts, updates, deletes, unchanged: desired.length - inserts.length - updates.length }
}
