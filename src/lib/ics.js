/**
 * Pure ICS (RFC 5545) date parsing and VEVENT extraction.
 *
 * Extracted from ImportExportButton.js so it can be tested independently. This is the
 * importer behind the file-picker ICS import. The Canvas feed route
 * (api/canvas/ics/route.js) keeps its own, separate copy rather than sharing this one —
 * Canvas's feed has its own quirk (a floating time there is "assumed UTC", which is the
 * opposite of what a generic floating ICS value means) that does not belong here.
 *
 * ## Why dates are parsed the way they are
 *
 * The app does not store instants in UTC. A timed event is a naive local string —
 * `YYYY-MM-DDTHH:mm:ss`, no zone attached — and an all-day event is a bare `YYYY-MM-DD`
 * with an *exclusive* end, the same convention `icsExport.js` writes (see eventSpan.js,
 * EventModal.js). The previous version of this parser always appended `Z` and never set
 * `allDay`, so:
 *
 *   - `DTSTART;VALUE=DATE:20240115`, an all-day event, became
 *     `2024-01-15T00:00:00.000Z` — a TIMED event at 7pm the previous evening for anyone
 *     in New York.
 *   - `DTSTART;TZID=America/New_York:20240115T130000`, and a floating
 *     `DTSTART:20240115T130000` with no `Z` at all, were both parsed as if they were
 *     UTC, shifting every one of them by the viewer's own UTC offset.
 *
 * RFC 5545 gives a date-time exactly three ways to mean a moment, and each needs its own
 * handling:
 *
 *   - **UTC** (trailing `Z`) — convert to the viewer's local wall time.
 *   - **Floating** (no `Z`, no `TZID`) — the digits already *are* wall-clock time, by
 *     definition: a floating value has no zone attached. Taken as-is.
 *   - **Zoned** (`TZID=<zone>`) — converted from that zone's offset at that instant to
 *     the viewer's local wall time, via `Intl.DateTimeFormat`. An unrecognised zone name
 *     falls back to floating rather than silently guessing wrong.
 *
 * None of this was reachable from `rawLine.split(':')`: a property's parameters
 * (`;VALUE=DATE`, `;TZID=...`) sit *before* the colon, and the old parser threw that
 * whole prefix away by matching `key.startsWith('DTSTART')` against it. Properties are
 * now parsed into `{ name, params, value }` so a parameter can actually be read.
 */

/**
 * Minutes `zone` is ahead of UTC at `utcMs`, or `null` if `zone` is not a timezone name
 * `Intl` recognises.
 *
 * Computed by formatting the instant *as if it were* that zone's wall clock, then
 * reading the same six fields back as a second UTC instant and diffing against the
 * first. The difference is the zone's offset at that moment, DST included — there is no
 * other standards-track way to get a IANA zone's offset at an arbitrary instant without
 * shipping a timezone database of our own.
 */
function offsetMinutesAt(zone, utcMs) {
  let parts
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23', // avoids a `hour12: false` quirk that formats midnight as "24"
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(utcMs))
  } catch {
    return null // not a zone name Intl recognises
  }
  const get = type => Number(parts.find(p => p.type === type)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return Math.round((asUtc - utcMs) / 60_000)
}

/** `YYYY-MM-DDTHH:mm:ss` in the viewer's own local time — the app's naive-local shape. */
function localDateTimeString(date) {
  const pad = n => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T` +
         `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/**
 * Parse one ICS date/date-time value into the app's own on-disk shape.
 *
 * Returns `{ value, allDay }`, or `null` when the value cannot be read at all. `value`
 * is a bare `YYYY-MM-DD` when `allDay` is true, or a naive local `YYYY-MM-DDTHH:mm:ss`
 * otherwise — never a `Z`-suffixed ISO string, because that is not the shape EventModal
 * saves or eventSpan/localDate read back.
 *
 * `params` is the property's parsed parameters, e.g. `{ VALUE: 'DATE' }` or
 * `{ TZID: 'America/New_York' }`.
 */
export function parseIcsDate(value, params = {}) {
  const v = value.trim()

  // A day, not an instant: VALUE=DATE, or (seen in the wild without the parameter) a
  // bare 8-digit value with no time part at all.
  if (params.VALUE === 'DATE' || /^\d{8}$/.test(v)) {
    if (!/^\d{8}$/.test(v)) return null
    return { value: `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`, allDay: true }
  }

  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(v)
  if (!m) {
    // Not a shape the spec defines. Hand it to Date and hope, rather than dropping the
    // whole VEVENT over one malformed value — serializeEvent applies the same leniency
    // in the other direction.
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? null : { value: localDateTimeString(d), allDay: false }
  }

  const [, Y, Mo, D, h, mi, s, zulu] = m
  const wallAsUtcMs = Date.UTC(+Y, +Mo - 1, +D, +h, +mi, +s)

  if (zulu) return { value: localDateTimeString(new Date(wallAsUtcMs)), allDay: false }

  if (params.TZID) {
    const offset = offsetMinutesAt(params.TZID, wallAsUtcMs)
    if (offset !== null) {
      return { value: localDateTimeString(new Date(wallAsUtcMs - offset * 60_000)), allDay: false }
    }
    // Unrecognised zone name — fall through to floating rather than guessing wrong.
  }

  // Floating: no zone attached at all, so the digits already are wall-clock time.
  return { value: `${Y}-${Mo}-${D}T${h}:${mi}:${s}`, allDay: false }
}

/**
 * One unfolded property line, split on parameters: `NAME;PARAM=x;PARAM2=y:value`
 * becomes `{ name: 'NAME', params: { PARAM: 'x', PARAM2: 'y' }, value }`.
 *
 * Split on the first colon *outside double quotes* — a value (a URL in LOCATION, say)
 * can legally contain further colons, and so can a quoted parameter value; RFC 5545
 * requires the quotes precisely when a parameter value contains `:`, `;` or `,`. The
 * `;` between parameters is likewise only a separator outside quotes.
 */
function parseProperty(rawLine) {
  let inQuotes = false
  let colon = -1
  const cuts = [-1]
  for (let i = 0; i < rawLine.length; i++) {
    const ch = rawLine[i]
    if (ch === '"') inQuotes = !inQuotes
    else if (!inQuotes && ch === ';') cuts.push(i)
    else if (!inQuotes && ch === ':') { colon = i; break }
  }
  if (colon === -1) return null
  cuts.push(colon)
  const segments = cuts.slice(1).map((end, k) => rawLine.slice(cuts[k] + 1, end))
  const [name, ...paramParts] = segments
  const params = {}
  for (const part of paramParts) {
    const eq = part.indexOf('=')
    // A parameter value may be quoted (`TZID="America/New_York"`), and must be when it
    // contains a colon, semicolon or comma. The quotes are not part of the value: kept,
    // they made Intl reject the zone and the time fell back to floating, silently.
    if (eq !== -1) params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1).replace(/^"(.*)"$/, '$1')
  }
  return { name: name.toUpperCase(), params, value: rawLine.slice(colon + 1) }
}

/**
 * RFC 5545 §3.3.11 TEXT unescaping, for SUMMARY/DESCRIPTION/LOCATION.
 *
 * One left-to-right pass handling `\n`/`\N`, `\\`, `\;` and `\,` together, rather than
 * running separate `.replace()` calls one after another — a sequential `\\` replace run
 * after (or before) the others would either re-escape characters that already stand for
 * themselves, or let an escaped backslash eat the escape of whatever follows it.
 */
function unescapeText(value) {
  return value.replace(/\\(.)/g, (_, ch) => (ch === 'n' || ch === 'N' ? '\n' : ch))
}

/**
 * Parse an ICS text blob into an array of event objects.
 *
 * Each event has: id, title, start, end (optional), allDay, description, location.
 * `start`/`end` are the app's own naive-local or bare-date strings (see parseIcsDate) —
 * not UTC timestamps, so they can be handed straight to FullCalendar/EventModal as-is.
 */
export function parseIcs(text) {
  const unfold = text.replace(/\r?\n[ \t]/g, '')
  const entries = unfold.split(/\r?\n(?=BEGIN:)/g)
  const eventsFromIcs = []

  for (const entry of entries) {
    if (!entry.includes('BEGIN:VEVENT')) continue
    const event = {}
    const lines = entry.split(/\r?\n/)
    for (const rawLine of lines) {
      const prop = parseProperty(rawLine)
      if (!prop) continue
      const { name, params, value } = prop

      if (name === 'UID')         event.id          = value.trim()
      if (name === 'SUMMARY')     event.title       = unescapeText(value.trim())
      if (name === 'DESCRIPTION') event.description = unescapeText(value.trim())
      if (name === 'LOCATION')    event.location    = unescapeText(value.trim())

      if (name === 'DTSTART') {
        const parsed = parseIcsDate(value, params)
        if (parsed) { event.start = parsed.value; event.allDay = parsed.allDay }
      }
      if (name === 'DTEND') {
        const parsed = parseIcsDate(value, params)
        if (parsed) event.end = parsed.value
      }
    }
    if (event.start) {
      event.title  = event.title || 'Untitled event'
      event.id     = event.id    || `ics-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      event.allDay = !!event.allDay
      eventsFromIcs.push(event)
    }
  }
  return eventsFromIcs
}
