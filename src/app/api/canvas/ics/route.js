/**
 * POST /api/canvas/ics
 * Server-side iCal feed fetcher — avoids browser CORS restrictions.
 * Body: { url: string }
 * Returns: { events: [...] } or { error } with 400 status.
 *
 * No session check, by design: a fully local-only user with no account at all can still
 * paste a Canvas Calendar Feed URL and get it synced, the same as anyone signed in (see
 * the "Calendar feed, no token" path in README's Canvas LMS section). That also makes
 * this the one route in the app anyone on the internet can point at an arbitrary URL and
 * have the *server* fetch it — an open SSRF relay unless the target is restricted, since
 * nothing here depends on who is asking. `safeFetch` (lib/safeFetch.js) is that
 * restriction: it refuses loopback/private/link-local targets (including the
 * 169.254.169.254 cloud-metadata address), credentials embedded in the URL, and it caps
 * redirects, response size and time — see that file for what it does and does not close.
 *
 * Parses VEVENTs from a text/calendar (.ics) URL with its own small parser, extended
 * with:
 *  - VALUE=DATE (all-day) support
 *  - TZID-qualified DTSTART/DTEND
 *  - URL/ATTACH-type html link extraction
 *
 * This is a deliberate duplicate of lib/ics.js's parseIcs, not a shared one: this parser
 * treats a floating (no `Z`, no `TZID`) datetime as UTC — "safe for Canvas feeds", per
 * the comment this logic was written with — while lib/ics.js treats a floating value as
 * local wall-clock time, which is what the RFC actually says a floating value means for
 * a general-purpose .ics import. Those are opposite interpretations of the same bytes,
 * so one parser cannot correctly serve both callers; sharing it would silently make one
 * of the two wrong instead.
 */
import { safeFetch, SafeFetchError } from '@/lib/safeFetch'

/**
 * Parse a raw ICS datetime string into an ISO 8601 string.
 * Handles:
 *   - DATE form:     YYYYMMDD          → treated as all-day, returns { iso, allDay: true }
 *   - Zulu form:     YYYYMMDDTHHmmssZ  → UTC
 *   - Local form:    YYYYMMDDTHHmmss   → assumed UTC (common in Canvas feeds)
 */
function parseIcsDatetime(rawValue) {
  // rawValue may have parameters before the colon, e.g. "DTSTART;TZID=America/New_York:20240901T090000"
  // Strip any parameter portion — caller already passes just the value half
  const v = rawValue.trim()

  // All-day: pure date YYYYMMDD (8 digits, no T)
  if (/^\d{8}$/.test(v)) {
    const year  = v.slice(0, 4)
    const month = v.slice(4, 6)
    const day   = v.slice(6, 8)
    return { iso: `${year}-${month}-${day}`, allDay: true }
  }

  // Datetime: YYYYMMDDTHHmmss[Z]
  if (/^\d{8}T\d{6}Z?$/.test(v)) {
    const withoutZ  = v.replace(/Z$/, '')
    const year   = withoutZ.slice(0, 4)
    const month  = withoutZ.slice(4, 6)
    const day    = withoutZ.slice(6, 8)
    const hour   = withoutZ.slice(9, 11)  || '00'
    const minute = withoutZ.slice(11, 13) || '00'
    const second = withoutZ.slice(13, 15) || '00'
    // Treat both Zulu and floating as UTC (safe for Canvas feeds)
    return { iso: new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`).toISOString(), allDay: false }
  }

  // Fallback: let JS parse it
  const d = new Date(v)
  if (!isNaN(d.getTime())) return { iso: d.toISOString(), allDay: false }
  return null
}

/**
 * Parse a full ICS text into an array of event objects.
 */
function parseIcsText(text) {
  // Unfold continuation lines (RFC 5545 §3.1)
  const unfolded = text.replace(/\r?\n[ \t]/g, '')

  // Split into blocks on BEGIN: boundaries
  const entries = unfolded.split(/\r?\n(?=BEGIN:)/g)
  const results = []

  for (const entry of entries) {
    if (!entry.includes('BEGIN:VEVENT')) continue

    const event = {}
    let allDay = false
    const lines = entry.split(/\r?\n/)

    for (const rawLine of lines) {
      // Split on first colon only; property name may have params (key;param=val:value)
      const colonIdx = rawLine.indexOf(':')
      if (colonIdx < 0) continue
      const keyPart = rawLine.slice(0, colonIdx)
      const value   = rawLine.slice(colonIdx + 1)

      // Normalise key: strip params
      const key = keyPart.split(';')[0].toUpperCase()

      if (key === 'UID')         { event.id = value.trim() }
      if (key === 'SUMMARY')     { event.title = value.trim() }
      if (key === 'DESCRIPTION') { event.description = value.trim().replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';') }
      if (key === 'LOCATION')    { event.location = value.trim() }
      if (key === 'URL')         { event.htmlUrl = value.trim() }

      if (key === 'DTSTART') {
        // Check for VALUE=DATE in the property params
        const valueIsDate = keyPart.toUpperCase().includes('VALUE=DATE')
        const parsed = parseIcsDatetime(value.trim())
        if (parsed) {
          event.start = parsed.iso
          if (parsed.allDay || valueIsDate) allDay = true
        }
      }

      if (key === 'DTEND') {
        const valueIsDate = keyPart.toUpperCase().includes('VALUE=DATE')
        const parsed = parseIcsDatetime(value.trim())
        if (parsed) {
          event.end = parsed.iso
          if (parsed.allDay || valueIsDate) allDay = true
        }
      }
    }

    if (!event.start) continue

    results.push({
      id:          event.id || `ics-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title:       event.title || 'Untitled event',
      start:       event.start,
      end:         event.end   || null,
      allDay:      allDay,
      location:    event.location    || null,
      description: event.description || null,
      htmlUrl:     event.htmlUrl     || null,
    })
  }

  return results
}

export async function POST(request) {
  let body
  try { body = await request.json() } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const { url } = body ?? {}
  if (!url || typeof url !== 'string') {
    return Response.json({ error: 'A URL is required.' }, { status: 400 })
  }

  // safeFetch owns every check on the URL itself now — scheme, embedded credentials,
  // and where it actually resolves — so there is no separate scheme pre-check here
  // the way there used to be; a single place for "is this URL even allowed" is the
  // point.
  let text
  try {
    text = await safeFetch(url.trim(), { maxBytes: 5 * 1024 * 1024, timeoutMs: 10_000 })
  } catch (err) {
    if (err instanceof SafeFetchError) {
      // A non-ok upstream status is the one case with pre-existing wording worth
      // keeping: the original message named the exact status and suggested checking
      // the URL, which safeFetch's generic "Upstream returned HTTP 404." does not.
      if (typeof err.status === 'number') {
        return Response.json({
          error: `The URL returned HTTP ${err.status}. Check that it is correct and publicly accessible.`,
        }, { status: 400 })
      }
      return Response.json({ error: err.message }, { status: 400 })
    }
    return Response.json({ error: `Could not fetch the URL: ${err.message}` }, { status: 400 })
  }

  // Validate it looks like a calendar
  if (!text.includes('BEGIN:VCALENDAR') && !text.includes('BEGIN:VEVENT')) {
    return Response.json({ error: 'The URL does not appear to contain a valid iCal calendar (no VCALENDAR or VEVENT found).' }, { status: 400 })
  }

  const events = parseIcsText(text)

  if (events.length === 0) {
    return Response.json({ error: 'No events were found in the calendar feed.' }, { status: 400 })
  }

  return Response.json({ events })
}
