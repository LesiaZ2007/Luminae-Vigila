/**
 * Manual ordering — the pure half of drag-to-reorder.
 *
 * The task list and every custom list let you put rows in your own order, and both
 * used to splice arrays inline in their drag handlers, twice over, with the same
 * mistakes in each copy. This is the arithmetic on its own, so it can be tested
 * without a DOM and shared by the hook that drives the gestures (useDragReorder).
 *
 * Ids rather than whole items, wherever an order is held: an order that remembers
 * ids can be laid over the *current* items at render time, so an edit, a tick or a
 * sync that lands mid-drag still shows — a snapshot of the items would hide it until
 * the drag ended.
 */

/**
 * Move `fromId` to where `toId` is.
 *
 * Moving down lands the item after its target and moving up lands it before, which
 * is what a drag over a row should do in either direction. Returns `ids` itself —
 * not a copy — when nothing moves, so a caller can tell a no-op by identity.
 */
export function moveId(ids, fromId, toId) {
  const from = ids.indexOf(fromId)
  const to   = ids.indexOf(toId)
  if (from === -1 || to === -1 || from === to) return ids
  const next = ids.slice()
  next.splice(from, 1)
  next.splice(to, 0, fromId)
  return next
}

/**
 * The id one step away from `id` in direction `delta` (-1 up, +1 down), or null at
 * the edge.
 *
 * `sameGroup(otherId)` skips ids that are not in `id`'s group. The task list is
 * drawn under date headings, but its order is one array across all of them, so the
 * array neighbour of the first task under *Today* is the last task under *Overdue* —
 * stepping past it would change the stored order and nothing on screen.
 */
export function neighbourId(ids, id, delta, sameGroup = () => true) {
  const at = ids.indexOf(id)
  if (at === -1) return null
  for (let i = at + delta; i >= 0 && i < ids.length; i += delta) {
    if (sameGroup(ids[i])) return ids[i]
  }
  return null
}

/**
 * Lay `ids` over `items`: items in that order, with any item the order does not
 * mention appended in its own relative order, and any id with no item dropped.
 */
export function applyOrder(items, ids, getId = i => i.id) {
  const byId = new Map(items.map(i => [getId(i), i]))
  const placed = new Set()
  const out = []
  for (const id of ids) {
    const item = byId.get(id)
    if (item && !placed.has(id)) { out.push(item); placed.add(id) }
  }
  for (const item of items) {
    if (!placed.has(getId(item))) out.push(item)
  }
  return out
}

/** Whether two item lists are in the same order, by id. */
export function sameOrder(a, b, getId = i => i.id) {
  return a.length === b.length && a.every((item, i) => getId(item) === getId(b[i]))
}

function hasOrder(item) {
  return Number.isFinite(item?.sortOrder)
}

/** One past the highest `sortOrder` in `items` — where a new row goes to land last. */
export function nextSortOrder(items) {
  let max = -1
  for (const item of items) if (hasOrder(item) && item.sortOrder > max) max = item.sortOrder
  return max + 1
}

/**
 * Give the visible items, in their new order, the `sortOrder` that order means —
 * without touching anything that is not visible.
 *
 * The task list is filtered before it is dragged (Upcoming hides finished tasks, the
 * category chips hide whole categories), and numbering only the visible rows 0..n-1
 * handed them values the hidden rows were already using. Two tasks with the same
 * `sortOrder` have no defined order between them, so un-hiding a category put its
 * tasks back in arbitrary places among the ones you had just arranged.
 *
 * So the visible rows trade the slots they already hold: their existing values,
 * sorted, dealt out again in the new order. A hidden task keeps its value, and so its
 * place relative to everything around it. Rows that never had a value, or shared one,
 * get fresh slots above every value in `allItems` — they sorted after every ordered
 * task before the drag, and a fresh slot cannot collide with a hidden one.
 *
 * Returns only the items whose `sortOrder` actually changed, as copies. An item that
 * kept its place is not an edit; stamping it anyway would let a reorder overwrite an
 * unrelated change made to that same item on another device.
 */
export function reassignSortOrder(orderedVisible, allItems = orderedVisible) {
  const slots = [...new Set(orderedVisible.filter(hasOrder).map(i => i.sortOrder))]
    .sort((a, b) => a - b)
  let next = Math.max(nextSortOrder(allItems), nextSortOrder(orderedVisible))
  while (slots.length < orderedVisible.length) slots.push(next++)

  const changed = []
  orderedVisible.forEach((item, i) => {
    if (item.sortOrder !== slots[i]) changed.push({ ...item, sortOrder: slots[i] })
  })
  return changed
}

function groupRows(items, groupOf) {
  const groups = new Map()
  for (const item of items) {
    const key = groupOf(item)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  }
  return groups
}

/**
 * reassignSortOrder for a list drawn under headings, run only on the headings whose
 * order actually changed between `before` and `after`.
 *
 * The task list is one array drawn under date headings, and a move only ever happens
 * among the tasks under one of them. Running reassignSortOrder over the whole array
 * dealt slots to the other headings' tasks too: an unordered task under another
 * heading got a fresh slot, and so did any task whose place in the single array
 * shifted because the moved one passed it. Nothing changed on screen for them — a
 * heading draws its own tasks, so where they sit relative to another heading's is
 * invisible — but each came back as changed, was stamped as edited, and so could
 * overwrite an edit made to it on another device.
 *
 * A heading's tasks only ever compare with each other once drawn, so trading slots
 * among them alone keeps every heading's order intact. `allItems` still bounds the
 * fresh slots, so none can land on a value a hidden or other-heading task holds.
 */
export function reassignSortOrderInGroups(before, after, groupOf, allItems = after, getId = i => i.id) {
  const was = groupRows(before, groupOf)
  const changed = []
  for (const [key, rows] of groupRows(after, groupOf)) {
    if (sameOrder(rows, was.get(key) ?? [], getId)) continue
    // A second heading's fresh slots must start above the first one's.
    changed.push(...reassignSortOrder(rows, [...allItems, ...changed]))
  }
  return changed
}
