/**
 * Teaching Corvus which categories actually exist.
 *
 * The task tool advertised `'One of: academic, personal, work, health'` — the four
 * defaults, hardcoded. So Corvus could not file a task under a category you made, and
 * once classes became categories it could not tag a task with a class either: it had
 * never been told they existed.
 *
 * Two halves. `describeCategories` builds the tool description from the real list, so
 * the model is told the truth. `resolveCategory` checks what comes back, because a
 * model handed a list of ids will occasionally return a label, a near-miss, or
 * something invented — and a category id that resolves to nothing renders as a task
 * with no category at all, which is a silent wrong answer rather than a visible one.
 */

import { CLASS_PREFIX, isClassCategoryId } from '@/lib/classCategories'

/** Cap on how many categories are named in the tool description. */
const MAX_LISTED = 40

/**
 * The `category` parameter description, naming every real option.
 *
 * Class categories are spelled out as `id (Course Name)` because the id is opaque —
 * `class:cls_1724…` tells the model nothing on its own, and pairing it with the course
 * name is what lets "add a task for Physics" land on the right one.
 */
export function describeCategories(categories = []) {
  const list = (categories ?? []).filter(c => c?.id).slice(0, MAX_LISTED)
  if (list.length === 0) return 'Category id for the task.'

  const own     = list.filter(c => !isClassCategoryId(c.id))
  const classes = list.filter(c => isClassCategoryId(c.id))

  const parts = []
  if (own.length) {
    parts.push(`One of: ${own.map(c => c.id).join(', ')}`)
  }
  if (classes.length) {
    parts.push(
      'To file a task under a class, use its category id: ' +
      classes.map(c => `${c.id} (${c.label})`).join(', ') +
      '. Prefer the class when the task clearly belongs to one of these courses.',
    )
  }
  return parts.join('. ')
}

/** Loose comparison — case and surrounding space should never decide a match. */
function norm(value) {
  return String(value ?? '').trim().toLowerCase()
}

/**
 * Map whatever the model returned onto a real category id, or null.
 *
 * Tried in order of how much it proves:
 *   1. an exact id — what we asked for
 *   2. a label, case-insensitively — "Physics 101" instead of the id
 *   3. a class name with the prefix bolted on — "class:Physics 101"
 *
 * Returning null rather than guessing further is deliberate: the preview card is shown
 * to the user before anything is saved, and an empty category reads as "it didn't
 * pick one", while a wrong one reads as a decision.
 */
export function resolveCategory(value, categories = []) {
  const list = (categories ?? []).filter(c => c?.id)
  if (!value || list.length === 0) return null

  const raw = String(value).trim()

  const byId = list.find(c => c.id === raw)
  if (byId) return byId.id

  const byLabel = list.find(c => norm(c.label) === norm(raw))
  if (byLabel) return byLabel.id

  // "class:Physics 101" — the prefix understood, the id part guessed.
  if (raw.startsWith(CLASS_PREFIX)) {
    const name = raw.slice(CLASS_PREFIX.length)
    const byClassName = list.find(c => isClassCategoryId(c.id) && norm(c.label) === norm(name))
    if (byClassName) return byClassName.id
  }

  return null
}

/**
 * The category roster, as a block for the system prompt.
 *
 * `describeCategories` alone was not enough. It lives inside a nested JSON-schema
 * parameter description, which the model only really consults once it has already
 * decided to call the task tool — so asking "what classes am I taking?" got nothing,
 * and the class list could not inform the conversation that leads up to a task.
 *
 * Classes are listed separately from the categories the user made, because they are
 * two different kinds of thing: one is a bucket, the other is a course with meetings
 * on the calendar. Naming the id beside the course lets the model connect a `[CLASS]`
 * event to the category that files work against it.
 */
export function categoriesContext(categories = []) {
  const list = (categories ?? []).filter(c => c?.id).slice(0, MAX_LISTED)
  const own     = list.filter(c => !isClassCategoryId(c.id))
  const classes = list.filter(c => isClassCategoryId(c.id))

  const lines = []
  lines.push(classes.length
    ? `THE STUDENT'S CLASSES (each is also a task category — use the id to file work under it):\n${
        classes.map(c => `  ${c.label} — category id ${c.id}`).join('\n')}`
    : "THE STUDENT'S CLASSES:\n  None on the schedule yet.")

  lines.push(own.length
    ? `OTHER TASK CATEGORIES:\n${own.map(c => `  ${c.label ?? c.id} — id ${c.id}`).join('\n')}`
    : 'OTHER TASK CATEGORIES:\n  None.')

  return lines.join('\n\n')
}
