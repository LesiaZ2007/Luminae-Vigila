// Runs with TZ=America/New_York (see vitest.config.js). Canvas sends due dates as UTC
// instants, which is what makes the evening cases below land on a different UTC day.
import { describe, it, expect } from 'vitest'
import { formatDue } from './AssignmentRow'

const at = iso => new Date(iso)

describe('formatDue', () => {
  it('says "Due today" all day for something due tonight', () => {
    // Due 11:59pm, looked at 9am the same day. Rounding 15 hours up to a whole
    // day used to call this "Due tomorrow".
    const due = '2026-10-08T03:59:00Z' // 11:59pm Oct 7 in New York
    expect(formatDue(due, at('2026-10-07T09:00:00-04:00'))).toEqual(
      { label: 'Due today', urgent: true, past: false })
  })

  it('says "Due today", and overdue, once a same-day deadline has passed', () => {
    // Due 8am, looked at 8pm. Rounding 12 hours past down to a day used to call
    // this "Due yesterday".
    const due = '2026-10-07T12:00:00Z' // 8am Oct 7 in New York
    expect(formatDue(due, at('2026-10-07T20:00:00-04:00'))).toEqual(
      { label: 'Due today', urgent: true, past: true })
  })

  it('counts calendar days, not 24-hour spans', () => {
    const now = at('2026-10-07T22:00:00-04:00')
    // 9am tomorrow is 11 hours away, and still tomorrow.
    expect(formatDue('2026-10-08T13:00:00Z', now).label).toBe('Due tomorrow')
    // Midnight-ish yesterday is a few hours ago, and yesterday.
    expect(formatDue('2026-10-07T03:30:00Z', now)).toEqual(
      { label: 'Due yesterday', urgent: false, past: true })
  })

  it('counts the days ahead within a week, then gives the date', () => {
    const now = at('2026-10-07T12:00:00-04:00')
    expect(formatDue('2026-10-10T16:00:00Z', now).label).toBe('Due in 3 days')
    expect(formatDue('2026-10-20T16:00:00Z', now).label).toBe('Oct 20')
  })

  it('gives the date for anything more than a day overdue', () => {
    expect(formatDue('2026-10-01T16:00:00Z', at('2026-10-07T12:00:00-04:00'))).toEqual(
      { label: 'Oct 1', urgent: false, past: true })
  })

  it('returns null with no date, or one that does not parse', () => {
    expect(formatDue(null)).toBeNull()
    expect(formatDue('not a date')).toBeNull()
  })
})
