/**
 * Idempotent push-related migrations, in one place.
 *
 * The rest of the API self-heals its schema on use rather than requiring a manual
 * step per deploy, and these columns were previously ALTERed from inside whichever
 * route happened to need them. That is how `digest_enabled` ended up readable by
 * `/api/push/digest` but never created by it — the column existed only because
 * `schema.sql` had it, so any install that predated the column had a digest cron
 * that threw on its very first query.
 *
 * Every statement here is safe to run on every request.
 */
import sql from '@/lib/db'
import { ddlOnce } from '@/lib/ddlOnce'

/**
 * `digest_enabled` lives on `users`, not on `push_subscriptions`.
 *
 * A weekly week-ahead summary is a preference about *you*, not about a browser
 * profile. Per-subscription storage meant enabling it on a laptop left both phones
 * opted out, with no way to notice: the toggle read its state from localStorage, so
 * every device confidently displayed its own local guess. Anyone with more than one
 * device had a digest that only ever reached whichever one they happened to toggle
 * it on.
 *
 * Defaulting to true also matches `daily_enabled`. The old default of false meant
 * the feature shipped off for everyone, and "enabled by default" is the honest
 * reading of adding a digest cron to the deployment in the first place.
 *
 * `push_subscriptions.digest_enabled` is left in place but is no longer read.
 * Dropping a column is unrecoverable and buys nothing here.
 */
export function ensurePushSchema() {
  // Three round trips per request, on endpoints hit every minute, to re-prove
  // columns that cannot disappear. Memoized per process — see lib/ddlOnce.
  return ddlOnce('pushSchema', () => Promise.all([
    sql`ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS daily_enabled BOOLEAN NOT NULL DEFAULT true`,
    sql`ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS tz_offset     INTEGER NOT NULL DEFAULT 0`,
    sql`ALTER TABLE users              ADD COLUMN IF NOT EXISTS digest_enabled BOOLEAN NOT NULL DEFAULT true`,
  ]))
}
