import { describe, it, expect } from 'vitest'
import { daysBetween, shiftIsoDays } from './dateShift'

// vitest.config.js pins TZ to America/New_York, so the DST cases below are
// deterministic: 2026 US DST starts Mar 8 and ends Nov 1.

describe('daysBetween', () => {
  it('counts whole calendar days, not fractional ones', () => {
    // 09:00 Mon → 23:00 Tue is one calendar day, even though it's ~1.6 x 24h
    expect(daysBetween('2026-03-02T09:00:00', '2026-03-03T23:00:00')).toBe(1)
  })

  it('is negative when the target is earlier', () => {
    expect(daysBetween('2026-03-10T09:00:00', '2026-03-07T09:00:00')).toBe(-3)
  })

  it('is zero for two times on the same day', () => {
    expect(daysBetween('2026-03-02T01:00:00', '2026-03-02T23:59:00')).toBe(0)
  })

  it('counts across a DST boundary correctly', () => {
    // Mar 8 2026 is a 23-hour day; a raw ms division would give 6.96 → 7
    expect(daysBetween('2026-03-05T12:00:00', '2026-03-12T12:00:00')).toBe(7)
  })

  it('returns 0 for missing or unparseable input', () => {
    expect(daysBetween(null, '2026-03-02T09:00:00')).toBe(0)
    expect(daysBetween('nonsense', '2026-03-02T09:00:00')).toBe(0)
  })
})

describe('shiftIsoDays', () => {
  it('moves by whole days and keeps the time of day', () => {
    expect(shiftIsoDays('2026-03-02T16:00:00', 3)).toBe('2026-03-05T16:00:00')
  })

  it('moves backwards', () => {
    expect(shiftIsoDays('2026-03-05T16:00:00', -3)).toBe('2026-03-02T16:00:00')
  })

  it('keeps the wall-clock time across a DST start', () => {
    // The naive ms-offset approach would land this at 15:00 or 17:00
    expect(shiftIsoDays('2026-03-06T16:00:00', 4)).toBe('2026-03-10T16:00:00')
  })

  it('keeps the wall-clock time across a DST end', () => {
    expect(shiftIsoDays('2026-10-30T16:00:00', 4)).toBe('2026-11-03T16:00:00')
  })

  it('rolls over months and years', () => {
    expect(shiftIsoDays('2026-01-30T09:00:00', 3)).toBe('2026-02-02T09:00:00')
    expect(shiftIsoDays('2026-12-30T09:00:00', 3)).toBe('2027-01-02T09:00:00')
  })

  it('handles leap day', () => {
    expect(shiftIsoDays('2028-02-28T09:00:00', 1)).toBe('2028-02-29T09:00:00')
  })

  it('preserves a date-only value instead of inventing a time', () => {
    expect(shiftIsoDays('2026-03-02', 2)).toBe('2026-03-04')
  })

  it('returns the input untouched when there is nothing to do', () => {
    expect(shiftIsoDays('2026-03-02T16:00:00', 0)).toBe('2026-03-02T16:00:00')
    expect(shiftIsoDays(null, 3)).toBeNull()
    expect(shiftIsoDays(undefined, 3)).toBeUndefined()
  })
})
