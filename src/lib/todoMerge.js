/**
 * Todo merge — row-level last-write-wins, plus a per-date register for recurring
 * completion.
 *
 * The problem row-level LWW can't solve
 * ─────────────────────────────────────
 * A recurring task records completion per date in `completedDates` rather than as
 * one flag, so a single row carries several independent user decisions. Resolving
 * that row by `updatedAt` makes those decisions compete:
 *
 *   1. Both devices are offline holding the same weekly task.
 *   2. You tick Monday's copy off on your phone.
 *   3. You tick Tuesday's copy off on your laptop.
 *   4. Whichever row was touched later wins *entirely* — the other day's tick is
 *      gone, even though the two never actually conflicted.
 *
 * A plain union of both arrays fixes that and immediately breaks un-ticking: an
 * add-only set has no way to express "Monday is no longer done", so un-ticking on
 * one device is undone by any other device that still remembers the tick.
 *
 * So completion is stored as a per-date LWW register. `completedDates` stays the
 * array everything already reads, and `completionStamps` records *when* each date
 * last changed:
 *
 *   completedDates:   ['2026-09-07']
 *   completionStamps: { '2026-09-07': '…T10:00Z', '2026-09-14': '…T11:00Z' }
 *
 * A date present in the stamps but absent from the array is one that was
 * deliberately un-ticked — the same idea as a tombstone, and what makes an untick
 * beat a stale tick. Merging then resolves each date on its own, so step 2 and
 * step 3 above both survive.
 */
import { mergeWithTombstones, mergeCloudWinsWithTombstones, isDeleted, TOMBSTONE_RETENTION_MS } from './tombstones'

/** Does this row carry any recurring-completion state at all? */
function hasCompletionState(todo) {
  return Array.isArray(todo?.completedDates) || !!todo?.completionStamps
}

/**
 * Resolve `completedDates` date by date.
 *
 * Per date, the side with the newer stamp decides whether it is done. When only
 * one side has a stamp, that side decides — a stamp means the date was touched,
 * and no stamp means it never was, exactly as row-level merging treats
 * `updatedAt`.
 *
 * When *neither* side has a stamp the two are unioned. Those are rows written
 * before this register existed: they carry no record of an untick, so there is no
 * untick to honour, and keeping a tick nobody can date is better than dropping
 * one somebody made.
 *
 * An un-ticked date's stamp is dropped once it is older than the tombstone
 * retention window. It only has to outlive the slowest device, and without this
 * a long-running weekly task would accumulate a stamp per occurrence forever.
 */
export function reconcileCompletion(cloud, local, now = Date.now()) {
  const cloudDates  = new Set(cloud?.completedDates ?? [])
  const localDates  = new Set(local?.completedDates ?? [])
  const cloudStamps = cloud?.completionStamps ?? {}
  const localStamps = local?.completionStamps ?? {}

  const dates = new Set([
    ...cloudDates, ...localDates,
    ...Object.keys(cloudStamps), ...Object.keys(localStamps),
  ])

  const completedDates   = []
  const completionStamps = {}

  for (const date of dates) {
    const cloudT   = Date.parse(cloudStamps[date] ?? '')
    const localT   = Date.parse(localStamps[date] ?? '')
    const cloudHas = !Number.isNaN(cloudT)
    const localHas = !Number.isNaN(localT)

    let done
    let stamp = null

    if (cloudHas && localHas) {
      if (localT > cloudT)      { done = localDates.has(date); stamp = localStamps[date] }
      else if (cloudT > localT) { done = cloudDates.has(date); stamp = cloudStamps[date] }
      // Same millisecond on both sides: prefer the tick. Losing a completion is
      // the more annoying of the two wrong answers.
      else { done = localDates.has(date) || cloudDates.has(date); stamp = localStamps[date] }
    } else if (localHas) {
      done = localDates.has(date); stamp = localStamps[date]
    } else if (cloudHas) {
      done = cloudDates.has(date); stamp = cloudStamps[date]
    } else {
      done = localDates.has(date) || cloudDates.has(date) // legacy, unstamped
    }

    if (done) {
      completedDates.push(date)
      if (stamp) completionStamps[date] = stamp
    } else if (stamp) {
      const age = now - Date.parse(stamp)
      if (!(age >= TOMBSTONE_RETENTION_MS)) completionStamps[date] = stamp
    }
  }

  completedDates.sort()
  return { completedDates, completionStamps }
}

/**
 * Apply per-date reconciliation to rows both sides knew about.
 *
 * A row only one side has needs no reconciliation — there is nothing to compare
 * it against — and neither does a tombstone, whose completion state is moot.
 * Rows with no recurring state are left untouched rather than gaining an empty
 * `completedDates`, which would otherwise change the sync fingerprint of every
 * ordinary task and push the whole collection for nothing.
 */
function reconcileAll(merged, cloudArr, localArr, now) {
  const cloudMap = new Map((cloudArr ?? []).filter(t => t?.id).map(t => [t.id, t]))
  const localMap = new Map((localArr ?? []).filter(t => t?.id).map(t => [t.id, t]))

  return merged.map(row => {
    const cloud = cloudMap.get(row.id)
    const local = localMap.get(row.id)
    if (!cloud || !local) return row
    if (isDeleted(row)) return row
    if (!hasCompletionState(cloud) && !hasCompletionState(local)) return row

    const { completedDates, completionStamps } = reconcileCompletion(cloud, local, now)
    return { ...row, completedDates, completionStamps }
  })
}

/**
 * The ordinary sync merge for todos: tombstone-aware LWW on the row, per-date
 * resolution for recurring completion.
 */
export function mergeTodos(cloudArr, localArr, now = Date.now()) {
  return reconcileAll(mergeWithTombstones(cloudArr, localArr), cloudArr, localArr, now)
}

/**
 * The manual "pull from cloud" merge.
 *
 * Cloud wins the row, but completion is still resolved per date rather than
 * overwritten. The button means "fetch what the other device did", not "throw
 * away what I just did" — and a tick made here seconds ago carries the newer
 * stamp, so it survives. This mirrors the existing rule that a manual refresh
 * never resurrects a local delete.
 */
export function mergeTodosCloudWins(cloudArr, localArr, now = Date.now()) {
  return reconcileAll(mergeCloudWinsWithTombstones(cloudArr, localArr), cloudArr, localArr, now)
}

/**
 * Stamp one date's completion on a todo — the write side of the register.
 *
 * Returns a new row with `completedDates` and `completionStamps` both updated, so
 * a caller cannot accidentally move one without the other.
 */
export function setCompletionForDate(todo, date, done, now = new Date().toISOString()) {
  const current = new Set(todo?.completedDates ?? [])
  if (done) current.add(date)
  else current.delete(date)

  return {
    ...todo,
    completedDates:   [...current].sort(),
    completionStamps: { ...(todo?.completionStamps ?? {}), [date]: now },
  }
}
