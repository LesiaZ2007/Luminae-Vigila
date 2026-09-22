import { describe, it, expect } from 'vitest'
import { PRIORITIES, PRIORITY_BARS, priorityMeta, priorityRank, comparePriority } from '@/lib/priority'

describe('PRIORITIES', () => {
  it('runs most urgent first', () => {
    expect(PRIORITIES.map(p => p.id)).toEqual(['high', 'medium', 'low'])
  })

  it('gives every level a distinct colour and bar count', () => {
    expect(new Set(PRIORITIES.map(p => p.color)).size).toBe(PRIORITIES.length)
    expect(PRIORITIES.map(p => p.bars)).toEqual([3, 2, 1])
  })

  // The meter draws PRIORITY_BARS bars and fills `bars` of them, so no level may ask
  // for more than there are.
  it('never asks for more bars than the meter draws', () => {
    for (const p of PRIORITIES) {
      expect(p.bars).toBeGreaterThan(0)
      expect(p.bars).toBeLessThanOrEqual(PRIORITY_BARS)
    }
  })
})

describe('priorityMeta', () => {
  it('describes each level', () => {
    expect(priorityMeta('high')).toMatchObject({ label: 'High', bars: 3 })
    expect(priorityMeta('medium')).toMatchObject({ label: 'Medium', bars: 2 })
    expect(priorityMeta('low')).toMatchObject({ label: 'Low', bars: 1 })
  })

  // A task from before the field existed, or a Canvas assignment, has no priority —
  // it must not be drawn as though someone chose Low.
  it('returns null for an unset or unknown priority', () => {
    expect(priorityMeta(null)).toBeNull()
    expect(priorityMeta(undefined)).toBeNull()
    expect(priorityMeta('')).toBeNull()
    expect(priorityMeta('urgent')).toBeNull()
  })
})

describe('priorityRank', () => {
  it('ranks high above medium above low', () => {
    expect(priorityRank('high')).toBeLessThan(priorityRank('medium'))
    expect(priorityRank('medium')).toBeLessThan(priorityRank('low'))
  })

  it('ranks an unset priority below every real level', () => {
    expect(priorityRank(null)).toBeGreaterThan(priorityRank('low'))
  })
})

describe('comparePriority', () => {
  it('sorts most urgent first', () => {
    const sorted = ['low', null, 'high', 'medium'].sort(comparePriority)
    expect(sorted).toEqual(['high', 'medium', 'low', null])
  })

  it('treats two of the same level as a tie, so the caller keeps its own order', () => {
    expect(comparePriority('high', 'high')).toBe(0)
    expect(comparePriority(null, undefined)).toBe(0)
  })
})
