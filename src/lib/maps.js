/**
 * Turning a free-text location into a "get me there" link.
 *
 * Locations in this app are whatever the user (or Google, or Canvas) typed — "Room 204,
 * Tech Hall", "Zoom", "https://meet.google.com/abc-defg-hij", "TBD". Only some of those
 * are places, so the caller needs to know *what kind* of thing it is holding before it
 * decides what button to draw. `describeLocation` answers that; `mapsUrl` builds the
 * link for the one case that is actually a place.
 */

/** Values that mean "there is no location here", typed where a location was expected. */
const PLACEHOLDERS = new Set(['tbd', 'tba', 'n/a', 'na', 'none', '-', '--', 'unknown'])

/**
 * Words that mean the class meets online. A room number would be actively misleading
 * as a map pin, and sending "Zoom" to Google Maps returns the company's head office in
 * San Jose — a confidently wrong answer, which is worse than no button at all.
 */
const ONLINE_WORDS = [
  'online', 'remote', 'virtual', 'zoom', 'teams', 'google meet', 'meet.google',
  'webex', 'skype', 'discord', 'asynchronous', 'async', 'canvas conference',
]

/**
 * A bare URL, or something close enough to one that treating it as text would be
 * unhelpful. Matches `https://…`, `www.…`, and `meet.google.com/…` style values.
 */
function extractUrl(raw) {
  const trimmed = raw.trim()
  // A location field can be "Room 4 — https://zoom.us/j/123"; take the first URL in it.
  const match = trimmed.match(/\b(?:https?:\/\/|www\.)[^\s<>"']+/i)
  if (match) {
    const url = match[0]
    return url.toLowerCase().startsWith('http') ? url : `https://${url}`
  }
  // Bare conferencing hostnames, which people paste without the scheme.
  const bare = trimmed.match(/\b(?:meet\.google\.com|zoom\.us|teams\.microsoft\.com)\/[^\s<>"']+/i)
  return bare ? `https://${bare[0]}` : null
}

/**
 * Classify a location string.
 *
 * Returns `{ kind, text, url }` where kind is:
 *   'empty'  — nothing usable; render no location row at all
 *   'online' — a meeting, not a place; render as plain text (with `url` if one was found)
 *   'link'   — a URL and nothing map-like; render an "Open link" action
 *   'place'  — render the Google Maps action, `url` is the maps link
 */
export function describeLocation(raw) {
  if (typeof raw !== 'string') return { kind: 'empty', text: '', url: null }

  const text = raw.trim().replace(/\s+/g, ' ')
  if (!text) return { kind: 'empty', text: '', url: null }
  if (PLACEHOLDERS.has(text.toLowerCase())) return { kind: 'empty', text, url: null }

  const url    = extractUrl(text)
  const lower  = text.toLowerCase()
  const online = ONLINE_WORDS.some(w => lower.includes(w))

  // Online wins over link: "Zoom — https://zoom.us/j/1" is a meeting, and the join
  // link is the useful action, not a map.
  if (online) return { kind: 'online', text, url }
  if (url)    return { kind: 'link',   text, url }

  return { kind: 'place', text, url: mapsUrl(text) }
}

/**
 * Google Maps search URL for a place.
 *
 * The `?api=1&query=` search form is used rather than a `q=`/coordinate deep link
 * because it is the documented, stable entry point and — importantly on mobile — it
 * hands off to the installed Maps app instead of opening the web map in a tab.
 * A room-level string like "Room 204, Tech Hall" still resolves usefully: Maps falls
 * back to the building when it cannot pin the room.
 *
 * Returns null for anything `describeLocation` would not call a place, so callers
 * cannot accidentally build a link to "TBD".
 */
export function mapsUrl(raw) {
  if (typeof raw !== 'string') return null
  const text = raw.trim().replace(/\s+/g, ' ')
  if (!text || PLACEHOLDERS.has(text.toLowerCase())) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}`
}

/** True when a location is worth offering a map for. */
export function isMappable(raw) {
  return describeLocation(raw).kind === 'place'
}
