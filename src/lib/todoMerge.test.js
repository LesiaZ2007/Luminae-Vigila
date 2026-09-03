import { describe, it, expect } from 'vitest'
import {
  mergeTodos, mergeTodosCloudWins, reconcileCompletion, setCompletionForDate,
} from './todoMerge'
import { softDelete, TOMBSTONE_RETENTION_MS } from './tombstones'

const T = {
  early: '2026-09-01T10:00:00.000Z',
  mid:   '2026-09-02T10:00:00.000Z',
  late:  '2026-09-03T10:00:00.000Z',
}

/** A recurring task as the register stores it. */
function recurring(dates, stamps, updatedAt = T.mid) {
  return { id: 'r1', title: 'Weekly reading', completedDates: dates, completionStamps: stamps, updatedAt }
}

describe('setCompletionForDate', () => {
  it('adds a date and stamps it', () => {
    const t = setCompletionForDate({ id: 'a' }, '2026-09-07', true, T.mid)
    expect(t.completedDates).toEqual(['2026-09-07'])
    expect(t.completionStamps['2026-09-07']).toBe(T.mid)
  })

  it('removes the date but KEEPS the stamp — that is what makes an untick sync', () => {
    const ticked = setCompletionForDate({ id: 'a' }, '2026-09-07', true, T.early)
    const unticked = setCompletionForDate(ticked, '2026-09-07', false, T.late)
    expect(unticked.completedDates).toEqual([])
    expect(unticked.completionStamps['2026-09-07']).toBe(T.late)
  })

  it('leaves other dates alone', () => {
    const a = setCompletionForDate({ id: 'a' }, '2026-09-07', true, T.early)
    const b = setCompletionForDate(a, '2026-09-14', true, T.late)
    expect(b.completedDates).toEqual(['2026-09-07', '2026-09-14'])
  })

  it('keeps completedDates sorted regardless of tick order', () => {
    const a = setCompletionForDate({ id: 'a' }, '2026-09-14', true, T.early)
    const b = setCompletionForDate(a, '2026-09-07', true, T.late)
    expect(b.completedDates).toEqual(['2026-09-07', '2026-09-14'])
  })
})

/* The bug: two devices ticking *different* occurrences of the same recurring task
 * used to have one overwrite the other, because the whole row resolved by
 * updatedAt and the two decisions were never actually in conflict. */
describe('reconcileCompletion — independent dates do not compete', () => {
  it('keeps both ticks when two devices complete different dates offline', () => {
    const cloud = recurring(['2026-09-07'], { '2026-09-07': T.early }, T.early)
    const local = recurring(['2026-09-14'], { '2026-09-14': T.late  }, T.late)
    expect(reconcileCompletion(cloud, local).completedDates)
      .toEqual(['2026-09-07', '2026-09-14'])
  })

  it('an untick beats an older tick of the same date', () => {
    const cloud = recurring(['2026-09-07'], { '2026-09-07': T.early })
    const local = recurring([],             { '2026-09-07': T.late  })
    expect(reconcileCompletion(cloud, local).completedDates).toEqual([])
  })

  it('a re-tick beats an older untick of the same date', () => {
    const cloud = recurring([],             { '2026-09-07': T.early })
    const local = recurring(['2026-09-07'], { '2026-09-07': T.late  })
    expect(reconcileCompletion(cloud, local).completedDates).toEqual(['2026-09-07'])
  })

  it('an untick made on the OTHER device still wins', () => {
    const cloud = recurring([],             { '2026-09-07': T.late  })
    const local = recurring(['2026-09-07'], { '2026-09-07': T.early })
    expect(reconcileCompletion(cloud, local).completedDates).toEqual([])
  })

  it('a stamped side decides when the other never touched the date', () => {
    const cloud = recurring(['2026-09-07'], {})                            // legacy tick
    const local = recurring([], { '2026-09-07': T.late })                  // deliberate untick
    expect(reconcileCompletion(cloud, local).completedDates).toEqual([])
  })

  it('unions unstamped legacy rows rather than dropping a tick', () => {
    const cloud = { id: 'r1', completedDates: ['2026-09-07'] }
    const local = { id: 'r1', completedDates: ['2026-09-14'] }
    expect(reconcileCompletion(cloud, local).completedDates)
      .toEqual(['2026-09-07', '2026-09-14'])
  })

  it('prefers the tick when both sides stamped the same millisecond', () => {
    const cloud = recurring(['2026-09-07'], { '2026-09-07': T.mid })
    const local = recurring([],             { '2026-09-07': T.mid })
    expect(reconcileCompletion(cloud, local).completedDates).toEqual(['2026-09-07'])
  })

  it('carries the winning stamp forward so the next merge can resolve again', () => {
    const cloud = recurring(['2026-09-07'], { '2026-09-07': T.early })
    const local = recurring(['2026-09-07'], { '2026-09-07': T.late  })
    expect(reconcileCompletion(cloud, local).completionStamps['2026-09-07']).toBe(T.late)
  })

  it('drops an untick stamp older than the tombstone window, keeping rows bounded', () => {
    const old   = new Date(Date.now() - TOMBSTONE_RETENTION_MS - 1000).toISOString()
    const cloud = recurring([], { '2026-01-01': old })
    const local = recurring([], { '2026-01-01': old })
    expect(reconcileCompletion(cloud, local).completionStamps).toEqual({})
  })

  it('keeps a recent untick stamp', () => {
    const recent = new Date(Date.now() - 1000).toISOString()
    const cloud  = recurring([], { '2026-09-07': recent })
    const local  = recurring([], { '2026-09-07': recent })
    expect(reconcileCompletion(cloud, local).completionStamps['2026-09-07']).toBe(recent)
  })

  it('never drops the stamp of a date that is still ticked', () => {
    const old   = new Date(Date.now() - TOMBSTONE_RETENTION_MS - 1000).toISOString()
    const cloud = recurring(['2026-01-01'], { '2026-01-01': old })
    expect(reconcileCompletion(cloud, cloud).completedDates).toEqual(['2026-01-01'])
  })

  it('handles rows with no completion state at all', () => {
    expect(reconcileCompletion({ id: 'a' }, { id: 'a' }))
      .toEqual({ completedDates: [], completionStamps: {} })
  })
})

describe('mergeTodos', () => {
  it('still resolves the one-off completed flag by updatedAt', () => {
    const merged = mergeTodos(
      [{ id: 't1', completed: true,  updatedAt: T.late }],
      [{ id: 't1', completed: false, updatedAt: T.early }],
    )
    expect(merged[0].completed).toBe(true)
  })

  it('merges per-date completion even when the other row won the LWW', () => {
    // The cloud row is newer and wins the row, but the local tick must survive.
    const cloud = recurring(['2026-09-07'], { '2026-09-07': T.early }, T.late)
    const local = recurring(['2026-09-14'], { '2026-09-14': T.mid   }, T.early)
    const merged = mergeTodos([cloud], [local])
    expect(merged[0].completedDates).toEqual(['2026-09-07', '2026-09-14'])
  })

  it('leaves an ordinary task without recurring state untouched', () => {
    const merged = mergeTodos(
      [{ id: 't1', title: 'Essay', completed: false, updatedAt: T.mid }],
      [{ id: 't1', title: 'Essay', completed: false, updatedAt: T.mid }],
    )
    // No empty completedDates bolted on — that would churn the sync fingerprint.
    expect(merged[0]).not.toHaveProperty('completedDates')
    expect(merged[0]).not.toHaveProperty('completionStamps')
  })

  it('does not reconcile a row only one side has', () => {
    const merged = mergeTodos([], [recurring(['2026-09-07'], { '2026-09-07': T.mid })])
    expect(merged[0].completedDates).toEqual(['2026-09-07'])
  })

  it('leaves a tombstone alone', () => {
    const merged = mergeTodos(
      [recurring(['2026-09-07'], { '2026-09-07': T.early }, T.early)],
      [softDelete(recurring([], {}, T.early), T.late)],
    )
    expect(merged[0].deletedAt).toBe(T.late)
  })

  it('handles null inputs', () => {
    expect(mergeTodos(null, undefined)).toEqual([])
  })
})

describe('mergeTodosCloudWins — manual refresh', () => {
  it('takes the cloud row', () => {
    const merged = mergeTodosCloudWins(
      [{ id: 't1', title: 'cloud', updatedAt: T.early }],
      [{ id: 't1', title: 'local', updatedAt: T.late }],
    )
    expect(merged[0].title).toBe('cloud')
  })

  it('does not discard a tick made here seconds ago', () => {
    const cloud = recurring(['2026-09-07'], { '2026-09-07': T.early }, T.early)
    const local = recurring(['2026-09-07', '2026-09-14'], { '2026-09-14': T.late }, T.late)
    const merged = mergeTodosCloudWins([cloud], [local])
    expect(merged[0].completedDates).toEqual(['2026-09-07', '2026-09-14'])
  })

  it('still refuses to resurrect a local delete', () => {
    const merged = mergeTodosCloudWins(
      [{ id: 't1', title: 'alive in cloud' }],
      [softDelete({ id: 't1' }, T.late)],
    )
    expect(merged[0].deletedAt).toBe(T.late)
  })
})
