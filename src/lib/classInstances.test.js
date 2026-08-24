import { describe, it, expect } from 'vitest'
import {
  isDateStr, getExceptions, isCancelled, cancelInstance, restoreInstance,
  addInstance, removeInstance, eventDate, applyExceptions,
} from './classInstances'

const CLS = { id: 'cls1', courseName: 'Physics 101', days: [1, 3, 5], startTime: '09:00', endTime: '09:50' }

describe('isDateStr', () => {
  it('accepts a local calendar date', () => {
    expect(isDateStr('2026-08-25')).toBe(true)
  })

  it('rejects anything else', () => {
    for (const v of ['2026-8-25', '2026-13-01', '2026-00-10', '2026-08-32', '', null, 42]) {
      expect(isDateStr(v), String(v)).toBe(false)
    }
  })
})

describe('cancelInstance', () => {
  it('marks one date as cancelled without touching the pattern', () => {
    const out = cancelInstance(CLS, '2026-08-25')
    expect(isCancelled(out, '2026-08-25')).toBe(true)
    expect(out.days).toEqual([1, 3, 5])
    expect(out.startTime).toBe('09:00')
  })

  it('stamps updatedAt so the change survives the sync merge', () => {
    expect(cancelInstance(CLS, '2026-08-25').updatedAt).toBeTruthy()
  })

  it('is idempotent and returns the same object when nothing changes', () => {
    const once = cancelInstance(CLS, '2026-08-25')
    expect(cancelInstance(once, '2026-08-25')).toBe(once)
  })

  it('ignores a malformed date', () => {
    expect(cancelInstance(CLS, 'tuesday')).toBe(CLS)
  })

  it('keeps cancelled dates sorted', () => {
    let c = cancelInstance(CLS, '2026-09-01')
    c = cancelInstance(c, '2026-08-25')
    expect(getExceptions(c).cancelled).toEqual(['2026-08-25', '2026-09-01'])
  })
})

describe('restoreInstance', () => {
  it('puts a cancelled meeting back', () => {
    const c = restoreInstance(cancelInstance(CLS, '2026-08-25'), '2026-08-25')
    expect(isCancelled(c, '2026-08-25')).toBe(false)
  })

  it('does nothing for a date that was never cancelled', () => {
    expect(restoreInstance(CLS, '2026-08-25')).toBe(CLS)
  })
})

describe('addInstance', () => {
  it('adds a one-off meeting', () => {
    const c = addInstance(CLS, { date: '2026-08-26', startTime: '14:00', endTime: '15:00' })
    expect(getExceptions(c).added).toEqual([{ date: '2026-08-26', startTime: '14:00', endTime: '15:00' }])
  })

  it('keeps an optional location and note', () => {
    const c = addInstance(CLS, { date: '2026-08-26', startTime: '14:00', endTime: '15:00', location: 'Lab 2', note: 'Review' })
    expect(getExceptions(c).added[0]).toMatchObject({ location: 'Lab 2', note: 'Review' })
  })

  it('replaces rather than stacks a second extra on the same day', () => {
    let c = addInstance(CLS, { date: '2026-08-26', startTime: '14:00', endTime: '15:00' })
    c = addInstance(c, { date: '2026-08-26', startTime: '16:00', endTime: '17:00' })
    const { added } = getExceptions(c)
    expect(added).toHaveLength(1)
    expect(added[0].startTime).toBe('16:00')
  })

  it('refuses an end at or before the start', () => {
    expect(addInstance(CLS, { date: '2026-08-26', startTime: '15:00', endTime: '15:00' })).toBe(CLS)
    expect(addInstance(CLS, { date: '2026-08-26', startTime: '16:00', endTime: '15:00' })).toBe(CLS)
  })

  it('refuses an incomplete entry', () => {
    expect(addInstance(CLS, { date: '2026-08-26' })).toBe(CLS)
    expect(addInstance(CLS, {})).toBe(CLS)
    expect(addInstance(CLS)).toBe(CLS)
  })

  it('keeps extras sorted by date', () => {
    let c = addInstance(CLS, { date: '2026-09-02', startTime: '14:00', endTime: '15:00' })
    c = addInstance(c, { date: '2026-08-26', startTime: '14:00', endTime: '15:00' })
    expect(getExceptions(c).added.map(a => a.date)).toEqual(['2026-08-26', '2026-09-02'])
  })
})

describe('removeInstance', () => {
  it('drops a one-off meeting', () => {
    const c = removeInstance(addInstance(CLS, { date: '2026-08-26', startTime: '14:00', endTime: '15:00' }), '2026-08-26')
    expect(getExceptions(c).added).toEqual([])
  })

  it('does nothing when there is no extra that day', () => {
    expect(removeInstance(CLS, '2026-08-26')).toBe(CLS)
  })
})

describe('getExceptions', () => {
  it('copes with a class that has never had an exception', () => {
    expect(getExceptions(CLS)).toEqual({ cancelled: [], added: [] })
    expect(getExceptions(undefined)).toEqual({ cancelled: [], added: [] })
  })

  it('discards malformed entries rather than trusting stored data', () => {
    const messy = { exceptions: { cancelled: ['2026-08-25', 'nope', null], added: [{ date: 'bad' }, { date: '2026-08-26' }] } }
    expect(getExceptions(messy).cancelled).toEqual(['2026-08-25'])
    expect(getExceptions(messy).added).toHaveLength(1)
  })

  it('copes with the field being the wrong type entirely', () => {
    expect(getExceptions({ exceptions: { cancelled: 'no', added: 7 } })).toEqual({ cancelled: [], added: [] })
  })
})

describe('eventDate', () => {
  it('reads the day off an ISO string without timezone drift', () => {
    expect(eventDate({ start: '2026-08-25T23:30:00' })).toBe('2026-08-25')
  })

  it('reads the day off a Date in local time', () => {
    expect(eventDate({ start: new Date(2026, 7, 25, 23, 30) })).toBe('2026-08-25')
  })

  it('returns null with no start', () => {
    expect(eventDate({})).toBeNull()
  })
})

describe('applyExceptions', () => {
  const expanded = [
    { id: 'a', start: '2026-08-24T09:00:00' },
    { id: 'b', start: '2026-08-25T09:00:00' },
    { id: 'c', start: '2026-08-26T09:00:00' },
  ]
  const makeExtra = a => ({ id: 'extra_' + a.date, start: a.date + 'T' + a.startTime + ':00' })

  it('drops cancelled meetings', () => {
    const c = cancelInstance(CLS, '2026-08-25')
    expect(applyExceptions(c, expanded, makeExtra).map(e => e.id)).toEqual(['a', 'c'])
  })

  it('appends extras', () => {
    const c = addInstance(CLS, { date: '2026-08-29', startTime: '14:00', endTime: '15:00' })
    expect(applyExceptions(c, expanded, makeExtra).map(e => e.id)).toContain('extra_2026-08-29')
  })

  it('allows an extra on a cancelled date, which is how a moved class is expressed', () => {
    let c = cancelInstance(CLS, '2026-08-25')
    c = addInstance(c, { date: '2026-08-25', startTime: '14:00', endTime: '15:00' })
    const ids = applyExceptions(c, expanded, makeExtra).map(e => e.id)
    expect(ids).not.toContain('b')
    expect(ids).toContain('extra_2026-08-25')
  })

  it('leaves an untouched class exactly as expanded', () => {
    expect(applyExceptions(CLS, expanded, makeExtra)).toHaveLength(3)
  })
})
