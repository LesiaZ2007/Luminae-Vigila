/**
 * Custom Lists — localStorage helpers + cloud-merge logic.
 *
 * Shape of a list:
 *   {
 *     id, name, icon, color, createdAt, updatedAt, deletedAt?,
 *     items: [
 *       { id, text, checked, dueDate?, note?, sortOrder, updatedAt, deletedAt?,
 *         subtasks?: [{id, text, checked}] }
 *     ]
 *   }
 *
 * Additive fields (no schema/sync change needed):
 *   list.icon   — Lucide icon key string (e.g. 'ShoppingCart'); falls back gracefully if unrecognised
 *   list.color  — hex accent color (e.g. '#3a6fa8')
 *   item.subtasks — array of { id, text, checked }
 *
 * localStorage key: 'lv-custom-lists'
 *
 * Why the timestamps exist
 * ────────────────────────
 * This merge used to be unconditionally local-wins at both the list and the item
 * level, with no timestamps anywhere. Every symptom that caused was the same one
 * tasks had: check an item on your phone, and the laptop's copy — which had never
 * heard about it — won the merge as "local" and pushed the unchecked version back
 * over the top. Deleting an item was worse, because a dropped item is
 * indistinguishable from one created offline, so deletions came back.
 *
 * So an item is now a merge unit in its own right: it carries `updatedAt`, and
 * deleting one leaves a `deletedAt` tombstone rather than splicing it out. That
 * makes list items behave exactly like tasks and events, and lets the same
 * helpers in lib/tombstones resolve them.
 *
 * Every mutation goes through a helper in this file rather than being spliced
 * together at the call site. Stamping is the sort of thing that is easy to forget
 * in one branch out of nine, and forgetting it is silent — the edit simply loses
 * a merge later, on another device, with nothing to point at.
 */
import {
  mergeWithTombstones, mergeCloudWinsWithTombstones, purgeTombstones,
  softDelete, visible,
} from './tombstones'

const LS_KEY = 'lv-custom-lists'

export function loadCustomLists() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveCustomLists(lists) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(lists))
  } catch {}
}

/** The items a list should actually display — tombstones filtered out. */
export function visibleItems(list) {
  return visible(list?.items ?? [])
}

/* ── Mutation helpers ────────────────────────────────────────────────────────
   Each returns a new list with both the touched item's `updatedAt` and the
   list's own moved forward. The list stamp is what resolves list-level fields
   (name, icon, colour, due date); the item stamp resolves that one item. */

function touchList(list, now) {
  return { ...list, updatedAt: now }
}

/** Apply `patch` to one item, stamping it and the list. */
export function patchItem(list, itemId, patch, now = new Date().toISOString()) {
  return touchList({
    ...list,
    items: (list.items ?? []).map(i =>
      i.id === itemId ? { ...i, ...patch, updatedAt: now } : i,
    ),
  }, now)
}

/** Append an item. */
export function addListItem(list, item, now = new Date().toISOString()) {
  return touchList({
    ...list,
    items: [...(list.items ?? []), { ...item, updatedAt: now }],
  }, now)
}

/**
 * Remove an item — as a tombstone, not a splice.
 *
 * Dropping the row outright is what let deleted items come back: absent from one
 * side is how an offline *creation* looks too, so the merge could not tell the
 * two apart and kept the item.
 */
export function deleteListItem(list, itemId, now = new Date().toISOString()) {
  return touchList({
    ...list,
    items: (list.items ?? []).map(i => (i.id === itemId ? softDelete(i, now) : i)),
  }, now)
}

/** Tombstone every checked item in one go. */
export function clearCheckedItems(list, now = new Date().toISOString()) {
  return touchList({
    ...list,
    items: (list.items ?? []).map(i =>
      i.checked && !i.deletedAt ? softDelete(i, now) : i,
    ),
  }, now)
}

/**
 * Rewrite item order.
 *
 * Takes the visible items in their new order and stamps each, since order is
 * synced, user-visible state. Tombstoned items are not reordered — they are not
 * on screen to drag — so they are carried through untouched.
 */
export function reorderListItems(list, orderedItems, now = new Date().toISOString()) {
  const order = new Map(orderedItems.map((i, idx) => [i.id, idx]))
  return touchList({
    ...list,
    items: (list.items ?? []).map(i =>
      order.has(i.id) ? { ...i, sortOrder: order.get(i.id), updatedAt: now } : i,
    ),
  }, now)
}

/* Subtasks are not merge units. They live inside their item's blob, so the
   item's own timestamp is what resolves them — which means a subtask change
   stamps the *item*, and a subtask can be removed outright without a tombstone. */

export function addListSubtask(list, itemId, subtask, now = new Date().toISOString()) {
  const item = (list.items ?? []).find(i => i.id === itemId)
  return patchItem(list, itemId, { subtasks: [...(item?.subtasks ?? []), subtask] }, now)
}

export function patchSubtask(list, itemId, subtaskId, patch, now = new Date().toISOString()) {
  const item = (list.items ?? []).find(i => i.id === itemId)
  return patchItem(list, itemId, {
    subtasks: (item?.subtasks ?? []).map(s => (s.id === subtaskId ? { ...s, ...patch } : s)),
  }, now)
}

export function deleteListSubtask(list, itemId, subtaskId, now = new Date().toISOString()) {
  const item = (list.items ?? []).find(i => i.id === itemId)
  return patchItem(list, itemId, {
    subtasks: (item?.subtasks ?? []).filter(s => s.id !== subtaskId),
  }, now)
}

/* ── Merging ─────────────────────────────────────────────────────────────── */

/**
 * Resolve the `items` of lists that both sides know about.
 *
 * An item is keyed by id and carries its own timestamp and tombstone, so this is
 * the same problem the top-level merge solves — and it reuses the same function.
 * Expired item tombstones are dropped here, which is the only place that sees a
 * complete pair of item arrays.
 */
function reconcileItems(rows, cloudLists, localLists, mergeItems, now) {
  const cloudMap = new Map((cloudLists ?? []).filter(l => l?.id).map(l => [l.id, l]))
  const localMap = new Map((localLists ?? []).filter(l => l?.id).map(l => [l.id, l]))

  return rows.map(row => {
    const cloud = cloudMap.get(row.id)
    const local = localMap.get(row.id)
    // Only one side had the list, so its items are already the whole truth.
    if (!cloud || !local) {
      return row.items ? { ...row, items: purgeTombstones(row.items, now) } : row
    }
    return {
      ...row,
      items: purgeTombstones(mergeItems(cloud.items ?? [], local.items ?? []), now),
    }
  })
}

/**
 * The ordinary sync merge: tombstone-aware last-write-wins at both levels.
 *
 * The list row resolves name, icon, colour and due date. Items resolve one by
 * one, so checking an item on one device and renaming another item on a second
 * device no longer means one of the two edits is discarded.
 */
export function mergeCustomLists(cloudLists, localLists, now = Date.now()) {
  return reconcileItems(
    mergeWithTombstones(cloudLists, localLists),
    cloudLists, localLists, mergeWithTombstones, now,
  )
}

/**
 * Cloud-wins merge, for the manual "pull from cloud" button.
 *
 * Cloud wins the list row. Items are still resolved by timestamp rather than
 * overwritten, for the same reason the refresh already refuses to resurrect a
 * local delete: the button means "fetch what my other device did", not "discard
 * what I just did here". An item checked on this device seconds ago carries the
 * newer stamp and survives; anything the cloud knows more recently is pulled in.
 */
export function mergeCustomListsCloudWins(cloudLists, localLists, now = Date.now()) {
  return reconcileItems(
    mergeCloudWinsWithTombstones(cloudLists, localLists),
    cloudLists, localLists, mergeWithTombstones, now,
  )
}

export function makeList(name, icon = 'ListChecks', color = '#3a6fa8') {
  const now = new Date().toISOString()
  return {
    id: `cl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    icon,
    color,
    dueDate: null,          // additive: 'YYYY-MM-DD' | null
    createdAt: now,
    updatedAt: now,
    items: [],
  }
}

export function makeItem(text) {
  return {
    id: `cli-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text,
    checked: false,
    dueDate: null,
    note: null,
    sortOrder: null,
    subtasks: [],
    updatedAt: new Date().toISOString(),
  }
}

export function makeSubtask(text) {
  return {
    id: `clst-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text,
    checked: false,
  }
}
