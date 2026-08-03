import { afterEach, vi } from 'vitest'

/**
 * Shared test setup.
 *
 * This runs for *every* test file, including the pure-logic ones that use the
 * default `node` environment — so everything DOM-related is guarded. Reaching
 * for `window` unconditionally here took out the whole lib suite.
 */
if (typeof window !== 'undefined') {
  // Imported lazily so the node-environment tests never load React DOM.
  const { cleanup } = await import('@testing-library/react')
  await import('@testing-library/jest-dom/vitest')

  // RTL doesn't auto-clean here, and a leaked DOM makes the *next* test fail in
  // a confusing, unrelated-looking way.
  afterEach(cleanup)

  // jsdom implements neither of these, and components rely on both:
  //   matchMedia — prefers-reduced-motion checks (tab centring, animations)
  //   scrollTo   — the list-switcher centring
  if (!window.matchMedia) {
    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  }

  if (!Element.prototype.scrollTo) {
    Element.prototype.scrollTo = vi.fn()
  }
}
