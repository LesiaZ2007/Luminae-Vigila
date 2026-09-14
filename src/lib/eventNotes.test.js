import { describe, it, expect } from 'vitest'
import { flattenNotes, noteLineBudget, titleLineBudget } from '@/lib/eventNotes'

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

describe('titleLineBudget', () => {
  // The whole point: the block clips on a line boundary, never through one.
  it('is always a whole number of lines', () => {
    for (const durationMins of [15, 30, 45, 50, 60, 75, 90, 120, 240]) {
      expect(Number.isInteger(titleLineBudget({ durationMins }))).toBe(true)
    }
  })

  // Without a line the event would render as a coloured blank.
  it('always allows at least one line, however short the event', () => {
    expect(titleLineBudget({ durationMins: 5 })).toBe(1)
    expect(titleLineBudget({ durationMins: 30 })).toBe(1)
  })

  it('lets the title wrap once the block is tall enough to hold a second line', () => {
    expect(titleLineBudget({ durationMins: 60 })).toBe(2)
  })

  it('gives more lines to longer events', () => {
    expect(titleLineBudget({ durationMins: 90 }))
      .toBeGreaterThan(titleLineBudget({ durationMins: 45 }))
  })

  // A title is a label. Past three lines the block is a wall of text and the notes
  // underneath — usually the room number — get pushed out of a block with room for them.
  it('stops at three lines however long the event runs', () => {
    expect(titleLineBudget({ durationMins: 8 * 60 })).toBe(3)
  })

  // The all-day lane grows with its content, so there is no height to budget against.
  it('does not clamp all-day events by duration', () => {
    expect(titleLineBudget({ durationMins: 999, allDay: true })).toBe(3)
    expect(titleLineBudget({ durationMins: 30,  allDay: true })).toBe(3)
  })

  it('falls back to one line rather than NaN for a missing or nonsense duration', () => {
    expect(titleLineBudget({ durationMins: undefined })).toBe(1)
    expect(titleLineBudget({ durationMins: NaN })).toBe(1)
    expect(titleLineBudget({ durationMins: -60 })).toBe(1)
  })
})
