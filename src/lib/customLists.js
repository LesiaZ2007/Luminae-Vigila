/**
 * Custom Lists — localStorage helpers + cloud-merge logic.
 *
 * Shape of a list:
 *   {
 *     id, name, icon, color, createdAt,
 *     items: [
 *       { id, text, checked, dueDate?, note?, sortOrder, subtasks?: [{id, text, checked}] }
 *     ]
 *   }
 *
 * Additive fields (no schema/sync change needed):
 *   list.icon   — Lucide icon key string (e.g. 'ShoppingCart'); falls back gracefully if unrecognised
 *   list.color  — hex accent color (e.g. '#3a6fa8')
 *   item.subtasks — array of { id, text, checked }
 *
 * localStorage key: 'lv-custom-lists'
 */

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

/**
 * Merge cloud lists into local lists — local wins on conflict by id.
 * Items within each list are also merged by item id (local wins).
 */
export function mergeCustomLists(cloudLists, localLists) {
  const cloudMap = Object.fromEntries((cloudLists ?? []).map(l => [l.id, l]))
  const localMap = Object.fromEntries((localLists ?? []).map(l => [l.id, l]))

  // Union of ids; local wins for list-level fields
  const allIds = new Set([...Object.keys(cloudMap), ...Object.keys(localMap)])
  return [...allIds].map(id => {
    const cloud = cloudMap[id]
    const local = localMap[id]
    if (!local) return cloud
    if (!cloud) return local

    // Merge items: local wins on duplicate item id
    const cloudItems = Object.fromEntries((cloud.items ?? []).map(i => [i.id, i]))
    const localItems = Object.fromEntries((local.items ?? []).map(i => [i.id, i]))
    const mergedItems = Object.values({ ...cloudItems, ...localItems })

    return { ...cloud, ...local, items: mergedItems }
  })
}

/** Cloud-wins merge (for manual pull-from-cloud). Same shape, cloud wins. */
export function mergeCustomListsCloudWins(cloudLists, localLists) {
  const cloudMap = Object.fromEntries((cloudLists ?? []).map(l => [l.id, l]))
  const localMap = Object.fromEntries((localLists ?? []).map(l => [l.id, l]))

  const allIds = new Set([...Object.keys(cloudMap), ...Object.keys(localMap)])
  return [...allIds].map(id => {
    const cloud = cloudMap[id]
    const local = localMap[id]
    if (!local) return cloud
    if (!cloud) return local

    // Merge items: cloud wins on duplicate item id
    const cloudItems = Object.fromEntries((cloud.items ?? []).map(i => [i.id, i]))
    const localItems = Object.fromEntries((local.items ?? []).map(i => [i.id, i]))
    const mergedItems = Object.values({ ...localItems, ...cloudItems })

    return { ...local, ...cloud, items: mergedItems }
  })
}

export function makeList(name, icon = 'ListChecks', color = '#3a6fa8') {
  return {
    id: `cl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    icon,
    color,
    createdAt: new Date().toISOString(),
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
  }
}

export function makeSubtask(text) {
  return {
    id: `clst-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text,
    checked: false,
  }
}
