import { describe, it, expect } from 'vitest'
import { todoBucketBounds, bucketForDate, UPCOMING_DAYS } from '@/lib/todoBuckets'

const TODAY = '2026-09-14'
const bounds = todoBucketBounds(TODAY)

describe('todoBucketBounds', () => {
  it('reaches three days out for Upcoming and a week for This Week', () => {
    expect(bounds.today).toBe('2026-09-14')
    expect(bounds.upcoming).toBe('2026-09-17')
    expect(bounds.week).toBe('2026-09-21')
    expect(bounds.later).toBe('2026-09-28')
  })

  it('rolls over month ends', () => {
    expect(todoBucketBounds('2026-09-29').upcoming).toBe('2026-10-02')
    expect(todoBucketBounds('2026-12-30').week).toBe('2027-01-06')
  })

  it('handles a leap day', () => {
    expect(todoBucketBounds('2028-02-27').upcoming).toBe('2028-03-01')
  })

  // The bug this module exists to avoid: `toISOString` would move these forward a day
  // for anyone west of Greenwich in the evening, shunting tasks a heading early.
  it('stays on the local date whatever time of day it is', () => {
    expect(todoBucketBounds('2026-09-14').upcoming).toBe('2026-09-17')
  })
})

describe('bucketForDate', () => {
  it('puts anything before today in Overdue', () => {
    expect(bucketForDate('2026-09-13', bounds)).toBe('overdue')
    expect(bucketForDate('2025-01-01', bounds)).toBe('overdue')
  })

  it('puts today in Today', () => {
    expect(bucketForDate(TODAY, bounds)).toBe('today')
  })

  it('puts the next three days in Upcoming', () => {
    expect(bucketForDate('2026-09-15', bounds)).toBe('upcoming')
    expect(bucketForDate('2026-09-16', bounds)).toBe('upcoming')
    expect(bucketForDate('2026-09-17', bounds)).toBe('upcoming')
  })

  // The boundary is the whole point of the split — day 4 belongs to the calmer half.
  it('hands the rest of the week to This Week', () => {
    expect(bucketForDate('2026-09-18', bounds)).toBe('week')
    expect(bucketForDate('2026-09-21', bounds)).toBe('week')
  })

  it('keeps the outer buckets where they were', () => {
    expect(bucketForDate('2026-09-22', bounds)).toBe('later')
    expect(bucketForDate('2026-09-28', bounds)).toBe('later')
    expect(bucketForDate('2026-09-29', bounds)).toBe('future')
  })

  it('files an undated task under No Date', () => {
    expect(bucketForDate(null, bounds)).toBe('none')
    expect(bucketForDate(undefined, bounds)).toBe('none')
    expect(bucketForDate('', bounds)).toBe('none')
  })

  // Every date has to land somewhere, or tasks vanish from the list entirely.
  it('assigns every day of the next month to exactly one bucket', () => {
    const seen = new Set()
    for (let i = -5; i <= 40; i++) {
      const d = new Date(2026, 8, 14 + i)
      const str = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const bucket = bucketForDate(str, bounds)
      expect(bucket).toBeTruthy()
      expect(bucket).not.toBe('none')
      seen.add(bucket)
    }
    expect(seen).toEqual(new Set(['overdue', 'today', 'upcoming', 'week', 'later', 'future']))
  })

  it('exports the Upcoming horizon so the label can say it', () => {
    expect(UPCOMING_DAYS).toBe(3)
  })
})
