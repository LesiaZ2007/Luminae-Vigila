import { describe, it, expect } from 'vitest'
import { toUpsertRows } from './syncRows'

describe('toUpsertRows', () => {
  it('turns items into id/data records', () => {
    expect(toUpsertRows([{ id: 'a', title: 'One' }])).toEqual([
      { id: 'a', data: { id: 'a', title: 'One' } },
    ])
  })

  it('drops items with no usable id', () => {
    const rows = toUpsertRows([{ id: 'a' }, {}, null, undefined, { id: '' }])
    expect(rows.map(r => r.id)).toEqual(['a'])
  })

  it('deduplicates by id, last one winning', () => {
    // ON CONFLICT DO UPDATE errors if one statement presents the same key twice,
    // so this is required rather than tidy.
    const rows = toUpsertRows([{ id: 'a', v: 1 }, { id: 'a', v: 2 }])
    expect(rows).toEqual([{ id: 'a', data: { id: 'a', v: 2 } }])
  })

  it('stringifies numeric ids — the id column is TEXT', () => {
    expect(toUpsertRows([{ id: 7 }])[0].id).toBe('7')
  })

  it('applies prepare to the stored data, not to the id', () => {
    const rows = toUpsertRows(
      [{ id: 'a' }],
      item => ({ ...item, updatedAt: '2026-01-01T00:00:00.000Z' }),
    )
    expect(rows).toEqual([
      { id: 'a', data: { id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' } },
    ])
  })

  it('returns an empty array for an empty or missing collection', () => {
    // The caller turns this into a payload that clears the table, which is what an
    // empty array from the client means.
    expect(toUpsertRows([])).toEqual([])
    expect(toUpsertRows(undefined)).toEqual([])
  })
})
