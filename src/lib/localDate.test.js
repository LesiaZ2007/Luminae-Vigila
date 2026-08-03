// Runs with TZ=America/New_York (see vitest.config.js), which is what makes the
// UTC-rollover cases below meaningful.
import { describe, it, expect } from 'vitest'
import { toDateStr, todayStr, addDaysStr, dateStrOf, isOverdue } from './localDate'

describe('toDateStr', () => {
  it('formats in local time, not UTC', () => {
    // 9pm Aug 3 in New York is already Aug 4 in UTC — the exact case that made
    // the badge count tomorrow's tasks every evening.
    const evening = new Date('2026-08-03T21:00:00-04:00')
    expect(evening.toISOString().slice(0, 10)).toBe('2026-08-04') // the old bug
    expect(toDateStr(evening)).toBe('2026-08-03')                 // the fix
  })

  it('zero-pads month and day', () => {
    expect(toDateStr(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('returns empty string for an invalid date', () => {
    expect(toDateStr(new Date('nonsense'))).toBe('')
  })
})

describe('addDaysStr', () => {
  const base = new Date(2026, 7, 3, 12) // Aug 3 2026, local noon

  it('moves forwards and backwards', () => {
    expect(addDaysStr(1, base)).toBe('2026-08-04')
    expect(addDaysStr(-1, base)).toBe('2026-08-02')
    expect(addDaysStr(0, base)).toBe('2026-08-03')
  })

  it('crosses month and year boundaries', () => {
    expect(addDaysStr(1, new Date(2026, 11, 31, 12))).toBe('2027-01-01')
  })

  it('survives a DST transition', () => {
    // Nov 1 2026 is the US fall-back. Naive `+86400000` arithmetic lands on the
    // wrong day here; setDate does not.
    expect(addDaysStr(1, new Date(2026, 10, 1, 12))).toBe('2026-11-02')
  })
})

describe('dateStrOf', () => {
  it('passes bare date strings through untouched', () => {
    // new Date('2026-08-03') is UTC midnight, which is Aug 2 in New York.
    expect(dateStrOf('2026-08-03')).toBe('2026-08-03')
  })

  it('converts full timestamps to the local date', () => {
    expect(dateStrOf('2026-08-04T01:00:00Z')).toBe('2026-08-03')
  })

  it('returns empty string for missing input', () => {
    expect(dateStrOf(null)).toBe('')
    expect(dateStrOf('')).toBe('')
  })
})

describe('isOverdue', () => {
  const now = new Date(2026, 7, 3, 12)

  it('is true only for dates strictly before today', () => {
    expect(isOverdue('2026-08-02', now)).toBe(true)
    expect(isOverdue('2026-08-03', now)).toBe(false)
    expect(isOverdue('2026-08-04', now)).toBe(false)
  })

  it('treats a missing due date as not overdue', () => {
    expect(isOverdue(null, now)).toBe(false)
  })
})

describe('todayStr', () => {
  it('agrees with toDateStr', () => {
    const now = new Date(2026, 7, 3, 23, 30)
    expect(todayStr(now)).toBe(toDateStr(now))
  })
})
