/**
 * Only send what changed.
 *
 * The push used to send all nine collections on every save, and POST /api/sync
 * responds to each array it receives with `DELETE FROM <table> WHERE user_id = …`
 * followed by one INSERT per row. So renaming a single todo deleted and reinserted
 * every event, note, custom list and category the account owned — hundreds of rows
 * of writes to record a change to one.
 *
 * That is Neon compute being spent for nothing, and Neon bills for compute time.
 *
 * The handler already skips any key that is absent from the body, so the fix is
 * entirely on this side: remember what was last accepted, and send only the
 * collections that no longer match. A collection that has not changed is not
 * mentioned, so its table is never touched.
 */

/** The payload keys, and the local state each one carries. */
export const SYNC_KEYS = [
  'events', 'todos', 'todoCategories', 'eventCategories',
  'classSchedule', 'eventPrefs', 'studySessions', 'customLists', 'notes',
]

/**
 * Fingerprint each collection.
 *
 * `JSON.stringify` is the comparison, which makes it order-sensitive: reordering an
 * array counts as a change. That is the correct answer here — task order is user-
 * visible and stored as array position — and it errs toward sending, which is the
 * safe direction. A missed change would be data loss; an extra send is only cost.
 */
export function fingerprint(payload) {
  const out = {}
  for (const key of SYNC_KEYS) {
    if (payload[key] === undefined) continue
    try {
      out[key] = JSON.stringify(payload[key])
    } catch {
      // Circular or otherwise unserialisable: treat as always-changed rather than
      // silently dropping it from every future push.
      out[key] = `unserialisable:${Math.random()}`
    }
  }
  return out
}

/**
 * The subset of `payload` that differs from the last accepted push.
 *
 * Returns `{ body, sent }` — `body` is what to POST, `sent` is the fingerprint to
 * remember *once the server has accepted it*. Recording it before then would mean a
 * failed push is never retried: the collection would look unchanged from then on.
 *
 * A null/empty `previous` sends everything, which is what the first push after a
 * merge should do.
 */
export function buildSyncDelta(payload, previous) {
  const next = fingerprint(payload)
  const body = {}

  for (const key of SYNC_KEYS) {
    if (next[key] === undefined) continue
    if (!previous || previous[key] !== next[key]) body[key] = payload[key]
  }

  return { body, sent: next, isEmpty: Object.keys(body).length === 0 }
}
