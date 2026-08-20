import { describe, it, expect } from 'vitest'
import {
  isDeleted, softDelete, restore, visible, purgeTombstones,
  mergeWithTombstones, mergeCloudWinsWithTombstones, TOMBSTONE_RETENTION_MS,
} from './tombstones'

describe('softDelete / restore', () => {
  it('stamps deletedAt AND updatedAt so the tombstone can win a merge', () => {
    const t = softDelete({ id: 'a', title: 'x', updatedAt: '2020-01-01T00:00:00.000Z' })
    expect(t.deletedAt).toBeTruthy()
    expect(t.updatedAt).toBe(t.deletedAt)
  })

  it('restore clears deletedAt and bumps updatedAt', () => {
    const t = softDelete({ id: 'a' }, '2026-01-01T00:00:00.000Z')
    const r = restore(t, '2026-02-01T00:00:00.000Z')
    expect(r.deletedAt).toBeNull()
    expect(r.updatedAt).toBe('2026-02-01T00:00:00.000Z')
    expect(isDeleted(r)).toBe(false)
  })
})

describe('visible', () => {
  it('hides tombstones and tolerates junk entries', () => {
    const out = visible([{ id: 'a' }, { id: 'b', deletedAt: '2026-01-01' }, null])
    expect(out.map(i => i.id)).toEqual(['a'])
  })
})

describe('purgeTombstones', () => {
  const now = new Date('2026-06-01T00:00:00Z').getTime()

  it('keeps live items forever', () => {
    expect(purgeTombstones([{ id: 'a' }], now)).toHaveLength(1)
  })

  it('keeps recent tombstones so other devices still learn about the delete', () => {
    const recent = new Date(now - 1000).toISOString()
    expect(purgeTombstones([{ id: 'a', deletedAt: recent }], now)).toHaveLength(1)
  })

  it('drops tombstones past the retention window', () => {
    const old = new Date(now - TOMBSTONE_RETENTION_MS - 1).toISOString()
    expect(purgeTombstones([{ id: 'a', deletedAt: old }], now)).toHaveLength(0)
  })

  it('keeps a row whose deletedAt is unparseable rather than guessing', () => {
    expect(purgeTombstones([{ id: 'a', deletedAt: 'nonsense' }], now)).toHaveLength(1)
  })
})

describe('mergeWithTombstones — the resurrection bug', () => {
  it('a local delete survives a cloud copy that predates it', () => {
    const cloud = [{ id: 'a', title: 'Task', updatedAt: '2026-01-01T00:00:00.000Z' }]
    const local = [softDelete({ id: 'a', title: 'Task' }, '2026-02-01T00:00:00.000Z')]
    const merged = mergeWithTombstones(cloud, local)
    expect(merged).toHaveLength(1)
    expect(isDeleted(merged[0])).toBe(true)
  })

  it('a delete made on another device wins over a stale local copy', () => {
    const cloud = [softDelete({ id: 'a', title: 'Task' }, '2026-02-01T00:00:00.000Z')]
    const local = [{ id: 'a', title: 'Task', updatedAt: '2026-01-01T00:00:00.000Z' }]
    expect(isDeleted(mergeWithTombstones(cloud, local)[0])).toBe(true)
  })

  it('an edit made AFTER a delete wins — undo must still work', () => {
    const cloud = [softDelete({ id: 'a' }, '2026-01-01T00:00:00.000Z')]
    const local = [restore({ id: 'a', deletedAt: '2026-01-01T00:00:00.000Z' }, '2026-03-01T00:00:00.000Z')]
    expect(isDeleted(mergeWithTombstones(cloud, local)[0])).toBe(false)
  })

  it('prefers the tombstone when timestamps are missing on both sides', () => {
    const cloud = [{ id: 'a', deletedAt: '2026-01-01' }]
    const local = [{ id: 'a', title: 'resurrected?' }]
    expect(isDeleted(mergeWithTombstones(cloud, local)[0])).toBe(true)
  })

  it('still keeps genuinely local-only items (offline creation)', () => {
    const merged = mergeWithTombstones([], [{ id: 'new', title: 'offline' }])
    expect(merged).toHaveLength(1)
  })

  it('falls back to local when neither side has timestamps and nothing is deleted', () => {
    const merged = mergeWithTombstones([{ id: 'a', title: 'cloud' }], [{ id: 'a', title: 'local' }])
    expect(merged[0].title).toBe('local')
  })

  // The bug this pair pins down: an event edited on the laptop uploaded fine, but the
  // phone's untouched copy carried no updatedAt, won the merge as "local", and got
  // pushed back over the edit. Only one side having a stamp means that side is the one
  // that was touched.
  it('a stamped cloud edit beats an unstamped local copy', () => {
    const merged = mergeWithTombstones(
      [{ id: 'a', title: 'edited on laptop', updatedAt: '2026-08-19T10:00:00.000Z' }],
      [{ id: 'a', title: 'stale on phone' }],
    )
    expect(merged[0].title).toBe('edited on laptop')
  })

  it('a stamped local edit still beats an unstamped cloud copy', () => {
    const merged = mergeWithTombstones(
      [{ id: 'a', title: 'stale in cloud' }],
      [{ id: 'a', title: 'edited here', updatedAt: '2026-08-19T10:00:00.000Z' }],
    )
    expect(merged[0].title).toBe('edited here')
  })

  it('an unstamped cloud row does not resurrect a stamped local tombstone', () => {
    const merged = mergeWithTombstones(
      [{ id: 'a', title: 'still here in cloud' }],
      [softDelete({ id: 'a' }, '2026-08-19T10:00:00.000Z')],
    )
    expect(isDeleted(merged[0])).toBe(true)
  })

  it('skips entries without an id instead of keying them as undefined', () => {
    const merged = mergeWithTombstones([{ title: 'no id' }], [{ id: 'a' }])
    expect(merged.map(m => m.id)).toEqual(['a'])
  })

  it('handles null inputs', () => {
    expect(mergeWithTombstones(null, undefined)).toEqual([])
  })
})

describe('mergeCloudWinsWithTombstones', () => {
  it('cloud wins for ordinary conflicts', () => {
    const merged = mergeCloudWinsWithTombstones(
      [{ id: 'a', title: 'cloud' }],
      [{ id: 'a', title: 'local' }],
    )
    expect(merged[0].title).toBe('cloud')
  })

  it('does NOT resurrect a locally deleted item on manual refresh', () => {
    const merged = mergeCloudWinsWithTombstones(
      [{ id: 'a', title: 'still here in cloud' }],
      [softDelete({ id: 'a' })],
    )
    expect(isDeleted(merged[0])).toBe(true)
  })

  it('accepts a cloud tombstone over a live local row', () => {
    const merged = mergeCloudWinsWithTombstones([softDelete({ id: 'a' })], [{ id: 'a' }])
    expect(isDeleted(merged[0])).toBe(true)
  })

  it('keeps local-only items', () => {
    const merged = mergeCloudWinsWithTombstones([], [{ id: 'x' }])
    expect(merged.map(m => m.id)).toEqual(['x'])
  })
})
