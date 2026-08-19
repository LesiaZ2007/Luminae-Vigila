/**
 * @vitest-environment jsdom
 *
 * Unusual for a lib test, but this module's whole job is mutating
 * document.documentElement — the node default has no DOM to assert against.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  withThemeTransition,
  prefersReducedMotion,
  THEME_TRANSITION_CLASS,
  THEME_TRANSITION_MS,
} from './themeTransition'

/** A window stub whose reduced-motion answer we control. */
function fakeWindow(reduced) {
  return { matchMedia: () => ({ matches: reduced }) }
}

const noMotionPreference = fakeWindow(false)

describe('prefersReducedMotion', () => {
  it('reads the reduce media query', () => {
    expect(prefersReducedMotion(fakeWindow(true))).toBe(true)
    expect(prefersReducedMotion(fakeWindow(false))).toBe(false)
  })

  it('treats a missing matchMedia as no preference', () => {
    // Some embedded webviews (the Android TWA shell among them) do not expose it.
    expect(prefersReducedMotion({})).toBe(false)
    expect(prefersReducedMotion(undefined)).toBe(false)
  })

  it('treats a throwing matchMedia as no preference', () => {
    expect(prefersReducedMotion({ matchMedia: () => { throw new Error('nope') } })).toBe(false)
  })
})

describe('withThemeTransition', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.documentElement.classList.remove(THEME_TRANSITION_CLASS)
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('adds the class, applies the theme, then removes it', () => {
    const apply = vi.fn(() => {
      // The class has to be on before the theme flips, or the first repaint of the
      // new palette lands with no transition attached and the flash is back.
      expect(document.documentElement.classList.contains(THEME_TRANSITION_CLASS)).toBe(true)
    })

    withThemeTransition(apply, { window: noMotionPreference })

    expect(apply).toHaveBeenCalledTimes(1)
    expect(document.documentElement.classList.contains(THEME_TRANSITION_CLASS)).toBe(true)

    vi.advanceTimersByTime(THEME_TRANSITION_MS)
    expect(document.documentElement.classList.contains(THEME_TRANSITION_CLASS)).toBe(false)
  })

  it('still applies the theme instantly under reduced motion', () => {
    const apply = vi.fn()
    withThemeTransition(apply, { window: fakeWindow(true) })

    expect(apply).toHaveBeenCalledTimes(1)
    expect(document.documentElement.classList.contains(THEME_TRANSITION_CLASS)).toBe(false)
  })

  it('applies the theme when there is no document at all', () => {
    const apply = vi.fn()
    withThemeTransition(apply, { window: noMotionPreference, document: undefined })
    expect(apply).toHaveBeenCalledTimes(1)
  })

  it('does not let an earlier toggle strip the class off a later one', () => {
    withThemeTransition(() => {}, { window: noMotionPreference })
    vi.advanceTimersByTime(THEME_TRANSITION_MS - 50)

    // Second toggle mid-animation: the first timer must not fire 50ms from now and
    // cut this one short.
    withThemeTransition(() => {}, { window: noMotionPreference })
    vi.advanceTimersByTime(60)
    expect(document.documentElement.classList.contains(THEME_TRANSITION_CLASS)).toBe(true)

    vi.advanceTimersByTime(THEME_TRANSITION_MS)
    expect(document.documentElement.classList.contains(THEME_TRANSITION_CLASS)).toBe(false)
  })

  it('cleanup removes the class immediately and cancels the timer', () => {
    const cleanup = withThemeTransition(() => {}, { window: noMotionPreference })
    cleanup()

    expect(document.documentElement.classList.contains(THEME_TRANSITION_CLASS)).toBe(false)
    // Nothing left pending that could touch a torn-down tree.
    expect(vi.getTimerCount()).toBe(0)
  })

  it('returns a usable cleanup even on the reduced-motion path', () => {
    expect(() => withThemeTransition(() => {}, { window: fakeWindow(true) })()).not.toThrow()
  })
})
