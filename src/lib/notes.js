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

/* How the notes list is *viewed* — which tag groups are furled shut, and whether
   grouping is on at all. Deliberately device-local rather than synced: furling a
   group on your phone to fit more on screen says nothing about how you want the
   list to look on a laptop, and syncing it would make notes vanish on one device
   because of something you did on another. */
const FURL_KEY  = 'lv-notes-furled'
const GROUP_KEY = 'lv-notes-grouped'

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
 * Is there nothing in this note worth keeping?
 *
 * "Empty" is deliberately strict: a note with only a tag, a reminder, a link, or
 * a pasted image still holds something the user put there on purpose, and
 * throwing it away because the body happens to be blank would be a surprise.
 * What this catches is the note nobody wrote — the one created by pressing W or
 * New and then wandering off, which otherwise piles up in the list forever.
 *
 * Starred/pinned count as content for the same reason: they are deliberate.
 */
export function isNoteEmpty(note) {
  if (!note) return false
  if ((note.title ?? '').trim()) return false
  if (notePlainText(note.html)) return false
  if (noteHasImage(note.html)) return false
  if ((note.tags ?? []).length > 0) return false
  if (note.linkedTo) return false
  if (note.reminder) return false
  if (note.starred || note.pinned) return false
  return true
}

/**
 * Drop every untouched empty note. Pure — returns a new array.
 *
 * Trashed notes are left alone: Trash should show exactly what was thrown away,
 * and the 30-day retention already clears it out. See `purgeExpiredTrash`.
 */
export function dropEmptyNotes(notes) {
  return (notes ?? []).filter(n => n?.trashedAt || !isNoteEmpty(n))
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

/* ── Tags ─────────────────────────────────────────────────────────────────
 *
 * A tag is just a string on a note — there is no tag registry, and deliberately
 * so: a tag exists exactly as long as some note wears it, which means there is
 * never a list of empty tags to clean up. The cost is that "the same tag" has to
 * be decided by comparison rather than by id, so every function below matches
 * case-insensitively and the *first* casing seen wins for display. Type "Chem"
 * on one note and "chem" on the next and you get one group, not two.
 */

/** Trim a typed tag into its stored form. Returns '' for anything unusable. */
export function normalizeTag(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/^#+\s*/, '')   // "#chem" and "chem" are the same tag
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24)            // matches the maxLength on the editor's tag input
    .trim()                  // in case the cut landed mid-space
}

/** Do two tags refer to the same tag? */
export function sameTag(a, b) {
  return normalizeTag(a).toLowerCase() === normalizeTag(b).toLowerCase()
}

/** Does this note carry this tag? */
export function noteHasTag(note, tag) {
  return (note?.tags ?? []).some(t => sameTag(t, tag))
}

/**
 * Every tag in use, with how many notes wear it — sorted by name.
 *
 * Trashed notes are excluded by default: a tag whose only notes are in the bin
 * would otherwise keep offering a filter that shows nothing.
 */
export function collectTags(notes, { includeTrashed = false } = {}) {
  const byKey = new Map() // lowercase → { tag, count }
  for (const n of notes ?? []) {
    if (n?.trashedAt && !includeTrashed) continue
    // A note tagged ["chem", "Chem"] counts once for the group, not twice.
    const seenHere = new Set()
    for (const raw of n?.tags ?? []) {
      const tag = normalizeTag(raw)
      if (!tag) continue
      const key = tag.toLowerCase()
      if (seenHere.has(key)) continue
      seenHere.add(key)
      const entry = byKey.get(key)
      if (entry) entry.count += 1
      else byKey.set(key, { tag, count: 1 })
    }
  }
  return [...byKey.values()].sort((a, b) => a.tag.localeCompare(b.tag))
}

/** Add a tag to a note's tag list, or return the list unchanged if it's there. */
export function addTagTo(tags, tag) {
  const clean = normalizeTag(tag)
  const existing = tags ?? []
  if (!clean || existing.some(t => sameTag(t, clean))) return existing
  return [...existing, clean]
}

/** Remove a tag from a note's tag list. */
export function removeTagFrom(tags, tag) {
  return (tags ?? []).filter(t => !sameTag(t, tag))
}

/**
 * Does a note pass the active tag filter?
 *
 * Multiple selected tags are OR'd, not AND'd. Selecting "chem" and "bio" reads
 * as "show me both subjects" — the AND reading ("notes tagged with both") is the
 * rarer question, and with OR you can still get there by picking one tag and
 * searching. An empty filter matches everything.
 */
export function matchesTagFilter(note, selected) {
  if (!selected || selected.length === 0) return true
  return selected.some(tag => noteHasTag(note, tag))
}

/**
 * Stable identity for a group, used as the furl key in localStorage.
 *
 * Prefixed rather than being the bare tag so that the "no tags" bucket can never
 * be shadowed by someone who actually tags a note `untagged`.
 */
export const tagGroupKey = tag => `tag:${normalizeTag(tag).toLowerCase()}`
export const UNTAGGED_KEY = 'untagged:'

/**
 * Split notes into one group per tag, for the furlable list.
 *
 * A note with three tags appears in three groups — that is the point of grouping
 * by tag rather than filing each note in one folder, and it's why furling a
 * group hides a *view* of a note rather than the note itself. Untagged notes go
 * last, under a group with a null tag, so nothing can quietly disappear from the
 * list just because it was never tagged.
 *
 * Groups are ordered by tag name and each group's notes are sorted the same way
 * the flat list is (see `sortNotes`), so pinned notes stay at the top of the
 * group they're in.
 */
export function groupNotesByTag(notes) {
  const groups = new Map() // lowercase key → { key, tag, notes }
  const untagged = []

  for (const note of notes ?? []) {
    const tags = (note?.tags ?? []).map(normalizeTag).filter(Boolean)
    if (tags.length === 0) { untagged.push(note); continue }
    const seenHere = new Set()
    for (const tag of tags) {
      const key = tag.toLowerCase()
      if (seenHere.has(key)) continue // ["chem", "CHEM"] is one group, once
      seenHere.add(key)
      const group = groups.get(key)
      if (group) group.notes.push(note)
      else groups.set(key, { key: tagGroupKey(tag), tag, notes: [note] })
    }
  }

  const sorted = [...groups.values()]
    .sort((a, b) => a.tag.localeCompare(b.tag))
    .map(g => ({ ...g, notes: sortNotes(g.notes) }))

  if (untagged.length > 0) {
    sorted.push({ key: UNTAGGED_KEY, tag: null, notes: sortNotes(untagged) })
  }
  return sorted
}

/**
 * Fold the furled tags of an ordinary (ungrouped) list into single rows.
 *
 * This is the everyday way to use furling: you keep one list of all your notes,
 * and a tag you're not working on right now collapses into one row that sits
 * where its notes were, instead of costing you a screenful of scrolling. Group
 * mode is the stronger version — everything filed under a header — but you
 * shouldn't have to turn the whole list inside out just to get a tag out of the
 * way.
 *
 * Takes an already-sorted list and returns render items in that same order:
 *
 *   { type: 'note',   key, note }
 *   { type: 'bundle', key, tag, notes }   ← one row standing in for its notes
 *
 * A bundle is emitted at the position of the first note it swallows, so the
 * list doesn't reshuffle when you furl — the tag collapses in place.
 *
 * **Furling one tag folds away only what belongs to that tag alone.** A note
 * tagged `chem` *and* `lab` stays in the list while `lab` is still unfurled:
 * you furled one category, and taking a second category's notes with it would
 * make furling feel like it reaches further than you asked. Such a note folds
 * up once every tag it carries is furled, and is then listed once (under the
 * first of its bundles) but counted in each — every bundle reports what it is
 * actually standing in for.
 */
export function foldFurledTags(sortedNotes, furledKeys) {
  const notes  = sortedNotes ?? []
  const furled = new Set(furledKeys ?? [])
  const asRow  = note => ({ type: 'note', key: note.id, note })
  if (furled.size === 0) return notes.map(asRow)

  const tagKeysOf = note => {
    const keys = []
    for (const raw of note?.tags ?? []) {
      const tag = normalizeTag(raw)
      if (!tag) continue
      const key = tagGroupKey(tag)
      if (!keys.includes(key)) keys.push(key)
    }
    return keys
  }

  // A note folds away only when it has nowhere left to show: every one of its
  // tags is furled. An untagged note is never foldable.
  const foldedKeysOf = note => {
    const keys = tagKeysOf(note)
    return keys.length > 0 && keys.every(k => furled.has(k)) ? keys : []
  }

  // Counts first, so a bundle can state its size the moment it's emitted.
  const bundles = new Map() // key → { key, tag, notes }
  for (const note of notes) {
    for (const raw of note?.tags ?? []) {
      const tag = normalizeTag(raw)
      if (!tag) continue
      const key = tagGroupKey(tag)
      if (!furled.has(key) || !foldedKeysOf(note).includes(key)) continue
      const bundle = bundles.get(key)
      if (!bundle) bundles.set(key, { key, tag, notes: [note] })
      else if (!bundle.notes.includes(note)) bundle.notes.push(note)
    }
  }

  const items   = []
  const emitted = new Set()
  for (const note of notes) {
    const keys = foldedKeysOf(note)
    if (keys.length === 0) { items.push(asRow(note)); continue }
    for (const key of keys) {
      if (emitted.has(key)) continue
      emitted.add(key)
      items.push({ type: 'bundle', ...bundles.get(key) })
    }
  }
  return items
}

/** Which tag groups are furled. Device-local — furling is a view, not data. */
export function loadFurledTags() {
  try {
    const parsed = JSON.parse(localStorage.getItem(FURL_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(k => typeof k === 'string') : []
  } catch {
    return []
  }
}

export function saveFurledTags(keys) {
  try {
    localStorage.setItem(FURL_KEY, JSON.stringify([...(keys ?? [])]))
  } catch {}
}

/** Whether the list is grouped by tag. Also device-local, same reasoning. */
export function loadTagGrouping() {
  try {
    return localStorage.getItem(GROUP_KEY) === '1'
  } catch {
    return false
  }
}

export function saveTagGrouping(on) {
  try {
    localStorage.setItem(GROUP_KEY, on ? '1' : '0')
  } catch {}
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
