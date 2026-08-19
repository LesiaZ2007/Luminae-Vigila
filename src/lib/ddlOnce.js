/**
 * Run a self-healing `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE … IF NOT EXISTS`
 * at most once per server process.
 *
 * The self-healing-schema pattern is good — a fresh database works with no manual
 * migration step — but the naive form pays for it on *every* request. The reminder
 * cron is pinged every minute, and each ping was issuing two DDL statements before
 * doing any real work. Postgres skips the create, but the Neon serverless driver
 * still pays a full HTTP round trip to find that out, so the endpoint was spending
 * more requests proving its tables exist than reading data.
 *
 * These statements are idempotent *and* their outcome cannot change while the
 * process lives: nothing drops these tables. So the first call per instance runs it
 * and every later call is free. A cold start re-runs it, which is exactly the case
 * where it might genuinely be needed.
 *
 * The promise itself is cached rather than a boolean, so concurrent callers during
 * startup await the same round trip instead of racing to issue their own. A
 * rejection is evicted so a transient failure can be retried rather than poisoning
 * the process.
 */
const inFlight = new Map()

/**
 * @param {string} key  Stable identifier for this migration.
 * @param {() => Promise<unknown>} run  Issues the idempotent DDL.
 */
export function ddlOnce(key, run) {
  const cached = inFlight.get(key)
  if (cached) return cached

  const promise = run().catch(err => {
    inFlight.delete(key)
    throw err
  })
  inFlight.set(key, promise)
  return promise
}

/** Test seam — lets a suite start from a clean slate. */
export function resetDdlCache() {
  inFlight.clear()
}
