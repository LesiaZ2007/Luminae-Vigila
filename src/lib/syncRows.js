/**
 * Shape a synced collection for a set-based upsert.
 *
 * POST /api/sync used to answer each array it received with
 * `DELETE FROM <table> WHERE user_id = …` followed by one INSERT per row. Correct,
 * but it meant every push *rewrote* every row of the collection: change one word in
 * one note and Postgres writes all of them again — new tuples, WAL for all of it,
 * and dead tuples for autovacuum to come back for later. Neon bills the compute
 * that does all that.
 *
 * The set-based form sends the whole collection as one JSONB parameter and lets
 * Postgres work out what actually differs, so an unchanged row costs a comparison
 * instead of a write. Two statements per collection rather than one per row, which
 * also stops the statement count from growing with the user's history.
 *
 * This module holds the part worth testing on its own: turning a client array into
 * the `{id, data}` records that parameter carries.
 */

/**
 * `[{id, …}]` → `[{id, data}]`, deduplicated by id with the last occurrence
 * winning, and anything without a usable id dropped.
 *
 * Dedup is not defensive tidying — it is required. `INSERT … ON CONFLICT DO UPDATE`
 * errors with "cannot affect row a second time" if one statement presents the same
 * key twice, so a client that somehow sent a duplicate id would fail the entire
 * push. (The old per-row form would have failed too, on the primary key, just with
 * a less legible error.)
 *
 * @param {Array<object>|undefined} items
 * @param {(item: object) => object} [prepare] Applied to each kept item, e.g. to
 *   stamp a fallback `updatedAt`.
 * @returns {Array<{id: string, data: object}>}
 */
export function toUpsertRows(items, prepare) {
  const byId = new Map()
  for (const item of items ?? []) {
    if (!item?.id) continue
    byId.set(String(item.id), prepare ? prepare(item) : item)
  }
  return [...byId].map(([id, data]) => ({ id, data }))
}
