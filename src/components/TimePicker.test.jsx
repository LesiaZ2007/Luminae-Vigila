/**
 * @vitest-environment jsdom
 *
 * Written against the existing behaviour *before* removing the internal
 * hour/minute/period mirror, so that refactor has something to be measured
 * against rather than being taken on trust.
 *
 * Scope is deliberately the derivation contract — what 24h `value` renders as,
 * and that it keeps following the prop — because that is the whole of what the
 * refactor touches. Driving the radial SVG clock face through jsdom was tried
 * and abandoned: it needs real layout, and the resulting tests assert more about
 * the test harness than about the component.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import TimePicker, { parseTimeString } from './TimePicker'

const show = value => {
  render(<TimePicker value={value} onChange={vi.fn()} />)
}

describe('TimePicker display derivation', () => {
  it('renders a 24h afternoon value in 12h form', () => {
    show('15:30')
    expect(screen.getByText('3:30 PM')).toBeInTheDocument()
  })

  it('renders midnight as 12 AM, not 0 AM', () => {
    show('00:15')
    expect(screen.getByText('12:15 AM')).toBeInTheDocument()
  })

  it('renders noon as 12 PM, not 0 PM', () => {
    show('12:00')
    expect(screen.getByText('12:00 PM')).toBeInTheDocument()
  })

  it('renders 12:59 PM and 13:00 either side of the hour', () => {
    const { unmount } = render(<TimePicker value="12:59" onChange={vi.fn()} />)
    expect(screen.getByText('12:59 PM')).toBeInTheDocument()
    unmount()
    show('13:00')
    expect(screen.getByText('1:00 PM')).toBeInTheDocument()
  })

  it('zero-pads minutes', () => {
    show('08:05')
    expect(screen.getByText('8:05 AM')).toBeInTheDocument()
  })

  it('falls back to 9:00 AM when value is empty', () => {
    show('')
    expect(screen.getByText('9:00 AM')).toBeInTheDocument()
  })

  it('follows the value prop when it changes from outside', () => {
    // The point of the refactor: this used to work via an effect mirroring the
    // prop into state. It must still hold once the values are derived instead.
    const { rerender } = render(<TimePicker value="09:00" onChange={vi.fn()} />)
    expect(screen.getByText('9:00 AM')).toBeInTheDocument()

    rerender(<TimePicker value="17:45" onChange={vi.fn()} />)
    expect(screen.getByText('5:45 PM')).toBeInTheDocument()

    rerender(<TimePicker value="00:00" onChange={vi.fn()} />)
    expect(screen.getByText('12:00 AM')).toBeInTheDocument()
  })
})

/**
 * The typed-entry parser is the half of this component jsdom *can* exercise
 * properly, and the half people hit hardest — the clock face is a fallback for
 * when you don't already know the time you want.
 */
describe('parseTimeString', () => {
  const cases = [
    // 24-hour
    ['15:30',      15, 30],
    ['09:05',       9,  5],
    ['00:00',       0,  0],
    ['23:59',      23, 59],
    ['12:00:30',   12,  0],   // seconds ignored
    // 12-hour, in the spellings people actually use
    ['3:30 PM',    15, 30],
    ['3:30pm',     15, 30],
    ['3:30 p.m.',  15, 30],
    ['3pm',        15,  0],
    ['3p',         15,  0],
    ['3 P',        15,  0],
    ['12am',        0,  0],
    ['12:15 AM',    0, 15],
    ['12pm',       12,  0],
    // Separator-free, which is how a time gets typed fast
    ['330p',       15, 30],
    ['1530',       15, 30],
    ['930',         9, 30],
    ['115',         1, 15],
    // Other separators
    ['3.30 pm',    15, 30],
    ['3h30',        3, 30],
    ['7 45',        7, 45],
    // Single-digit minute
    ['3:5',         3,  5],
    // Bare hour
    ['9',           9,  0],
    ['15',         15,  0],
    ['0',           0,  0],
    // Words
    ['noon',       12,  0],
    ['midnight',    0,  0],
    ['  NOON  ',   12,  0],
  ]

  for (const [input, h24, min] of cases) {
    it(`parses ${JSON.stringify(input)} as ${h24}:${String(min).padStart(2, '0')}`, () => {
      expect(parseTimeString(input)).toEqual({ h24, min })
    })
  }

  const rejected = ['', '   ', 'lunch', '24:00', '25', '3:60', '12:99', 'pm', '13pm', '0pm', 'abc', '99999']

  for (const input of rejected) {
    it(`rejects ${JSON.stringify(input)}`, () => {
      expect(parseTimeString(input)).toBeNull()
    })
  }

  it('rejects rather than guessing, so a typo reverts instead of silently moving the time', () => {
    expect(parseTimeString('3:75 pm')).toBeNull()
  })
})
