/**
 * Two schedule entries, one class.
 *
 * A lab or studio period meets at a different hour than the lecture it belongs to, and
 * the schedule has always been one entry per meeting pattern — so "Organic Chemistry"
 * and "Organic Chemistry Lab" had to be typed in twice. That is correct on the
 * calendar, where they really are two blocks at two times, and wrong everywhere the app
 * asks *which class is this for*: two chips in the task filter, two entries in the
 * category picker, two cards in My Classes, two places to keep one reminder rule, and
 * a term's coursework split down the middle depending on which one you happened to
 * pick.
 *
 * So a section can be declared part of another: the child stores
 * `linkedToClassId: '<parent id>'` on its own entry. Being JSONB, that needed no
 * migration.
 *
 * ## Nothing is rewritten
 *
 * Linking does not touch a single task, event, note or exam. The child keeps its own
 * id, its own meeting times, its own exceptions; tasks already filed under
 * `class:<child>` keep exactly that category. What changes is how a class id is *read*:
 * everything that groups by class first resolves the id to the parent, so the two
 * sections' work lands in one pile.
 *
 * That is what makes the merge safe. There is no half-migrated state to recover from, a
 * bad link is one field to clear, and unlinking puts both halves back exactly as they
 * were — including the tasks, which never moved. Rewriting `category` on every affected
 * task would have been a bulk write across two synced tables that could not be undone
 * once the two sets were indistinguishable.
 *
 * ## Which way the arrow points
 *
 * The child names the parent, not the other way around. A parent with a list of
 * children would need that list kept in step when a child is deleted on another
 * device — the classic two-records-of-one-fact problem the rest of this app avoids.
 * One field on one side cannot disagree with itself, and a link whose target is gone is
 * simply not a link (see `buildClassLinks`).
 *
 * ## When a link is honoured
 *
 * Only when the parent is present, not deleted, and not disabled. The last one matters:
 * `classCategories` omits disabled classes from the picker, so honouring a link into a
 * class you have switched off would resolve a live section's tasks onto a category that
 * is not offered anywhere — the work would have no home. A section whose parent is
 * switched off falls back to standing on its own, which is where it started.
 */

/** How far a chain of links is followed before it is treated as broken. */
const MAX_DEPTH = 8

/** The class this entry declares itself part of, or null. */
export function linkedParentId(cls) {
  const raw = cls?.linkedToClassId
  if (raw == null || raw === '') return null
  const id = String(raw)
  // A class cannot be a section of itself. Storing that is not a state to model, it is
  // a typo, and treating it as a link would make the class its own parent forever.
  return id === String(cls?.id ?? '') ? null : id
}

/**
 * The link structure of a whole schedule.
 *
 * Returns `parentOf` (child id → the id of the class it merges into) and `childrenOf`
 * (parent id → its section ids, in the order they read). Both keyed by string id.
 *
 * Every stored link is re-validated rather than trusted, because the ways one can go
 * bad are all reachable without anybody doing anything strange:
 *
 *   - the parent was deleted, or deleted on another device and synced
 *   - the parent was disabled (see the note at the top of this file)
 *   - A names B and B names A, from two edits racing on two devices
 *   - a chain — A → B → C — which is legitimate to *store* but has one answer,
 *     so it is flattened onto the root rather than followed at every read site
 *
 * A link that fails any of these is dropped, leaving the class standing on its own.
 * That is the safe direction to fail: an unmerged section shows its own work under its
 * own name, which is the behaviour that existed before links did.
 */
export function buildClassLinks(classes = []) {
  const byId = new Map()
  for (const c of classes ?? []) {
    if (c?.id != null) byId.set(String(c.id), c)
  }

  /** Can this class be merged *into*? Deliberately stricter than "it exists". */
  const usableParent = cls => !!cls && !cls.deletedAt && cls.enabled !== false

  const parentOf = new Map()

  for (const cls of byId.values()) {
    const id = String(cls.id)
    if (cls.deletedAt) continue

    // Walk up to the root, so a chain resolves in one hop at every read site.
    const seen = new Set([id])
    let cursor = cls
    let root   = null

    for (let depth = 0; depth < MAX_DEPTH; depth++) {
      const nextId = linkedParentId(cursor)
      if (!nextId) break
      if (seen.has(nextId)) { root = null; break }   // a cycle links to nothing
      const next = byId.get(nextId)
      if (!usableParent(next)) break                 // gone, deleted or switched off
      seen.add(nextId)
      cursor = next
      root   = nextId
    }

    if (root && root !== id) parentOf.set(id, root)
  }

  const childrenOf = new Map()
  for (const [childId, rootId] of parentOf) {
    if (!childrenOf.has(rootId)) childrenOf.set(rootId, [])
    childrenOf.get(rootId).push(childId)
  }
  // Alphabetical by name so the sections under a class read in a stable order rather
  // than in whatever order they were typed in.
  const nameOf = id => byId.get(id)?.courseName ?? ''
  for (const list of childrenOf.values()) {
    list.sort((a, b) => nameOf(a).localeCompare(nameOf(b)) || a.localeCompare(b))
  }

  return { parentOf, childrenOf }
}

/**
 * `buildClassLinks`, memoised on the array it was given.
 *
 * The link structure is read from a dozen places — every task row that needs a category
 * chip, among them — and rebuilding it per row would be the same map built fifty times
 * per render. A WeakMap keyed on the classes array is enough because that array is
 * itself memoised upstream: it changes identity exactly when the schedule changes,
 * which is exactly when this is stale.
 */
const CACHE = new WeakMap()

export function classLinksFor(classes) {
  if (!Array.isArray(classes)) return buildClassLinks([])
  const hit = CACHE.get(classes)
  if (hit) return hit
  const links = buildClassLinks(classes)
  CACHE.set(classes, links)
  return links
}

/** The id the class's work should be grouped under — itself, unless it is a section. */
export function canonicalClassId(links, classId) {
  if (classId == null) return null
  const id = String(classId)
  return links?.parentOf?.get(id) ?? id
}

/** Is this class a section of another one? */
export function isLinkedSection(links, classId) {
  return classId != null && !!links?.parentOf?.get(String(classId))
}

/** Does this class have sections merged into it? */
export function hasLinkedSections(links, classId) {
  return (links?.childrenOf?.get(String(classId ?? '')) ?? []).length > 0
}

/** Just the section ids merged into this class. */
export function linkedSectionIds(links, classId) {
  return links?.childrenOf?.get(String(classId ?? '')) ?? []
}

/**
 * Every class id that counts as this class: itself first, then its sections.
 *
 * The parent leads because it is the one whose name, colour and reminder rules the
 * merged class wears. Callers that look something up per section (notes, Canvas
 * courses, meeting times) iterate this rather than reasoning about the link map.
 */
export function sectionIds(links, classId) {
  if (classId == null) return []
  const id = String(classId)
  // Asked about a child, answer about the class it belongs to — there is only one
  // merged class here, and it should not matter which half you had a handle on.
  const root = canonicalClassId(links, id)
  return [root, ...linkedSectionIds(links, root)]
}

/** The class entries for `sectionIds`, in the same order, skipping any that are gone. */
export function sectionsOf(classes = [], classId) {
  const links = classLinksFor(classes)
  const byId  = new Map((classes ?? []).filter(c => c?.id != null).map(c => [String(c.id), c]))
  return sectionIds(links, classId).map(id => byId.get(id)).filter(Boolean)
}

/**
 * Resolve a `class:<id>` category onto the class it now merges into.
 *
 * Anything else — an ordinary stored category, an empty value — is handed back
 * untouched, so this can sit in front of every category read without a special case.
 * Kept here rather than in `classCategories.js` to avoid an import cycle: that module
 * needs this one to know which classes to omit.
 */
const CLASS_PREFIX = 'class:'

export function canonicalCategoryId(links, categoryId) {
  if (typeof categoryId !== 'string' || !categoryId.startsWith(CLASS_PREFIX)) return categoryId
  const id = categoryId.slice(CLASS_PREFIX.length)
  if (!id) return categoryId
  return `${CLASS_PREFIX}${canonicalClassId(links, id)}`
}

/**
 * Why `child` cannot be made a section of `parent`, in a sentence, or null if it can.
 *
 * The message is the UI's — a disabled picker option with no reason beside it is the
 * kind of dead end that makes a feature feel broken — so each is written to be read.
 */
export function linkabilityError(classes = [], childId, parentId) {
  if (childId == null || parentId == null) return 'Pick a class to link to.'
  const child  = String(childId)
  const parent = String(parentId)
  if (child === parent) return 'A class cannot be a section of itself.'

  const byId = new Map((classes ?? []).filter(c => c?.id != null).map(c => [String(c.id), c]))
  const target = byId.get(parent)
  if (!target || target.deletedAt) return 'That class no longer exists.'
  if (target.enabled === false)    return 'That class is switched off. Turn it back on to link a section to it.'

  const links = buildClassLinks(classes)

  // Linking to a section rather than to the class itself. Allowed by the resolver —
  // it flattens the chain — but naming the parent is what the user means, and saying
  // so is better than silently doing something slightly different.
  const targetParent = links.parentOf.get(parent)
  if (targetParent) {
    const name = byId.get(targetParent)?.courseName || 'the main class'
    return `That is already a section of ${name}. Link to ${name} instead.`
  }

  // The child already has sections of its own. Allowing this would quietly re-parent
  // them one level up, which is a bigger change than the one being asked for.
  if (hasLinkedSections(links, child)) {
    return 'This class already has sections linked to it. Unlink those first.'
  }

  return null
}

/** The classes that could legally be `cls`'s parent, for the picker. */
export function linkCandidates(classes = [], cls) {
  const childId = cls?.id
  if (childId == null) return []
  return (classes ?? [])
    .filter(c => c?.id != null)
    .filter(c => linkabilityError(classes, childId, c.id) === null)
    .sort((a, b) => (a.courseName ?? '').localeCompare(b.courseName ?? ''))
}

/**
 * Link `child` into `parent`, returning the next schedule array.
 *
 * The child also adopts the parent's colour. The two sections are now one class
 * everywhere else in the app, and leaving the lab a different colour on the calendar
 * would be the one place still insisting they are two — the colour is what identifies a
 * class in a week view, before any text is read. It is an ordinary field afterwards, so
 * it can be changed back.
 */
export function linkClasses(classes = [], childId, parentId) {
  const parent = (classes ?? []).find(c => String(c?.id) === String(parentId))
  return (classes ?? []).map(c => (
    String(c?.id) === String(childId)
      ? { ...c, linkedToClassId: String(parentId), color: parent?.color || c.color }
      : c
  ))
}

/** Stand this section back on its own. Its colour stays as it is — it is now its own. */
export function unlinkClass(classes = [], childId) {
  return (classes ?? []).map(c => (
    String(c?.id) === String(childId) ? { ...c, linkedToClassId: null } : c
  ))
}

/**
 * Clear links pointing at a class that is being deleted.
 *
 * `buildClassLinks` already ignores a link whose target is gone, so this is not what
 * makes deletion safe — it is housekeeping. Without it the dead id sits in the child's
 * row and syncs forever, and if a new class were ever minted with that id the link
 * would come back to life pointing somewhere nobody chose.
 */
export function clearLinksTo(classes = [], deletedId) {
  const gone = String(deletedId)
  return (classes ?? []).map(c => (
    linkedParentId(c) === gone ? { ...c, linkedToClassId: null } : c
  ))
}
