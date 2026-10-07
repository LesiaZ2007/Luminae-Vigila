'use client'

import { useEffect } from 'react'

/**
 * State kept in localStorage, as two halves used together:
 *
 *   const [notes, setNotes] = useState(() => readStored('lv-notes', [], reviveNotes))
 *   usePersist('lv-notes', notes)
 *
 * The read happens in the state initialiser, not in an effect, and that is the
 * point. The planner used to start every collection as an empty array and fill it
 * from one mount effect, with a matching save effect per collection. Three things
 * went wrong with that shape:
 *
 *   • Every save effect also ran on mount — with the empty starting value — so for
 *     a moment each key in localStorage really was `[]`. A second tab, or the
 *     `/today` glance page listening for `storage` events, saw an empty planner.
 *   • All twelve keys were read inside one `try`. One corrupt value threw, every
 *     key after it was skipped, and the save effects then wrote `[]` over data
 *     that had been perfectly readable.
 *   • Anything else a mount effect did to the same state raced the load. A note
 *     shared into the app from Android was prepended, then replaced wholesale by
 *     the stored notes landing a moment later — so the share was lost whenever you
 *     already had notes.
 *
 * Reading in the initialiser means the state is right before any effect runs, and
 * each key fails on its own. The server render has no localStorage, so it falls
 * back; the planner renders nothing until `mounted` anyway, so the two never have
 * to agree and there is no hydration mismatch.
 *
 * Why two halves rather than one `usePersistentState` hook: the hooks lint rule only
 * knows a setter is stable when it comes straight from `useState`. Wrapped in a
 * custom hook, every one of the planner's ~40 callbacks that uses a setter gets
 * flagged for a missing dependency.
 */

/**
 * Read one JSON value out of localStorage, falling back when it is missing,
 * unparseable, or when there is no localStorage at all (the server render, private
 * mode, a blocked storage partition).
 *
 * `revive` runs on a successfully parsed value only — it is where a collection
 * drops its expired tombstones, or rejects a shape it cannot use.
 */
export function readStored(key, fallback, revive) {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return fallback
    const parsed = JSON.parse(raw)
    return revive ? revive(parsed) : parsed
  } catch {
    return fallback
  }
}

/** Write `value` to localStorage under `key` whenever it changes. */
export function usePersist(key, value) {
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Quota exceeded or storage blocked. The in-memory state is still right and
      // the cloud copy (if signed in) is unaffected — better than an effect that
      // throws and takes the whole planner down with it.
    }
  }, [key, value])
}
