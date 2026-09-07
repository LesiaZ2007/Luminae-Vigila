import { describe, it, expect } from 'vitest'
import {
  mergeCustomLists, mergeCustomListsCloudWins, makeList, makeItem, makeSubtask,
  visibleItems, patchItem, addListItem, deleteListItem, clearCheckedItems,
  reorderListItems, addListSubtask, patchSubtask, deleteListSubtask,
} from './customLists'
import { TOMBSTONE_RETENTION_MS } from './tombstones'

const T = {
  early: '2026-09-01T10:00:00.000Z',
  mid:   '2026-09-02T10:00:00.000Z',
  late:  '2026-09-03T10:00:00.000Z',
}

/** A list with the given items, stamped so the merge has something to resolve. */
function list(items, updatedAt = T.mid, extra = {}) {
  return { id: 'l1', name: 'Groceries', color: '#3a6fa8', items, updatedAt, ...extra }
}

function item(id, props = {}) {
  return { id, text: id, checked: false, subtasks: [], ...props }
}

describe('makeList / makeItem', () => {
  it('stamps a new list so it can win a merge', () => {
    expect(makeList('Shopping').updatedAt).toBeTruthy()
  })

  it('stamps a new item', () => {
    expect(makeItem('milk').updatedAt).toBeTruthy()
  })
})

describe('mutation helpers stamp both the item and the list', () => {
  const base = list([item('a'), item('b')], T.early)

  it('patchItem stamps the touched item and the list, leaving others alone', () => {
    const next = patchItem(base, 'a', { checked: true }, T.late)
    expect(next.updatedAt).toBe(T.late)
    expect(next.items.find(i => i.id === 'a').updatedAt).toBe(T.late)
    expect(next.items.find(i => i.id === 'a').checked).toBe(true)
    expect(next.items.find(i => i.id === 'b').updatedAt).toBeUndefined()
  })

  it('addListItem stamps the new item', () => {
    const next = addListItem(base, item('c'), T.late)
    expect(next.items).toHaveLength(3)
    expect(next.items[2].updatedAt).toBe(T.late)
  })

  it('deleteListItem tombstones rather than splices', () => {
    const next = deleteListItem(base, 'a', T.late)
    expect(next.items).toHaveLength(2)                 // still there, as a tombstone
    expect(next.items.find(i => i.id === 'a').deletedAt).toBe(T.late)
    expect(visibleItems(next).map(i => i.id)).toEqual(['b'])
  })

  it('clearCheckedItems tombstones every checked item at once', () => {
    const withChecks = list([item('a', { checked: true }), item('b'), item('c', { checked: true })])
    const next = clearCheckedItems(withChecks, T.late)
    expect(visibleItems(next).map(i => i.id)).toEqual(['b'])
    expect(next.items.filter(i => i.deletedAt)).toHaveLength(2)
  })

  it('reorderListItems stamps the moved items and keeps tombstones', () => {
    const withDead = list([item('a'), item('b'), item('gone', { deletedAt: T.early })])
    const next = reorderListItems(withDead, [item('b'), item('a')], T.late)
    expect(next.items.find(i => i.id === 'b').sortOrder).toBe(0)
    expect(next.items.find(i => i.id === 'a').sortOrder).toBe(1)
    // The tombstone must survive a reorder — the old code replaced the array with
    // just the visible items, which would have dropped it and resurrected the item.
    expect(next.items.find(i => i.id === 'gone')).toBeTruthy()
  })

  it('subtask changes stamp the parent item, since the item is the merge unit', () => {
    const added = addListSubtask(base, 'a', makeSubtask('half'), T.late)
    expect(added.items.find(i => i.id === 'a').updatedAt).toBe(T.late)
    expect(added.items.find(i => i.id === 'a').subtasks).toHaveLength(1)

    const stId = added.items.find(i => i.id === 'a').subtasks[0].id
    const toggled = patchSubtask(added, 'a', stId, { checked: true }, T.late)
    expect(toggled.items.find(i => i.id === 'a').subtasks[0].checked).toBe(true)

    const removed = deleteListSubtask(toggled, 'a', stId, T.late)
    expect(removed.items.find(i => i.id === 'a').subtasks).toHaveLength(0)
  })
})

/* The bug: this merge was unconditionally local-wins with no timestamps, so a
 * device that had never heard about a check won as "local" and pushed the
 * unchecked copy back — the same failure tasks had. */
describe('mergeCustomLists — checked state across devices', () => {
  it('a check made on another device beats the stale local copy', () => {
    const cloud = list([item('a', { checked: true,  updatedAt: T.late })])
    const local = list([item('a', { checked: false, updatedAt: T.early })])
    expect(mergeCustomLists([cloud], [local])[0].items[0].checked).toBe(true)
  })

  it('a check made here beats a stale cloud copy', () => {
    const cloud = list([item('a', { checked: false, updatedAt: T.early })])
    const local = list([item('a', { checked: true,  updatedAt: T.late })])
    expect(mergeCustomLists([cloud], [local])[0].items[0].checked).toBe(true)
  })

  it('a stamped item beats an unstamped legacy one either way round', () => {
    const cloud = list([item('a', { checked: true, updatedAt: T.late })])
    const local = list([item('a', { checked: false })]) // written before stamps existed
    expect(mergeCustomLists([cloud], [local])[0].items[0].checked).toBe(true)
  })

  it('resolves each item independently rather than as one blob', () => {
    // Check one item here, rename a different one there. Both must survive.
    const cloud = list([item('a', { checked: false, updatedAt: T.early }), item('b', { text: 'renamed', updatedAt: T.late })], T.late)
    const local = list([item('a', { checked: true,  updatedAt: T.late  }), item('b', { text: 'b',       updatedAt: T.early })], T.early)
    const merged = mergeCustomLists([cloud], [local])[0]
    expect(merged.items.find(i => i.id === 'a').checked).toBe(true)
    expect(merged.items.find(i => i.id === 'b').text).toBe('renamed')
  })

  it('a deleted item does not come back from a device that never heard about it', () => {
    const cloud = list([item('a', { updatedAt: T.early })])
    const local = list([item('a', { updatedAt: T.late, deletedAt: T.late })])
    const merged = mergeCustomLists([cloud], [local])[0]
    expect(visibleItems(merged)).toHaveLength(0)
  })

  it('a delete made on another device removes the item here too', () => {
    const cloud = list([item('a', { updatedAt: T.late, deletedAt: T.late })])
    const local = list([item('a', { updatedAt: T.early })])
    expect(visibleItems(mergeCustomLists([cloud], [local])[0])).toHaveLength(0)
  })

  it('keeps an item only one side has — an offline creation', () => {
    const cloud = list([item('a', { updatedAt: T.early })])
    const local = list([item('a', { updatedAt: T.early }), item('new', { updatedAt: T.late })])
    expect(visibleItems(mergeCustomLists([cloud], [local])[0]).map(i => i.id))
      .toEqual(['a', 'new'])
  })

  it('resolves list-level fields by the list stamp', () => {
    const cloud = list([], T.late,  { name: 'Renamed in cloud' })
    const local = list([], T.early, { name: 'Old name' })
    expect(mergeCustomLists([cloud], [local])[0].name).toBe('Renamed in cloud')
  })

  it('a deleted list stays deleted', () => {
    const cloud = list([], T.early)
    const local = list([], T.late, { deletedAt: T.late })
    expect(mergeCustomLists([cloud], [local])[0].deletedAt).toBe(T.late)
  })

  it('drops item tombstones past the retention window', () => {
    const old = new Date(Date.now() - TOMBSTONE_RETENTION_MS - 1000).toISOString()
    const cloud = list([item('a', { updatedAt: old, deletedAt: old })])
    const merged = mergeCustomLists([cloud], [cloud])[0]
    expect(merged.items).toHaveLength(0)
  })

  it('keeps a recent item tombstone so the delete can still propagate', () => {
    const recent = new Date(Date.now() - 1000).toISOString()
    const cloud  = list([item('a', { updatedAt: recent, deletedAt: recent })])
    expect(mergeCustomLists([cloud], [cloud])[0].items).toHaveLength(1)
  })

  it('keeps a list only one side has', () => {
    const merged = mergeCustomLists([], [list([item('a')])])
    expect(merged).toHaveLength(1)
  })

  it('handles null inputs', () => {
    expect(mergeCustomLists(null, undefined)).toEqual([])
  })
})

describe('mergeCustomListsCloudWins — manual refresh', () => {
  it('takes the cloud list row', () => {
    const cloud = list([], T.early, { name: 'cloud' })
    const local = list([], T.late,  { name: 'local' })
    expect(mergeCustomListsCloudWins([cloud], [local])[0].name).toBe('cloud')
  })

  it('does not discard an item checked here seconds ago', () => {
    const cloud = list([item('a', { checked: false, updatedAt: T.early })], T.early)
    const local = list([item('a', { checked: true,  updatedAt: T.late  })], T.late)
    expect(mergeCustomListsCloudWins([cloud], [local])[0].items[0].checked).toBe(true)
  })

  it('still refuses to resurrect a locally deleted list', () => {
    const cloud = list([], T.late, { name: 'alive in cloud' })
    const local = list([], T.late, { deletedAt: T.late })
    expect(mergeCustomListsCloudWins([cloud], [local])[0].deletedAt).toBe(T.late)
  })

  it('still refuses to resurrect a locally deleted item', () => {
    const cloud = list([item('a', { updatedAt: T.early })], T.late)
    const local = list([item('a', { updatedAt: T.late, deletedAt: T.late })], T.early)
    expect(visibleItems(mergeCustomListsCloudWins([cloud], [local])[0])).toHaveLength(0)
  })
})
