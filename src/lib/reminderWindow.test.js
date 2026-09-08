import { describe, it, expect, beforeEach } from 'vitest'
import {
  shouldScan, recordScan, invalidateReminderWindow, reminderWindowState,
  earliestFuture, MAX_SKIP_MS, LEAD_MS,
} from './reminderWindow'

const T = 1_700_000_000_000 // fixed "now", so nothing here depends on the clock

beforeEach(() => { invalidateReminderWindow() })

describe('shouldScan', () => {
  it('scans on a cold start — no information is never a reason to skip', () => {
    expect(shouldScan(T)).toBe(true)
  })

  it('skips once a scan has reported nothing ahead', () => {
    recordScan(T, null)
    expect(shouldScan(T + 60_000)).toBe(false)
  })

  it('scans again once the cache expires, so a newly created reminder is found', () => {
    recordScan(T, null)
    expect(shouldScan(T + MAX_SKIP_MS - 1)).toBe(false)
    expect(shouldScan(T + MAX_SKIP_MS)).toBe(true)
  })

  it('skips every tick before a known due time', () => {
    recordScan(T, T + 10 * 60_000)
    expect(shouldScan(T + 60_000)).toBe(false)
    expect(shouldScan(T + 5 * 60_000)).toBe(false)
  })

  it('wakes LEAD_MS early so the send is not a tick late', () => {
    const due = T + 10 * 60_000
    recordScan(T, due)
    expect(shouldScan(due - LEAD_MS - 1)).toBe(false)
    expect(shouldScan(due - LEAD_MS)).toBe(true)
    expect(shouldScan(due)).toBe(true)
  })

  it('does not let a due time beyond the cache expiry suppress the expiry scan', () => {
    recordScan(T, T + 6 * 60 * 60_000) // six hours out
    expect(shouldScan(T + MAX_SKIP_MS)).toBe(true)
  })

  it('scans after an invalidation, whatever it knew before', () => {
    recordScan(T, T + 6 * 60 * 60_000)
    expect(shouldScan(T + 60_000)).toBe(false)
    invalidateReminderWindow()
    expect(shouldScan(T + 60_000)).toBe(true)
  })
})

describe('recordScan', () => {
  it('refuses a due time that is not in the future', () => {
    // Otherwise shouldScan would be true forever and the skip would never happen.
    recordScan(T, T - 1)
    expect(reminderWindowState().nextDueAt).toBe(null)
    expect(shouldScan(T + 60_000)).toBe(false)
  })

  it('ignores a non-numeric due time rather than caching garbage', () => {
    recordScan(T, 'soon')
    expect(reminderWindowState().nextDueAt).toBe(null)
  })
})

describe('earliestFuture', () => {
  it('returns the soonest candidate after now', () => {
    const candidates = [{ at: T + 500 }, { at: T + 100 }, { at: T + 900 }]
    expect(earliestFuture(candidates, T)).toBe(T + 100)
  })

  it('ignores anything already past — those are sent or out of the grace window', () => {
    expect(earliestFuture([{ at: T - 1 }, { at: T }, { at: T + 7 }], T)).toBe(T + 7)
  })

  it('returns null when nothing is ahead', () => {
    expect(earliestFuture([{ at: T - 1000 }], T)).toBe(null)
    expect(earliestFuture([], T)).toBe(null)
    expect(earliestFuture(undefined, T)).toBe(null)
  })

  it('skips malformed candidates instead of caching NaN', () => {
    expect(earliestFuture([{ at: NaN }, { }, null, { at: T + 5 }], T)).toBe(T + 5)
  })
})
