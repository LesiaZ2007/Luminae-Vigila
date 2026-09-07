import { describe, it, expect } from 'vitest'
import {
  mergeTodos, mergeTodosCloudWins, reconcileCompletion, setCompletionForDate, purgeTodos,
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

  /* The row timestamp is what the merge resolves the row by, so a tick that moves
     the register without moving updatedAt is the original sync bug. Stamping it here
     rather than at the call site means no caller can forget. */
  it('stamps the row updatedAt, not just the register', () => {
    const t = setCompletionForDate({ id: 'a', updatedAt: T.early }, '2026-09-07', true, T.late)
    expect(t.updatedAt).toBe(T.late)
  })

  it('stamps updatedAt on an untick too', () => {
    const ticked = setCompletionForDate({ id: 'a' }, '2026-09-07', true, T.early)
    expect(setCompletionForDate(ticked, '2026-09-07', false, T.late).updatedAt).toBe(T.late)
  })

  /* completionStamps rides in the todos payload, which buildSyncDelta fingerprints
     with JSON.stringify — key order and all. Ticking the same dates in a different
     order on two devices must not produce two different fingerprints, or every sync
     pushes the whole collection to record nothing. */
  it('orders stamp keys by date so the sync fingerprint is stable', () => {
    const forward = setCompletionForDate(
      setCompletionForDate({ id: 'a' }, '2026-09-07', true, T.early), '2026-09-14', true, T.late)
    const reverse = setCompletionForDate(
      setCompletionForDate({ id: 'a' }, '2026-09-14', true, T.late), '2026-09-07', true, T.early)

    expect(Object.keys(forward.completionStamps)).toEqual(['2026-09-07', '2026-09-14'])
    expect(JSON.stringify(forward.completionStamps)).toBe(JSON.stringify(reverse.completionStamps))
  })
})

describe('purgeTodos', () => {
  const OLD = new Date(Date.parse(T.mid) - TOMBSTONE_RETENTION_MS - 1).toISOString()
  const now = Date.parse(T.mid)

  it('drops expired tombstones like purgeTombstones does', () => {
    const rows = [{ id: 'a' }, { ...softDelete({ id: 'b' }, OLD) }]
    expect(purgeTodos(rows, now).map(r => r.id)).toEqual(['a'])
  })

  /* reconcileCompletion expires untick stamps, but it only runs for rows both sides
     hold. A row that never syncs — every row on an offline account — would otherwise
     keep one stamp per occurrence forever and grow the stored blob without bound. */
  it('expires an untick stamp on a row that never reached a merge', () => {
    const [row] = purgeTodos([recurring([], { '2026-01-01': OLD })], now)
    expect(row.completionStamps).toEqual({})
  })

  it('keeps an untick stamp that is still inside the window', () => {
    const [row] = purgeTodos([recurring([], { '2026-09-01': T.early })], now)
    expect(row.completionStamps).toEqual({ '2026-09-01': T.early })
  })

  /* A stamp for a date that is still completed is not an untick record — it is the
     tick's own timestamp, and dropping it would make the tick undateable and so
     unable to win a merge. */
  it('never drops the stamp of a date that is still done, however old', () => {
    const [row] = purgeTodos([recurring(['2026-01-01'], { '2026-01-01': OLD })], now)
    expect(row.completionStamps).toEqual({ '2026-01-01': OLD })
  })

  it('leaves an ordinary task untouched rather than giving it empty completion state', () => {
    const plain = { id: 'p', title: 'One-off', completed: true, updatedAt: T.mid }
    expect(purgeTodos([plain], now)[0]).toBe(plain)
  })

  it('returns the same row object when nothing expired, so React sees no change', () => {
    const row = recurring([], { '2026-09-01': T.early })
    expect(purgeTodos([row], now)[0]).toBe(row)
  })

  it('survives null and rows with no completion state', () => {
    expect(purgeTodos(null, now)).toEqual([])
    expect(purgeTodos([{ id: 'a' }], now)).toEqual([{ id: 'a' }])
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
