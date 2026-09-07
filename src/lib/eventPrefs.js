/**
 * Event preferences — per-event display state, merged one event at a time.
 *
 * `eventPrefs` is a keyed object rather than an array:
 *
 *   { 'evt-1': { hidden: true }, 'evt-2': { color: '#f00', important: true } }
 *
 * It lives apart from the events themselves so it works for events that are not
 * ours to edit — a Google invite, a Canvas due date, a class period all get the
 * same treatment. That part is right. How it *synced* was not.
 *
 * The bug
 * ───────
 * The whole object was shallow-merged, with no timestamps anywhere, and in a
 * different direction depending on which code path ran: sign-in and the
 * background poll did `{ ...cloud, ...local }` (local wins), while the refresh
 * button did `{ ...local, ...cloud }` (cloud wins). So:
 *
 *   1. You mark an event important on your phone.
 *   2. You change your mind and un-mark it on your laptop.
 *   3. The phone, which never heard about step 2, merges — and its stale
 *      `important: true` wins as "local" and is pushed back over the un-mark.
 *
 * Which is the completion bug again, in a different collection: state that is
 * really one decision per event was being resolved as one decision for all of
 * them. And because the direction flipped between paths, the same two devices
 * could settle on different answers depending on whether you signed in or
 * pressed Sync — which is what made it look like a rendering glitch.
 *
 * So an entry is now a merge unit carrying its own `updatedAt`, exactly like a
 * todo row or a custom-list item, and every path resolves entries the same way.
 *
 * There are no tombstones here: nothing deletes a pref. Un-hiding writes
 * `hidden: false` rather than removing the key, so every change is a value the
 * merge can see, and an absent key genuinely means "never set".
 */

/**
 * Write one event's prefs, stamping the entry.
 *
 * Every mutation goes through this rather than spreading into `prev[id]` at the
 * call site. There are five callers — hide, un-hide, two colour setters and the
 * important toggle — and a stamp missed in one of them is silent: the pref just
 * loses a merge later, on another device, with nothing to point at.
 */
export function setEventPref(prefs, id, patch, now = new Date().toISOString()) {
  return { ...(prefs ?? {}), [id]: { ...(prefs?.[id] ?? {}), ...patch, updatedAt: now } }
}

/**
 * Stamp every entry of a pref object — used when restoring a backup.
 *
 * A restore replaces rather than adds, and the entries in a backup file carry
 * whatever stamp they had when it was written, or none at all if the file
 * predates stamping. Either way they would lose the next merge to a fresher copy
 * on another device, and the restore would quietly undo itself. Stamping them as
 * of the restore says what the user actually did: this is the current state now.
 */
export function stampAllPrefs(prefs, now = new Date().toISOString()) {
  return Object.fromEntries(
    Object.entries(prefs ?? {}).map(([id, entry]) => [id, { ...entry, updatedAt: now }])
  )
}

/**
 * Merge two pref objects entry by entry, newest `updatedAt` wins.
 *
 * The rules mirror `mergeWithTombstones`, for the same reasons:
 *
 * - Both sides stamped → the newer entry wins outright. An entry is small and
 *   its fields are set together, so there is nothing to gain from resolving
 *   `hidden` and `color` separately, and no stamp fine enough to do it with.
 * - Exactly one side stamped → that side wins, whichever side it is. A stamp
 *   means the entry was touched since this shipped; no stamp means it was not.
 * - Neither stamped → local, preserving offline edits on entries written before
 *   stamping existed. These are legacy rows, and there is no evidence either way.
 */
export function mergeEventPrefs(cloud, local) {
  const out = { ...(cloud ?? {}) }

  for (const [id, localEntry] of Object.entries(local ?? {})) {
    const cloudEntry = out[id]
    if (!cloudEntry) { out[id] = localEntry; continue }

    const localT = Date.parse(localEntry?.updatedAt ?? '')
    const cloudT = Date.parse(cloudEntry?.updatedAt ?? '')
    const localHas = !Number.isNaN(localT)
    const cloudHas = !Number.isNaN(cloudT)

    if (localHas && cloudHas)      out[id] = localT >= cloudT ? localEntry : cloudEntry
    else if (localHas !== cloudHas) out[id] = localHas ? localEntry : cloudEntry
    else                            out[id] = localEntry // legacy, unstamped
  }

  return out
}

/**
 * The manual "pull from cloud" merge.
 *
 * Identical to the ordinary merge, deliberately. Elsewhere the refresh button is
 * cloud-wins at the *row* level while finer state still resolves by timestamp —
 * and a pref entry is that finer state, the smallest thing here anyone decides.
 * Overwriting one a device just set would make the button mean "discard what I
 * did", which is not what it says, and is the asymmetry that let two devices
 * disagree about the same event depending on how they synced.
 */
export const mergeEventPrefsCloudWins = mergeEventPrefs
