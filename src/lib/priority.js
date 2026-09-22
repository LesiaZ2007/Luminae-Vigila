/**
 * priority.js — the one description of what a task's priority looks like.
 *
 * The three levels were spelled out separately in every component that drew them, and
 * they had drifted: the add/edit modal painted Low slate, the agenda painted it green,
 * and the task list painted it the same grey as the border — which is also what a task
 * with no priority at all got, so Low was indistinguishable from unset.
 *
 * ## Why `bars` exists
 *
 * Colour alone was doing all the work, and in the task list it was competing with the
 * date badges, which are already red for overdue and amber for due-today. A red dot
 * beside a red "Overdue" said nothing you could pick out. `bars` lets the indicator
 * differ in *shape* as well — a one-, two- or three-bar meter reads at a glance, and
 * keeps working for anyone who can't separate the reds and ambers.
 *
 * ## Unset is not Low
 *
 * `priorityMeta` returns null for a task with no priority rather than defaulting to
 * something. Tasks created before the field existed, and Canvas assignments, have none;
 * they should show no indicator rather than claim a level nobody chose. New tasks
 * default to `medium` in the modal, which is a real answer and does show.
 */

/** The levels, most urgent first — the order the modal's picker reverses for its chips. */
export const PRIORITIES = [
  { id: 'high',   label: 'High',   color: '#ef4444', bars: 3, rank: 0 },
  { id: 'medium', label: 'Medium', color: '#f59e0b', bars: 2, rank: 1 },
  { id: 'low',    label: 'Low',    color: '#94a3b8', bars: 1, rank: 2 },
]

/** How many bars the meter draws in total — the unfilled ones are ghosted. */
export const PRIORITY_BARS = 3

/**
 * Everything needed to draw one priority, or null if there isn't one.
 *
 * @param {string|null|undefined} priority
 * @returns {{id: string, label: string, color: string, bars: number, rank: number}|null}
 */
export function priorityMeta(priority) {
  return PRIORITIES.find(p => p.id === priority) || null
}

/** Sorts most urgent first; anything unset sorts after every real level. */
export function comparePriority(a, b) {
  return priorityRank(a) - priorityRank(b)
}

/** Lower is more urgent. An unset priority ranks below Low rather than beside it. */
export function priorityRank(priority) {
  const meta = priorityMeta(priority)
  return meta ? meta.rank : PRIORITIES.length
}
