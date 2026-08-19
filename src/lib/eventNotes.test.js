import { describe, it, expect } from 'vitest'
import { flattenNotes, noteLineBudget } from '@/lib/eventNotes'

describe('flattenNotes', () => {
  it('collapses newlines into one readable run', () => {
    expect(flattenNotes('Room 204\n\nBring calculator')).toBe('Room 204 Bring calculator')
  })

  // Google descriptions are frequently a wall of invite markup.
  it('strips HTML rather than rendering it inside a calendar block', () => {
    expect(flattenNotes('<b>Join</b> <a href="https://x">here</a>')).toBe('Join here')
  })

  it('decodes the entities that survive tag stripping', () => {
    expect(flattenNotes('Ben&nbsp;&amp;&nbsp;Jerry')).toBe('Ben & Jerry')
    expect(flattenNotes('&lt;script&gt;')).toBe('<script>')
  })

  it('is empty for nothing, so the caller can skip the row entirely', () => {
    expect(flattenNotes('')).toBe('')
    expect(flattenNotes(null)).toBe('')
    expect(flattenNotes(undefined)).toBe('')
    expect(flattenNotes('   \n  ')).toBe('')
  })
})

describe('noteLineBudget', () => {
  // A single clipped half-line of grey text reads as a rendering bug.
  it('shows nothing on short events', () => {
    expect(noteLineBudget({ durationMins: 30 })).toBe(0)
    expect(noteLineBudget({ durationMins: 60 })).toBe(0)
  })

  it('starts showing notes once there is room for a whole line', () => {
    expect(noteLineBudget({ durationMins: 90 })).toBe(1)
  })

  it('gives more lines to longer events', () => {
    const oneHalf = noteLineBudget({ durationMins: 90 })
    const three   = noteLineBudget({ durationMins: 180 })
    expect(three).toBeGreaterThan(oneHalf)
  })

  it('never fills the whole block with grey text', () => {
    expect(noteLineBudget({ durationMins: 8 * 60 })).toBeLessThanOrEqual(6)
  })

  // The all-day lane is a fixed short row laid out horizontally.
  it('shows nothing for all-day events regardless of duration', () => {
    expect(noteLineBudget({ durationMins: 999, allDay: true })).toBe(0)
  })

  it('needs a taller event on mobile, where narrow columns wrap the title further', () => {
    expect(noteLineBudget({ durationMins: 90, isMobile: true }))
      .toBeLessThan(noteLineBudget({ durationMins: 90, isMobile: false }))
  })

  // Linked tasks already occupy those rows; spending them twice would overflow.
  it('yields space to linked tasks', () => {
    const alone  = noteLineBudget({ durationMins: 180 })
    const shared = noteLineBudget({ durationMins: 180, linkedCount: 3 })
    expect(shared).toBeLessThan(alone)
  })

  it('returns 0 rather than NaN for a missing or nonsense duration', () => {
    expect(noteLineBudget({ durationMins: undefined })).toBe(0)
    expect(noteLineBudget({ durationMins: NaN })).toBe(0)
    expect(noteLineBudget({ durationMins: -60 })).toBe(0)
  })

  it('never returns a negative count when linked tasks exceed the space', () => {
    expect(noteLineBudget({ durationMins: 90, linkedCount: 10 })).toBe(0)
  })
})
