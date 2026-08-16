/**
 * Notes — localStorage helpers + cloud-merge logic.
 *
 * Mirrors the shape and conventions of lib/customLists.js so the sync route,
 * page.js state wiring, and import/export all follow one familiar pattern.
 *
 * Shape of a note:
 *   {
 *     id,                  // 'note-<ts>-<rand>'
 *     title,               // string ('' means "derive from body")
 *     html,                // Tiptap-produced HTML (sanitized on read)
 *     color,               // hex accent for the note card
 *     starred,             // bool — user favorite
 *     pinned,              // bool — sorts to the top, independent of starred
 *     tags,                // string[]
 *     linkedTo,            // { type: 'course'|'event'|'todo', id, label } | null
 *     reminder,            // { at: ISO, label } | null   (absolute time only)
 *     trashedAt,           // ISO string | null — soft delete
 *     createdAt,           // ISO
 *     updatedAt,           // ISO
 *   }
 *
 * Notes are stored as HTML rather than markdown because the editor is Tiptap.
 * Nothing else in the app ever renders that HTML as markup except NoteEditor
 * (through Tiptap's own parser, which drops unknown nodes) and the read-only
 * preview below, which strips to plain text. See `notePlainText`.
 *
 * localStorage key: 'lv-notes'
 */

const LS_KEY = 'lv-notes'

/** Notes older than this in the trash are purged on load. */
export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export function loadNotes() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? purgeExpiredTrash(parsed) : []
  } catch {
    return []
  }
}

export function saveNotes(notes) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(notes))
  } catch {}
}

/** Drop trashed notes past the retention window. Pure — returns a new array. */
export function purgeExpiredTrash(notes, now = Date.now()) {
  return (notes ?? []).filter(n => {
    if (!n?.trashedAt) return true
    const t = new Date(n.trashedAt).getTime()
    if (Number.isNaN(t)) return true
    return now - t < TRASH_RETENTION_MS
  })
}

/**
 * Merge cloud notes into local notes — newest `updatedAt` wins per note id.
 *
 * Unlike custom lists (where "local wins" is safe because items are additive),
 * a note's body is a single blob: last-write-wins on the timestamp is the only
 * merge that doesn't silently discard edits made on another device.
 */
export function mergeNotes(cloudNotes, localNotes) {
  return mergeBy(cloudNotes, localNotes, (cloud, local) => {
    const ct = new Date(cloud.updatedAt ?? 0).getTime() || 0
    const lt = new Date(local.updatedAt ?? 0).getTime() || 0
    return ct > lt ? cloud : local
  })
}

/** Cloud-wins merge (for an explicit "pull from cloud" action). */
export function mergeNotesCloudWins(cloudNotes, localNotes) {
  return mergeBy(cloudNotes, localNotes, cloud => cloud)
}

function mergeBy(cloudNotes, localNotes, pick) {
  const cloudMap = Object.fromEntries((cloudNotes ?? []).filter(n => n?.id).map(n => [n.id, n]))
  const localMap = Object.fromEntries((localNotes ?? []).filter(n => n?.id).map(n => [n.id, n]))
  const allIds   = new Set([...Object.keys(cloudMap), ...Object.keys(localMap)])

  return [...allIds].map(id => {
    const cloud = cloudMap[id]
    const local = localMap[id]
    if (!local) return cloud
    if (!cloud) return local
    return pick(cloud, local)
  })
}

export function makeNote(overrides = {}) {
  const now = new Date().toISOString()
  return {
    id:        `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title:     '',
    html:      '',
    color:     '#3a6fa8',
    starred:   false,
    pinned:    false,
    tags:      [],
    linkedTo:  null,
    reminder:  null,
    trashedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

/**
 * Flatten a note's HTML to plain text for previews, search, and export.
 *
 * Deliberately regex-based rather than DOM-based so it works identically on the
 * server (the reminder cron builds notification bodies from this) and in tests.
 * Block-level tags become newlines so a bullet list doesn't collapse into one
 * run-on line.
 */
export function notePlainText(html) {
  if (!html) return ''
  return String(html)
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/blockquote)\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** The title to show for a note: explicit title, else first line of the body. */
export function noteDisplayTitle(note) {
  const explicit = (note?.title ?? '').trim()
  if (explicit) return explicit
  const firstLine = notePlainText(note?.html).split('\n')[0]?.trim()
  return firstLine ? firstLine.slice(0, 80) : 'Untitled note'
}

/** Does this note's body contain at least one image? */
export function noteHasImage(html) {
  return /<img\b/i.test(String(html ?? ''))
}

/**
 * One-line preview of the body, excluding whatever became the title.
 *
 * A note that is nothing but a pasted screenshot flattens to an empty string,
 * which would render as a blank card indistinguishable from an empty note. Saying
 * "Image" is the honest summary of what is actually in there.
 */
export function notePreview(note, max = 140) {
  const text = notePlainText(note?.html)
  const body = (note?.title ?? '').trim()
    ? text
    : text.split('\n').slice(1).join(' ')
  const flat = body.replace(/\s+/g, ' ').trim()
  if (!flat) return noteHasImage(note?.html) ? 'Image' : ''
  return flat.length > max ? flat.slice(0, max) + '…' : flat
}

/**
 * Sort order for the notes list: pinned first, then starred, then most
 * recently updated. Trashed notes are expected to be filtered out beforehand.
 */
export function sortNotes(notes) {
  return [...(notes ?? [])].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
    if (!!a.starred !== !!b.starred) return a.starred ? -1 : 1
    return (new Date(b.updatedAt ?? 0).getTime() || 0) - (new Date(a.updatedAt ?? 0).getTime() || 0)
  })
}

/** Does this note match a free-text query? Searches title, body, and tags. */
export function noteMatches(note, query) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    noteDisplayTitle(note).toLowerCase().includes(q) ||
    notePlainText(note.html).toLowerCase().includes(q) ||
    (note.tags ?? []).some(t => t.toLowerCase().includes(q))
  )
}

/** Escape text that's about to be embedded in a note's HTML body. */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Convert plain text (from an Android share, a paste, etc.) into note HTML.
 *
 * Blank lines become paragraph breaks and single newlines become <br>, which is
 * what Tiptap would produce for the same text. The input is untrusted — a
 * shared page title can contain anything — so it's escaped before any markup is
 * added, not after.
 */
export function sharedTextToHtml(text) {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) return ''
  return trimmed
    .split(/\r?\n\s*\r?\n/)
    .map(para => `<p>${escapeHtml(para).replace(/\r?\n/g, '<br>')}</p>`)
    .join('')
}
