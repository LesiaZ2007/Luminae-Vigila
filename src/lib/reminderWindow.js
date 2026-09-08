/**
 * When does the reminder cron actually need to talk to the database?
 *
 * ## The problem this exists to solve
 *
 * Neon bills *compute time*, not queries. A serverless compute endpoint suspends
 * after an idle window (five minutes by default) and every query resets that
 * timer. So the cost of a job is not how much work it does — it is how often it
 * runs. `/api/push/reminders` is pinged every minute, forever, which means the
 * compute endpoint never once gets to suspend: roughly 720 hours a month of
 * billed compute to discover, 1,439 times a day, that nothing is due.
 *
 * Every other optimisation in this codebase — memoized DDL, delta syncs, JSONB
 * prefilters — reduces the work per request. None of them touch the number that
 * dominates the bill. This does.
 *
 * ## How it skips
 *
 * A scan already learns everything needed to know when the next one matters: the
 * earliest reminder in the *future* is right there in the candidate list. Remember
 * it, and every tick before it can return without opening a connection at all.
 *
 * Two things force a scan regardless:
 *
 *   - `MAX_SKIP_MS` — a reminder created *after* the last scan is invisible to a
 *     cached `nextDueAt`, so the cache gets a hard expiry. This is the one real
 *     cost of the design, and it is bounded: a reminder created less than
 *     `MAX_SKIP_MS` before it fires may be up to that late from the cron's side.
 *     Creating a reminder means an open tab, and an open tab runs its own
 *     minute-resolution check (see page.js), so the case where this is the only
 *     mechanism in play — reminder created and app closed within the window — is
 *     the narrow one.
 *
 *   - A cold start. Module state dies with the process, so a fresh instance scans
 *     immediately. That is the safe direction: never skipping on no information.
 *
 * `LEAD_MS` scans slightly *before* the due time, so the wake-up cost is paid on
 * the tick before rather than making the reminder a minute late.
 *
 * ## Why this is safe for reminders already on the books
 *
 * A skipped tick cannot miss a known reminder — `nextDueAt` is precisely the time
 * it must stop skipping. And the cron's own grace window (30 minutes) means even a
 * scan that arrives late still fires, rather than silently dropping the reminder.
 */

/**
 * Hard cache expiry: scan at least this often even when nothing is known to be due.
 *
 * Sets the floor on cost — one scan burst per half hour keeps the compute endpoint
 * awake for roughly its suspend window and no longer, so a duty cycle in the tens
 * of percent instead of 100%.
 */
export const MAX_SKIP_MS = 30 * 60 * 1000

/** Scan this far ahead of a known due time, so the send is not a tick late. */
export const LEAD_MS = 60 * 1000

let scannedAt = null
let nextDueAt = null

/**
 * Does this tick need the database?
 *
 * @param {number} now epoch ms
 * @returns {boolean}
 */
export function shouldScan(now = Date.now()) {
  if (scannedAt === null) return true                  // cold start — no information
  if (now - scannedAt >= MAX_SKIP_MS) return true       // cache expired
  if (nextDueAt === null) return false                 // scanned, nothing ahead
  return now >= nextDueAt - LEAD_MS
}

/**
 * Record the outcome of a scan.
 *
 * @param {number} now epoch ms the scan ran at.
 * @param {number|null} next Earliest candidate fire time strictly in the future,
 *   or null when the user has no future reminders at all. Anything already past is
 *   either sent or outside the grace window, so it must not be passed here — it
 *   would make `shouldScan` true forever.
 */
export function recordScan(now, next) {
  scannedAt = now
  nextDueAt = (typeof next === 'number' && next > now) ? next : null
}

/**
 * Forget what we know, forcing the next tick to scan.
 *
 * Called from POST /api/sync: a write is the only way a reminder can appear, so it
 * is the only event that can invalidate `nextDueAt` early. Best-effort by nature —
 * serverless routes may or may not share a process, so this narrows the staleness
 * window when they do and changes nothing when they don't. `MAX_SKIP_MS` remains
 * the guarantee.
 */
export function invalidateReminderWindow() {
  scannedAt = null
  nextDueAt = null
}

/** Introspection, for the scan's own response body and for tests. */
export function reminderWindowState() {
  return { scannedAt, nextDueAt }
}

/**
 * Earliest fire time strictly after `now`, across a candidate list.
 *
 * @param {Array<{at:number}>} candidates
 * @param {number} now
 * @returns {number|null}
 */
export function earliestFuture(candidates, now) {
  let best = null
  for (const c of candidates ?? []) {
    if (typeof c?.at !== 'number' || Number.isNaN(c.at)) continue
    if (c.at <= now) continue
    if (best === null || c.at < best) best = c.at
  }
  return best
}
