/**
 * Pure ICS date parsing and VEVENT extraction utilities.
 * Extracted from ImportExportButton.js so they can be tested independently.
 */

/**
 * Parse an ICS date/datetime string into an ISO-8601 string.
 * Handles both Zulu datetime (e.g. 20240115T130000Z) and date-only (e.g. 20240115).
 */
export function parseIcsDate(icstime) {
  const normalized = icstime.replace(/Z$/, '')
  const year   = normalized.slice(0, 4)
  const month  = normalized.slice(4, 6)
  const day    = normalized.slice(6, 8)
  const hour   = normalized.slice(9, 11) || '00'
  const minute = normalized.slice(11, 13) || '00'
  const second = normalized.slice(13, 15) || '00'
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`).toISOString()
}

/**
 * Parse an ICS text blob into an array of event objects.
 * Each event has: id, title, start (ISO), end (ISO, optional), description, location.
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
      const [key, ...rest] = rawLine.split(':')
      if (!key || rest.length === 0) continue
      const value = rest.join(':')
      if (key.startsWith('UID'))         event.id          = value.trim()
      if (key.startsWith('DTSTART'))     event.start       = value.trim()
      if (key.startsWith('DTEND'))       event.end         = value.trim()
      if (key.startsWith('SUMMARY'))     event.title       = value.trim()
      if (key.startsWith('DESCRIPTION')) event.description = value.trim().replace(/\\n/g, '\n')
      if (key.startsWith('LOCATION'))    event.location    = value.trim()
    }
    if (event.start) {
      event.start = parseIcsDate(event.start)
      if (event.end) event.end = parseIcsDate(event.end)
      event.title = event.title || 'Untitled event'
      event.id    = event.id    || `ics-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      eventsFromIcs.push(event)
    }
  }
  return eventsFromIcs
}
