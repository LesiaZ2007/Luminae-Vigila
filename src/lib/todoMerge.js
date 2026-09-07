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
import {
  mergeWithTombstones, mergeCloudWinsWithTombstones, purgeTombstones,
  visible, softDelete, isDeleted, TOMBSTONE_RETENTION_MS,
} from './tombstones'

/** Does this row carry any recurring-completion state at all? */
function hasCompletionState(todo) {
  return Array.isArray(todo?.completedDates) || !!todo?.completionStamps
}

/**
 * Is an untick's stamp old enough to drop?
 *
 * An unparseable stamp is treated as *not* expired, matching purgeTombstones: a
 * malformed timestamp should not be able to delete a record of a user's decision.
 */
function isStampExpired(stamp, now) {
  const t = Date.parse(stamp ?? '')
  if (Number.isNaN(t)) return false
  return now - t >= TOMBSTONE_RETENTION_MS
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

  const completedDates = []
  const keptStamps     = []

  for (const date of [...dates].sort()) {
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
      if (stamp) keptStamps.push([date, stamp])
    } else if (stamp && !isStampExpired(stamp, now)) {
      keptStamps.push([date, stamp])
    }
  }

  /* Built in sorted-date order, not set-iteration order. `completionStamps` is part
     of the todos payload, and buildSyncDelta fingerprints that with JSON.stringify —
     which is key-order sensitive. Two devices that agree on the state but inserted
     the dates in a different order would fingerprint differently, and every sync
     would push the whole todos collection to record nothing. */
  return { completedDates, completionStamps: Object.fromEntries(keptStamps) }
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

    let out = row

    if (hasCompletionState(cloud) || hasCompletionState(local)) {
      const { completedDates, completionStamps } = reconcileCompletion(cloud, local, now)
      out = { ...out, completedDates, completionStamps }
    }

    // Same guard as completion: a task with no subtasks must not gain an empty
    // array, which would change its sync fingerprint and re-push the collection.
    if (cloud.subtasks?.length || local.subtasks?.length) {
      out = { ...out, subtasks: reconcileSubtasks(cloud, local, now) }
    }

    return out
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
 * Returns a new row with `completedDates`, `completionStamps` *and* `updatedAt` all
 * updated, so a caller cannot accidentally move one without the others. `updatedAt`
 * belongs here rather than at the call site for the same reason the list mutators
 * own their stamps: a tick that updates the register but not the row timestamp is
 * the original completion-sync bug, and a stamp that only one of several call sites
 * remembers is silent until it shows up on another device.
 */
export function setCompletionForDate(todo, date, done, now = new Date().toISOString()) {
  const current = new Set(todo?.completedDates ?? [])
  if (done) current.add(date)
  else current.delete(date)

  const stamps = { ...(todo?.completionStamps ?? {}), [date]: now }

  return {
    ...todo,
    completedDates:   [...current].sort(),
    completionStamps: Object.fromEntries(Object.keys(stamps).sort().map(d => [d, stamps[d]])),
    updatedAt:        now,
  }
}

/* ── Subtasks ────────────────────────────────────────────────────────────────
 *
 * Subtasks used to be resolved by their parent: the row carried the array, a
 * subtask change stamped the row, and the newer row won whole. That is the same
 * mistake `completedDates` made, one level down — a task's subtasks are several
 * independent decisions sharing one timestamp:
 *
 *   1. Both devices hold "Essay" with steps "outline", "draft", "cite".
 *   2. You tick "outline" on your phone.
 *   3. You tick "draft" on your laptop.
 *   4. The newer row wins entirely, and one of the two ticks is gone.
 *
 * Deleting had the broader version, exactly as list items did: the edit modal
 * saves the array it is holding, so a removed subtask was simply absent — and an
 * absent subtask is indistinguishable from one added offline on the other device,
 * so it came back.
 *
 * So a subtask is a merge unit in its own right, carrying `updatedAt` and, when
 * removed, a `deletedAt` tombstone — which lets the same tombstones.js helpers
 * resolve it. The row still resolves the task's own fields; subtasks resolve one
 * by one underneath it.
 */

/** Everything the user should see — tombstoned subtasks are not it. */
export function visibleSubtasks(todo) {
  return visible(todo?.subtasks ?? [])
}

/** Stamp the parent row. A subtask change is still a change to the task. */
function touchTodo(todo, now) {
  return { ...todo, updatedAt: now }
}

/** Patch one subtask, stamping it and its parent. */
export function patchSubtask(todo, subtaskId, patch, now = new Date().toISOString()) {
  return touchTodo({
    ...todo,
    subtasks: (todo?.subtasks ?? []).map(s =>
      s.id === subtaskId ? { ...s, ...patch, updatedAt: now } : s,
    ),
  }, now)
}

/** Append a subtask. */
export function addSubtask(todo, title, now = new Date().toISOString()) {
  const subtask = {
    id: `st-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    completed: false,
    updatedAt: now,
  }
  return touchTodo({ ...todo, subtasks: [...(todo?.subtasks ?? []), subtask] }, now)
}

/**
 * Apply the subtask array an editor is holding, without losing tombstones.
 *
 * The edit modal and Corvus both save a plain list of the subtasks they can see,
 * which is the shape that made deletion unsyncable: writing that array straight
 * back drops every tombstone, and the deleted subtasks return on the next merge
 * from a device that still remembers them. The same trap the list reorder handler
 * fell into.
 *
 * So the incoming array decides *content and order*, while removals become
 * tombstones and untouched subtasks keep the stamp they had. Only what actually
 * changed is re-stamped — re-stamping everything would let an unrelated edit win
 * merges it should lose, and would churn the sync fingerprint of the whole row.
 */
export function applySubtaskEdits(todo, next, now = new Date().toISOString()) {
  const previous = todo?.subtasks ?? []
  const byId     = new Map(previous.map(s => [s.id, s]))
  const keptIds  = new Set((next ?? []).map(s => s?.id).filter(Boolean))

  const updated = (next ?? []).map(incoming => {
    const before = incoming?.id ? byId.get(incoming.id) : null
    if (!before) return { ...incoming, updatedAt: now }

    /* An incoming tombstone passes straight through. Not every caller filters the
       array first — Corvus marks a task done by spreading the whole row back — so
       the raw list arrives here tombstones and all, and clearing deletedAt on those
       would resurrect exactly what the tombstone exists to keep buried. */
    if (isDeleted(incoming)) return incoming

    // The editor lists an id that was tombstoned: it is being re-added, so lift the
    // tombstone rather than leaving a deleted subtask the user can see.
    if (isDeleted(before)) return { ...before, ...incoming, deletedAt: null, updatedAt: now }

    const unchanged = before.title === incoming.title
      && !!before.completed === !!incoming.completed
    return unchanged ? before : { ...before, ...incoming, updatedAt: now }
  })

  // Anything the editor no longer lists was removed — tombstone it rather than
  // letting it vanish. Tombstones sort after the visible subtasks; nothing reads
  // them for order, and keeping them last leaves the editor's order intact.
  const removed = previous
    .filter(s => !keptIds.has(s.id))
    .map(s => (isDeleted(s) ? s : softDelete(s, now)))

  return touchTodo({ ...todo, subtasks: [...updated, ...removed] }, now)
}

/**
 * Resolve two versions of one task's subtasks.
 *
 * Ordinary id-keyed tombstone merge — the same one rows and list items get. Order
 * follows the merged array, which keeps the side that has each subtask; there is
 * no `sortOrder` here because subtask order is array position and reordering is
 * not something the UI offers.
 */
export function reconcileSubtasks(cloud, local, now) {
  return purgeTombstones(mergeWithTombstones(cloud?.subtasks ?? [], local?.subtasks ?? []), now)
}

/**
 * Purge a todo collection: drop expired tombstones, and drop expired untick stamps.
 *
 * The stamps also expire inside `reconcileCompletion`, but that only runs for rows
 * *both* sides hold. A row that has never been synced — every row for an offline
 * account — is never reconciled, so its unticks would accumulate one stamp per
 * occurrence forever and grow the localStorage blob without bound. Pruning on the
 * purge path covers those, and is where the equivalent tombstone sweep already runs.
 */
export function purgeTodos(todos, now = Date.now()) {
  return purgeTombstones(todos, now).map(todo => {
    let out = todo

    const stamps = todo?.completionStamps
    if (stamps) {
      const done = new Set(todo.completedDates ?? [])
      const kept = Object.keys(stamps)
        .sort()
        .filter(date => done.has(date) || !isStampExpired(stamps[date], now))

      if (kept.length !== Object.keys(stamps).length) {
        out = { ...out, completionStamps: Object.fromEntries(kept.map(d => [d, stamps[d]])) }
      }
    }

    // Subtask tombstones expire on the same schedule, and for the same reason they
    // are swept here rather than only in the merge: a row that never syncs is never
    // reconciled, so nothing else would ever drop them.
    if (todo?.subtasks?.length) {
      const swept = purgeTombstones(todo.subtasks, now)
      if (swept.length !== todo.subtasks.length) out = { ...out, subtasks: swept }
    }

    return out
  })
}
