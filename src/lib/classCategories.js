/**
 * Your classes, usable as task categories.
 *
 * Tasks already had a category (Academic / Personal / …) and, separately, an optional
 * link to a class. Neither answers "show me everything for Physics" on its own: the
 * category is too coarse, and the class link was a chip on the row rather than
 * something the list could be filtered or grouped by.
 *
 * So the schedule contributes categories. They are **derived, never stored** — a class
 * category is computed from the schedule every render, which is what keeps it correct
 * for free: rename a class and the category renames, disable one and it disappears
 * from the picker. Copying them into `todoCategories` would mean two records of the
 * same fact, drifting apart the moment either changed, and syncing the copy for no
 * reason.
 *
 * The stored side is untouched: a task filed under a class keeps `class:<id>` in its
 * ordinary `category` field, so filtering, grouping and colouring all work with no
 * special case. Only the *options list* is assembled here.
 *
 * A section linked into another class contributes no category of its own — one class,
 * one option, which is the whole point of linking. Its existing tasks still resolve,
 * through `canonicalCategoryId`; see `classLinks.js`.
 */

import {
  classLinksFor, isLinkedSection, hasLinkedSections, linkedSectionIds, canonicalCategoryId,
} from '@/lib/classLinks'

/** Namespaced so a class id can never collide with a user-made category id. */
export const CLASS_PREFIX = 'class:'

export function classCategoryId(classId) {
  return `${CLASS_PREFIX}${classId}`
}

export function isClassCategoryId(categoryId) {
  return typeof categoryId === 'string' && categoryId.startsWith(CLASS_PREFIX)
}

/** The class id inside a category id, or null if it isn't one. */
export function classIdFromCategoryId(categoryId) {
  if (!isClassCategoryId(categoryId)) return null
  const id = categoryId.slice(CLASS_PREFIX.length)
  return id || null
}

/**
 * Derive a category per class currently on the schedule.
 *
 * Disabled classes are left out: they are already hidden from the calendar, and
 * offering to file new work under a class you have switched off is noise. Tasks
 * already filed under one keep their category — see `findCategory`.
 *
 * A linked section is left out for a different reason: it is not a class of its own any
 * more. Offering both "Organic Chemistry" and "Organic Chemistry Lab" is precisely the
 * redundancy linking removes, and its `sectionIds` are carried on the surviving option
 * so callers that need to match a stored `class:<section>` category have them.
 */
export function classCategories(canvasClasses = []) {
  const links = classLinksFor(canvasClasses)
  return (canvasClasses ?? [])
    .filter(c => c?.id && c.enabled !== false && !c.deletedAt)
    .filter(c => !isLinkedSection(links, c.id))
    .map(c => ({
      id:         classCategoryId(c.id),
      label:      c.courseName || 'Class',
      color:      c.color || '#3a6fa8',
      isClass:    true,
      classId:    c.id,
      sectionIds: hasLinkedSections(links, c.id) ? linkedSectionIds(links, c.id) : undefined,
    }))
}

/**
 * The full option list: what the user made, then what the schedule contributes.
 *
 * Stored categories win a collision. That can only happen if someone hand-crafted an
 * id starting with `class:`, but silently shadowing their category would be the worse
 * of the two outcomes.
 */
export function mergeCategories(stored = [], derived = []) {
  const seen = new Set((stored ?? []).map(c => c?.id))
  return [...(stored ?? []), ...(derived ?? []).filter(c => !seen.has(c.id))]
}

/**
 * Look up the category a task is filed under.
 *
 * Returns null when it cannot be resolved, which happens legitimately: a class that
 * was deleted or disabled leaves its tasks pointing at a category that no longer
 * exists. The row then renders without a category chip rather than breaking — the same
 * thing an unrecognised stored category has always done.
 */
export function findCategory(categories = [], categoryId) {
  if (!categoryId) return null
  return (categories ?? []).find(c => c?.id === categoryId) ?? null
}

/**
 * `findCategory`, but a `class:<section>` category resolves onto the class it merges
 * into — so a task filed under the lab before it was linked still shows the lecture's
 * chip, in the lecture's colour, instead of losing its category the moment the two
 * became one class.
 *
 * Takes the schedule rather than a prepared link map so a caller with a task and a
 * class list needs nothing else. `classLinksFor` memoises, so this is a map lookup
 * after the first call per schedule.
 */
export function findCategoryForClasses(categories = [], categoryId, canvasClasses = []) {
  if (!categoryId) return null
  const direct = findCategory(categories, categoryId)
  if (direct) return direct
  if (!isClassCategoryId(categoryId)) return null
  return findCategory(categories, canonicalCategoryId(classLinksFor(canvasClasses), categoryId))
}
