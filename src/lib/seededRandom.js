/**
 * seededRandom.js — deterministic pseudo-randomness for decorative particles.
 *
 * Every ambient background and the confetti burst scatter particles with
 * `Math.random()` during render. That's impure, and not merely as a lint
 * technicality:
 *
 *   - Confetti had no memo at all, so *every* re-render while it was mounted
 *     re-rolled all 70 particles and the burst visibly jumped mid-flight.
 *   - The background effects wrapped theirs in `useMemo(..., [])`, which is a
 *     cache and not a guarantee — React may discard a memo and recompute, and
 *     the whole field would silently reshuffle when it did.
 *   - Anything impure during render is also a hydration-mismatch risk, since
 *     server and client roll different numbers.
 *
 * A seeded generator fixes all three at once: same seed, same layout, forever,
 * with no memo required to hold it still. For scattering dots around a screen,
 * xorshift32 is more than good enough — this is decoration, not cryptography.
 */

/**
 * xorshift32. Returns a function producing floats in [0, 1).
 * Seed 0 is degenerate (it would only ever produce 0), so it maps to 1.
 */
export function makeRandom(seed = 1) {
  let s = (seed >>> 0) || 1
  return function next() {
    s ^= s << 13; s >>>= 0
    s ^= s >>> 17
    s ^= s << 5;  s >>>= 0
    return s / 4294967296
  }
}

/**
 * Turn arbitrary values into a seed — used to give each confetti burst its own
 * scatter based on where it fired, so two bursts don't look stamped from the
 * same mould. FNV-1a: short, well-mixed for small inputs, no dependencies.
 */
export function hashSeed(...parts) {
  let h = 2166136261 >>> 0
  const str = parts.join('|')
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}
