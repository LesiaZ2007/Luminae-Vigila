/**
 * @vitest-environment jsdom
 *
 * Pausing has to keep the time that is left. An effect that re-synced the display
 * to the phase length whenever the timer was not running also fired on the pause
 * itself, so Pause behaved like Reset: 18:42 left became 25:00 again.
 *
 * Only Date and the interval are faked. The component also schedules confetti and
 * auto-start timeouts, and stalling those with the rest of the clock is what made
 * fake timers deadlock in the WeeklyRecap test.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import FocusTimer from './FocusTimer'

vi.mock('@/lib/pushClient', () => ({
  pushPermission: () => 'granted',
  enablePush: vi.fn(),
}))

const clock = () => screen.getByText(/^\d{2}:\d{2}$/).textContent

function start() {
  fireEvent.click(screen.getByTitle('Start'))
}

function pause() {
  fireEvent.click(screen.getByTitle('Pause'))
}

function wait(ms) {
  act(() => { vi.advanceTimersByTime(ms) })
}

describe('FocusTimer — pausing', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps the remaining time on pause, and resumes from it', () => {
    render(<FocusTimer open onClose={() => {}} />)
    expect(clock()).toBe('25:00')

    start()
    wait(90_000)
    expect(clock()).toBe('23:30')

    pause()
    expect(clock()).toBe('23:30')

    // Paused time does not count down.
    wait(60_000)
    expect(clock()).toBe('23:30')

    start()
    wait(30_000)
    expect(clock()).toBe('23:00')
  })

  it('still goes back to the full length on Reset', () => {
    render(<FocusTimer open onClose={() => {}} />)
    start()
    wait(90_000)
    pause()

    fireEvent.click(screen.getByTitle('Reset'))
    expect(clock()).toBe('25:00')
  })

  it('shows a new focus length straight away while idle', () => {
    render(<FocusTimer open onClose={() => {}} />)
    fireEvent.click(screen.getByTitle('Timer settings'))
    fireEvent.change(screen.getByLabelText('Focus'), { target: { value: '40' } })
    expect(clock()).toBe('40:00')
  })

  it('finishes a focus phase, counts it, and moves to the break', () => {
    localStorage.setItem('lv-focus', JSON.stringify({ settings: { focusMin: 1, sound: false, logToCalendar: false, settingsVersion: 2 } }))
    render(<FocusTimer open onClose={() => {}} />)
    start()
    wait(61_000)

    expect(clock()).toBe('05:00')
    expect(JSON.parse(localStorage.getItem('lv-focus')).sessionsToday).toBe(1)
    const logged = JSON.parse(localStorage.getItem('lv-study-sessions'))
    expect(logged).toHaveLength(1)
    expect(logged[0].durationSec).toBe(60)
  })

  it('reads its saved settings on the first render', () => {
    localStorage.setItem('lv-focus', JSON.stringify({ settings: { focusMin: 50, settingsVersion: 2 } }))
    render(<FocusTimer open onClose={() => {}} />)
    expect(clock()).toBe('50:00')
  })
})
