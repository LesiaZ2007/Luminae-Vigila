/**
 * Smooth light/dark switching.
 *
 * The theme is a swap of CSS custom properties on `<html>` (see globals.css), and a
 * custom property change is not animatable on its own — every surface, border and
 * label repaints in the same frame, which reads as a hard flash rather than a mode
 * change. Putting a permanent `transition` on those properties is not the fix either:
 * it would animate the first paint after hydration, and it would drag out every
 * ordinary hover and focus change for the rest of the session.
 *
 * So the transition is applied *only* for the length of the switch. We add a class to
 * `<html>`, flip the theme, and take the class off once the animation has run.
 */

export const THEME_TRANSITION_CLASS = 'theme-transition'

/** Keep in sync with the duration in globals.css. */
export const THEME_TRANSITION_MS = 320

/**
 * Someone who has asked their OS for less motion is asking for less of this, too —
 * a full-page cross-fade is exactly the kind of large-area movement the setting is
 * meant to suppress. They get the instant swap instead.
 */
export function prefersReducedMotion(win = globalThis) {
  try {
    return !!win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
  } catch {
    // matchMedia is missing in some embedded webviews; treat that as "no preference".
    return false
  }
}

// A toggle fired while a previous one is still animating must not let the earlier
// timer strip the class out from under it, so the pending timer is module-level and
// gets cleared rather than left to race.
let pendingTimer = null

/**
 * Run `apply` (the actual `setTheme` call) wrapped in the transition class.
 *
 * Returns a cleanup function that cancels the pending removal — callers in React
 * should invoke it on unmount so a timer never fires against a torn-down tree.
 */
export function withThemeTransition(apply, { window: win = globalThis, document: doc = globalThis.document } = {}) {
  const root = doc?.documentElement

  // No DOM (SSR, or a test without jsdom) and reduced motion both fall through to the
  // plain swap. The theme still changes; it just changes instantly.
  if (!root || prefersReducedMotion(win)) {
    apply()
    return () => {}
  }

  if (pendingTimer !== null) {
    clearTimeout(pendingTimer)
    pendingTimer = null
  }

  root.classList.add(THEME_TRANSITION_CLASS)
  apply()

  pendingTimer = setTimeout(() => {
    root.classList.remove(THEME_TRANSITION_CLASS)
    pendingTimer = null
  }, THEME_TRANSITION_MS)

  return () => {
    if (pendingTimer !== null) {
      clearTimeout(pendingTimer)
      pendingTimer = null
    }
    root.classList.remove(THEME_TRANSITION_CLASS)
  }
}
