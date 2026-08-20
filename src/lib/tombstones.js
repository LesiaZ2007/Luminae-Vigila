/**
 * Tombstones — make deletion a thing that syncs.
 *
 * The bug this fixes
 * ──────────────────
 * Deleting used to just drop the item from the array. That leaves no record
 * that it ever existed, and the sync merge is local-wins, so:
 *
 *   1. You delete a task on your laptop. It uploads; the cloud no longer has it.
 *   2. Your phone still holds that task and hasn't synced yet.
 *   3. The phone merges. An item present locally but absent from the cloud is
 *      indistinguishable from one you created offline — so it "wins".
 *   4. The phone re-uploads it. The task is back on every device.
 *
 * A tombstone turns deletion into a *change* rather than an *absence*: the item
 * stays in the synced array carrying `deletedAt`, so every device learns about
 * it and last-write-wins resolves it correctly. Notes already worked this way
 * (`trashedAt`); this generalises it to todos, events, and custom lists.
 *
 * Rows are dropped for real once they're older than the retention window, which
 * needs to comfortably exceed how long a device might stay offline.
 */

export const TOMBSTONE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

/** Has this item been soft-deleted? */
export function isDeleted(item) {
  return !!item?.deletedAt
}

/**
 * Mark an item deleted.
 *
 * `updatedAt` is bumped alongside `deletedAt` — this is what makes the tombstone
 * beat an older live copy of the same item during the merge. A tombstone with a
 * stale updatedAt would lose, and the item would come back.
 */
export function softDelete(item, now = new Date().toISOString()) {
  return { ...item, deletedAt: now, updatedAt: now }
}

/** Undo a soft delete (the Undo button on the toast). */
export function restore(item, now = new Date().toISOString()) {
  const { deletedAt, ...rest } = item ?? {}
  return { ...rest, deletedAt: null, updatedAt: now }
}

/** Everything the user should actually see. */
export function visible(items) {
  return (items ?? []).filter(i => i && !i.deletedAt)
}

/**
 * Drop tombstones past the retention window.
 *
 * Anything with an unparseable `deletedAt` is kept rather than dropped: losing a
 * real item to a malformed timestamp is far worse than carrying a dead row.
 */
export function purgeTombstones(items, now = Date.now()) {
  return (items ?? []).filter(i => {
    if (!i?.deletedAt) return true
    const t = new Date(i.deletedAt).getTime()
    if (Number.isNaN(t)) return true
    return now - t < TOMBSTONE_RETENTION_MS
  })
}

/**
 * Merge two id-keyed arrays, newest `updatedAt` wins, tombstones included.
 *
 * When neither side carries a timestamp we fall back to local — that preserves
 * offline edits on legacy rows written before updatedAt was stamped. A tombstone
 * always carries one (see softDelete), so a delete never loses to a legacy row.
 *
 * When exactly one side carries a timestamp, that side wins regardless of which
 * side it is. Every mutation stamps `updatedAt`, so a stamped row is one that was
 * touched and an unstamped row is one that never was — the stamp is the newer
 * information. Falling back to local here instead is what caused edits to vanish
 * between devices: an event edited on a laptop uploaded fine, but the phone's
 * untouched copy of it had no timestamp, won the merge as "local", and was pushed
 * straight back over the top of the edit.
 */
export function mergeWithTombstones(cloudArr, localArr) {
  const out = new Map((cloudArr ?? []).filter(x => x?.id).map(x => [x.id, x]))

  for (const item of (localArr ?? [])) {
    if (!item?.id) continue
    const existing = out.get(item.id)
    if (!existing) { out.set(item.id, item); continue }

    const localT = Date.parse(item.updatedAt ?? '')
    const cloudT = Date.parse(existing.updatedAt ?? '')
    const localHas = !Number.isNaN(localT)
    const cloudHas = !Number.isNaN(cloudT)

    if (localHas && cloudHas) {
      out.set(item.id, localT >= cloudT ? item : existing)
    } else if (localHas !== cloudHas) {
      out.set(item.id, localHas ? item : existing)
    } else if (isDeleted(existing) || isDeleted(item)) {
      // One side is a tombstone but timestamps are unusable — prefer the delete.
      // Wrongly resurrecting something the user removed is the worse failure.
      out.set(item.id, isDeleted(existing) ? existing : item)
    } else {
      out.set(item.id, item) // local wins by default
    }
  }

  return [...out.values()]
}

/**
 * Cloud-wins merge for the explicit "pull from cloud" action, with one
 * exception: a local tombstone is never overwritten by a live cloud row. The
 * cloud copy is simply one that hasn't heard about the delete yet, and a manual
 * refresh shouldn't undo something the user deliberately removed.
 */
export function mergeCloudWinsWithTombstones(cloudArr, localArr) {
  const localMap = new Map((localArr ?? []).filter(x => x?.id).map(x => [x.id, x]))
  const out = new Map(localMap)

  for (const cloud of (cloudArr ?? [])) {
    if (!cloud?.id) continue
    const local = localMap.get(cloud.id)
    if (local && isDeleted(local) && !isDeleted(cloud)) continue
    out.set(cloud.id, cloud)
  }

  return [...out.values()]
}
