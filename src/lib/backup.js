/**
 * What a full backup contains.
 *
 * The JSON export started as events + tasks + categories, gained notes, then gained
 * the class schedule when it turned out a "backup" had never contained one. That is
 * three times the same bug, so the answer is a list in one place rather than a fourth
 * hand-written object literal.
 *
 * Two kinds of thing live in a backup, and they restore differently:
 *
 *   **Collections** are arrays of records with ids. They merge — new records are
 *   added, and a record you already have raises the duplicate prompt.
 *
 *   **Settings** are single blobs keyed by something other than an id: which
 *   calendars are hidden, what colour each course is, how many credits a course is
 *   worth. Merging those record-by-record is meaningless, so they are restored
 *   wholesale over what is there.
 */

/** Bumped whenever the shape gains a key. Readers below tolerate every older one. */
export const BACKUP_VERSION = 3

/**
 * Every collection that belongs in a backup, in the order they are summarised.
 *
 * `key` is the payload field; `label` is what the import summary calls it.
 * These are the same collections `SYNC_KEYS` pushes to the server, minus `eventPrefs`,
 * which is a settings blob rather than a list — see below.
 */
export const BACKUP_COLLECTIONS = [
  { key: 'events',          label: 'Events' },
  { key: 'todos',           label: 'Tasks' },
  { key: 'todoCategories',  label: 'Task categories' },
  { key: 'eventCategories', label: 'Event categories' },
  { key: 'notes',           label: 'Notes' },
  { key: 'classSchedule',   label: 'Classes' },
  { key: 'customLists',     label: 'Lists' },
  { key: 'studySessions',   label: 'Study sessions' },
]

/** localStorage blobs that are settings rather than records. */
export const PREF_KEYS = {
  canvas: 'lv-canvas-prefs',
  google: 'lv-google-prefs',
  gpa:    'lv-gpa',
}

/**
 * Fields stripped on the way out.
 *
 * `icsUrl` is a Canvas *calendar feed* URL — a capability, not a preference. Anyone
 * holding it can read your Canvas calendar without logging in as you, and a backup
 * file is exactly the sort of thing that gets emailed to yourself or dropped in a
 * shared folder. Everything else in that blob (course colours, which courses are
 * shown) is harmless and is kept.
 *
 * The cost is that restoring onto a new device means pasting the feed URL again,
 * which is a fair trade for a file that cannot leak read access to your calendar.
 */
export const REDACTED_PREF_FIELDS = {
  canvas: ['icsUrl'],
}

/**
 * Deliberately absent, so nobody has to rediscover why:
 *
 *   lv-canvas-assignments / -cal-events / -ics-events   caches of live Canvas data,
 *     refetched on load. Backing them up preserves a stale copy that the next sync
 *     overwrites anyway.
 *   lv-canvas-seen-ids                                  which assignments have already
 *     been announced. Restoring it would re-announce, or wrongly silence, a term of work.
 *   corvus-nudge-dismissed                              today's dismissal. Meaningless
 *     tomorrow, let alone on another device.
 *
 * The Canvas API token is not here either — it never touches localStorage; it lives
 * server-side in `canvas_credentials`.
 */
export const NOT_BACKED_UP = [
  'lv-canvas-assignments', 'lv-canvas-cal-events', 'lv-canvas-ics-events',
  'lv-canvas-seen-ids', 'corvus-nudge-dismissed',
]

function parseJson(raw, fallback) {
  if (!raw) return fallback
  try {
    const value = JSON.parse(raw)
    return value && typeof value === 'object' ? value : fallback
  } catch {
    return fallback
  }
}

/** The settings blobs, read from storage and stripped of anything sensitive. */
export function readLocalPrefs(storage) {
  const out = {}
  for (const [name, key] of Object.entries(PREF_KEYS)) {
    const value = parseJson(storage?.getItem?.(key), null)
    if (!value) continue
    const stripped = { ...value }
    for (const field of REDACTED_PREF_FIELDS[name] ?? []) delete stripped[field]
    if (Object.keys(stripped).length > 0) out[name] = stripped
  }
  return out
}

/**
 * Restore settings blobs.
 *
 * Merged over what is there by default, so a redacted field survives: restoring must
 * not wipe the Canvas feed URL on a device that has one, purely because the file was
 * written without it.
 *
 * `replace` is for a full restore, and drops anything the file did not mention — with
 * one exception, which is the same one. A redacted field is absent because *we*
 * removed it on the way out, not because the user cleared it, so deleting their feed
 * URL as a side effect of protecting it would be the worst of both. Replace therefore
 * means "everything the file was allowed to carry".
 */
export function applyLocalPrefs(prefs, storage, { replace = false } = {}) {
  if (!prefs || typeof prefs !== 'object') return
  for (const [name, key] of Object.entries(PREF_KEYS)) {
    const incoming = prefs[name]
    if (!incoming || typeof incoming !== 'object') continue
    const existing = parseJson(storage?.getItem?.(key), {})

    let next
    if (replace) {
      next = { ...incoming }
      for (const field of REDACTED_PREF_FIELDS[name] ?? []) {
        if (existing[field] !== undefined) next[field] = existing[field]
      }
    } else {
      next = { ...existing, ...incoming }
    }

    try {
      storage?.setItem?.(key, JSON.stringify(next))
    } catch {
      // A full or blocked storage is not a reason to abandon the rest of the restore.
    }
  }
}

/** Assemble the file. `collections` is keyed by the names in BACKUP_COLLECTIONS. */
export function buildBackup({ collections = {}, eventPrefs = {}, prefs = {}, exportedAt } = {}) {
  const data = { version: BACKUP_VERSION, exportedAt }
  for (const { key } of BACKUP_COLLECTIONS) {
    data[key] = Array.isArray(collections[key]) ? collections[key] : []
  }
  data.eventPrefs  = eventPrefs && typeof eventPrefs === 'object' ? eventPrefs : {}
  data.preferences = prefs && typeof prefs === 'object' ? prefs : {}
  return data
}

/**
 * Read a backup of any version into a predictable shape.
 *
 * Every collection comes back as an array and every blob as an object, so callers
 * never branch on the file's age. A key an older file does not have reads as empty —
 * which is what lets a v1 file restore exactly as it used to.
 */
export function readBackup(parsed) {
  const collections = {}
  const present = []
  for (const { key } of BACKUP_COLLECTIONS) {
    const has = Array.isArray(parsed?.[key])
    collections[key] = has ? parsed[key] : []
    if (has) present.push(key)
  }
  return {
    version:     Number(parsed?.version) || 1,
    collections,
    /* Which collections the file actually carried, as opposed to the ones defaulted
       to empty above. A full restore must only clear what the file has an opinion
       about — wiping your classes because an ICS import, or a backup written before
       classes existed, says nothing about them would be data loss dressed as a
       restore. */
    present,
    // `undefined` rather than `{}` is meaningful for these two: it is the difference
    // between "the file says you have no hidden events" and "the file has nothing to
    // say about hidden events", and only the first should overwrite what you have.
    eventPrefs:  parsed?.eventPrefs  && typeof parsed.eventPrefs  === 'object' ? parsed.eventPrefs  : undefined,
    preferences: parsed?.preferences && typeof parsed.preferences === 'object' ? parsed.preferences : undefined,
  }
}

/** Does this file look like one of ours at all? */
export function looksLikeBackup(parsed) {
  if (!parsed || typeof parsed !== 'object') return false
  return BACKUP_COLLECTIONS.some(({ key }) => Array.isArray(parsed[key])) ||
         !!parsed.eventPrefs || !!parsed.preferences
}
