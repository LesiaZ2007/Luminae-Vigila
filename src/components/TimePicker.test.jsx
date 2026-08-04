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
import TimePicker from './TimePicker'

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
