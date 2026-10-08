import { describe, it, expect } from 'vitest'
import { moveId, neighbourId, applyOrder, sameOrder, nextSortOrder, reassignSortOrder } from './reorder'

describe('moveId', () => {
  it('lands after the target when moving down', () => {
    expect(moveId(['a', 'b', 'c', 'd'], 'a', 'c')).toEqual(['b', 'c', 'a', 'd'])
  })

  it('lands before the target when moving up', () => {
    expect(moveId(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['a', 'd', 'b', 'c'])
  })

  it('swaps neighbours either way', () => {
    expect(moveId(['a', 'b'], 'a', 'b')).toEqual(['b', 'a'])
    expect(moveId(['a', 'b'], 'b', 'a')).toEqual(['b', 'a'])
  })

  // Identity, not just equality: the hook uses it to skip a re-render for nothing.
  it('returns the same array when nothing moves', () => {
    const ids = ['a', 'b']
    expect(moveId(ids, 'a', 'a')).toBe(ids)
    expect(moveId(ids, 'a', 'zz')).toBe(ids)
    expect(moveId(ids, 'zz', 'a')).toBe(ids)
  })

  it('does not mutate its input', () => {
    const ids = ['a', 'b', 'c']
    moveId(ids, 'a', 'c')
    expect(ids).toEqual(['a', 'b', 'c'])
  })
})

describe('neighbourId', () => {
  const ids = ['a', 'b', 'c']

  it('finds the row above and below', () => {
    expect(neighbourId(ids, 'b', -1)).toBe('a')
    expect(neighbourId(ids, 'b', 1)).toBe('c')
  })

  it('is null at either edge, and for an unknown id', () => {
    expect(neighbourId(ids, 'a', -1)).toBeNull()
    expect(neighbourId(ids, 'c', 1)).toBeNull()
    expect(neighbourId(ids, 'zz', 1)).toBeNull()
  })

  // The task list's order spans every date heading; the step has to stay under one.
  it('skips rows outside the group', () => {
    const group = { a: 'today', x: 'overdue', b: 'today' }
    const sameAsA = id => group[id] === 'today'
    expect(neighbourId(['a', 'x', 'b'], 'a', 1, sameAsA)).toBe('b')
    expect(neighbourId(['a', 'x', 'b'], 'b', -1, sameAsA)).toBe('a')
    expect(neighbourId(['x', 'a'], 'a', -1, sameAsA)).toBeNull()
  })
})

describe('applyOrder', () => {
  const A = { id: 'a' }, B = { id: 'b' }, C = { id: 'c' }

  it('puts the items in the order given', () => {
    expect(applyOrder([A, B, C], ['c', 'a', 'b'])).toEqual([C, A, B])
  })

  // An item added mid-drag is not in the drag's order yet, and must still show.
  it('appends items the order does not mention', () => {
    expect(applyOrder([A, B, C], ['b', 'a'])).toEqual([B, A, C])
  })

  // And one deleted mid-drag must not leave a hole.
  it('drops ids that no longer have an item', () => {
    expect(applyOrder([A, C], ['c', 'b', 'a'])).toEqual([C, A])
  })

  it('takes a custom id getter', () => {
    const items = [{ key: 1 }, { key: 2 }]
    expect(applyOrder(items, [2, 1], i => i.key)).toEqual([items[1], items[0]])
  })
})

describe('sameOrder', () => {
  it('compares by id', () => {
    expect(sameOrder([{ id: 'a' }, { id: 'b' }], [{ id: 'a' }, { id: 'b' }])).toBe(true)
    expect(sameOrder([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'a' }])).toBe(false)
    expect(sameOrder([{ id: 'a' }], [{ id: 'a' }, { id: 'b' }])).toBe(false)
  })
})

describe('nextSortOrder', () => {
  it('is one past the highest', () => {
    expect(nextSortOrder([{ sortOrder: 4 }, { sortOrder: 1 }])).toBe(5)
  })

  it('ignores rows without one, and starts at 0', () => {
    expect(nextSortOrder([{ sortOrder: null }, {}])).toBe(0)
    expect(nextSortOrder([])).toBe(0)
  })

  /* Counting the rows instead is what a new list item used to do. After a reorder
     and a couple of deletions, the count can be lower than a value still in use,
     and the new item landed in the middle of the list rather than at the end. */
  it('stays clear of values in use when rows have been removed', () => {
    const live = [{ sortOrder: 2 }]
    expect(nextSortOrder(live)).toBe(3)
    expect(nextSortOrder(live)).not.toBe(live.length)
  })
})

describe('reassignSortOrder', () => {
  it('deals the visible rows their own slots again, in the new order', () => {
    const a = { id: 'a', sortOrder: 0 }, b = { id: 'b', sortOrder: 2 }, c = { id: 'c', sortOrder: 5 }
    expect(reassignSortOrder([c, a, b])).toEqual([
      { id: 'c', sortOrder: 0 },
      { id: 'a', sortOrder: 2 },
      { id: 'b', sortOrder: 5 },
    ])
  })

  /* The bug this replaces: a filtered list numbered 0..n-1 handed its rows values
     that hidden rows already held. */
  it('never hands out a value a hidden row is using', () => {
    const hidden = { id: 'h', sortOrder: 1, completed: true }
    const a = { id: 'a', sortOrder: 0 }, b = { id: 'b', sortOrder: 2 }
    const changed = reassignSortOrder([b, a], [a, hidden, b])
    expect(changed.map(t => t.sortOrder)).not.toContain(1)
    expect(changed).toEqual([{ id: 'b', sortOrder: 0 }, { id: 'a', sortOrder: 2 }])
  })

  it('gives unordered rows fresh slots above every value in use', () => {
    const hidden = { id: 'h', sortOrder: 9 }
    const a = { id: 'a', sortOrder: 3 }, n1 = { id: 'n1' }, n2 = { id: 'n2', sortOrder: null }
    expect(reassignSortOrder([n2, a, n1], [a, n1, n2, hidden])).toEqual([
      { id: 'n2', sortOrder: 3 },
      { id: 'a', sortOrder: 10 },
      { id: 'n1', sortOrder: 11 },
    ])
  })

  // Two rows sharing a value (left by the old numbering) have no order between them.
  it('separates rows that shared a value', () => {
    const a = { id: 'a', sortOrder: 0 }, b = { id: 'b', sortOrder: 0 }
    const changed = reassignSortOrder([a, b])
    expect(changed).toEqual([{ id: 'b', sortOrder: 1 }])
  })

  it('returns only what changed, and copies rather than mutates', () => {
    const a = { id: 'a', sortOrder: 0 }, b = { id: 'b', sortOrder: 1 }, c = { id: 'c', sortOrder: 2 }
    const changed = reassignSortOrder([a, c, b])
    expect(changed).toEqual([{ id: 'c', sortOrder: 1 }, { id: 'b', sortOrder: 2 }])
    expect(b.sortOrder).toBe(1)
    expect(reassignSortOrder([a, b, c])).toEqual([])
  })

  it('carries the rest of the item through', () => {
    const a = { id: 'a', title: 'Essay', sortOrder: 1 }, b = { id: 'b', sortOrder: 0 }
    expect(reassignSortOrder([a, b])[0]).toEqual({ id: 'a', title: 'Essay', sortOrder: 0 })
  })
})
