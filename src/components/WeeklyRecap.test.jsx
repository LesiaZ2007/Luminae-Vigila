/**
 * @vitest-environment jsdom
 *
 * Regression cover for the "Your week" card reading 0h while the timer reported
 * 25m focused. The card read `durationMs`, FocusTimer writes `durationSec`, so
 * every session summed to zero — a field-name mismatch no test would have caught
 * because nothing rendered this component.
 *
 * Dates are computed relative to the real clock rather than frozen. Fake timers
 * deadlock here: the component schedules a confetti timeout and pulls in a
 * dynamically imported child, and stalling the clock stalls both.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import WeeklyRecap from './WeeklyRecap'
import { toDateStr } from '@/lib/localDate'

vi.mock('@/lib/pushClient', () => ({
  pushPermission: () => 'granted',
  enablePush: vi.fn(),
}))

/** A local date string N days from today. */
const daysAway = n => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return toDateStr(d)
}

/** Sunday of the current week — the first day that must still count as "this week". */
const weekStart = () => daysAway(-new Date().getDay())

// The real FocusTimer shape: seconds, and a bare local date string.
const session = (over = {}) => ({
  id: 'fs-1', courseId: null, courseName: null,
  durationSec: 25 * 60, date: toDateStr(new Date()),
  ...over,
})

function seed(sessions) {
  localStorage.setItem('lv-study-sessions', JSON.stringify(sessions))
  localStorage.setItem('lv-streak', JSON.stringify({
    streak: 1, bestStreak: 1, completionDates: [toDateStr(new Date())], lastWeekCompleted: 0,
  }))
}

describe('WeeklyRecap focus total', () => {
  beforeEach(() => localStorage.clear())

  it('counts a session stored as durationSec — the actual bug', () => {
    seed([session()])
    render(<WeeklyRecap />)
    expect(screen.getByText('25m')).toBeInTheDocument()
  })

  it('shows minutes rather than rounding a sub-hour total down to 0h', () => {
    seed([session({ durationSec: 25 * 60 })])
    render(<WeeklyRecap />)
    expect(screen.queryByText('0h')).not.toBeInTheDocument()
  })

  it('switches to hours once past an hour', () => {
    seed([session({ id: 'a', durationSec: 3600 }), session({ id: 'b', durationSec: 1800 })])
    render(<WeeklyRecap />)
    expect(screen.getByText('1.5h')).toBeInTheDocument()
  })

  it('counts a session dated the first day of the week', () => {
    // A bare 'YYYY-MM-DD' parsed as UTC midnight lands on the previous evening
    // locally, dropping it out of a week that had only just started.
    seed([session({ date: weekStart() })])
    render(<WeeklyRecap />)
    expect(screen.getByText('25m')).toBeInTheDocument()
  })

  it('excludes sessions from before this week', () => {
    seed([session({ date: daysAway(-14) })])
    render(<WeeklyRecap />)
    expect(screen.getByText('0h')).toBeInTheDocument()
  })

  it('still tolerates an older durationMs shape', () => {
    seed([{ id: 'old', durationMs: 25 * 60 * 1000, date: toDateStr(new Date()) }])
    render(<WeeklyRecap />)
    expect(screen.getByText('25m')).toBeInTheDocument()
  })

  it('reads zero without crashing when nothing is stored', () => {
    seed([])
    render(<WeeklyRecap />)
    expect(screen.getByText('0h')).toBeInTheDocument()
  })

  it('settles instead of re-rendering forever when props are fresh arrays', () => {
    // `todos` / `canvasAssignments` default to `[]`, and a default parameter
    // builds a new array every render — which made `refresh`'s identity churn,
    // re-run its effect, setState, and render again, without end. It killed the
    // whole vitest worker rather than failing an assertion, which is what an
    // infinite render loop looks like from the outside. Passing literals here
    // reproduces the worst case a caller can create.
    seed([session()])
    let renders = 0
    function Counting() {
      renders++
      return <WeeklyRecap todos={[]} canvasAssignments={[]} />
    }
    render(<Counting />)
    expect(renders).toBeLessThan(10)
    expect(screen.getByText('25m')).toBeInTheDocument()
  })
})
