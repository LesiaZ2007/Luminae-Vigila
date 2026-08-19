/**
 * Shared Bearer-token gate for the cron endpoints, plus a heartbeat record.
 *
 * All three scheduled jobs (`/api/push/reminders`, `/api/push/daily`,
 * `/api/push/digest`) authenticate identically:
 *
 *   Authorization: Bearer $CRON_SECRET
 *
 * ## Why this also writes a heartbeat
 *
 * A cron that is being pinged with the *wrong* secret is indistinguishable, from
 * inside the app, from a cron that nobody is pinging at all: both mean no
 * notifications, and neither leaves a trace. Vercel's own crons inject
 * `CRON_SECRET` for you, so rotating it silently breaks only the externally-driven
 * job — the daily glance keeps arriving while reminders die, which reads as
 * "notifications work, reminders are broken" and sends you hunting in the wrong
 * place entirely.
 *
 * So every *authorised* run stamps `cron_pings`. `/api/push/status` reports how
 * long ago each job last got through, which turns that silence into a sentence.
 *
 * Only successes are recorded, deliberately. Logging rejections would mean a
 * database write on every unauthenticated request to a public URL, which is a
 * cost and abuse vector for no extra diagnostic value: a 401 loop and a dead
 * pinger both show up here as "last success was ages ago", and the fix starts the
 * same way either way.
 */
import sql from '@/lib/db'
import { ddlOnce } from '@/lib/ddlOnce'

/** One row per cron path, upserted — bounded regardless of ping frequency. */
function ensurePingTable() {
  return ddlOnce('cronPings', () => sql`
    CREATE TABLE IF NOT EXISTS cron_pings (
      path         TEXT        PRIMARY KEY,
      last_success TIMESTAMPTZ NOT NULL,
      success_count BIGINT     NOT NULL DEFAULT 1
    )
  `)
}

/**
 * Verify the Bearer token and record the heartbeat.
 *
 * @param {Request} request
 * @param {string}  path  Identifier stored in `cron_pings`, e.g. 'reminders'.
 * @returns {Promise<Response|null>} A 401/503 Response to return immediately,
 *   or null when the caller is authorised and should proceed.
 */
export async function requireCron(request, path) {
  const authHeader = request.headers.get('authorization') ?? ''
  const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''

  // An unset secret would make `token !== undefined` reject everything anyway,
  // but saying so explicitly is the difference between a five-minute fix and an
  // afternoon of guessing which end is wrong.
  if (!process.env.CRON_SECRET) {
    return Response.json(
      { error: 'CRON_SECRET is not set on this deployment — every cron request will be rejected.' },
      { status: 503 },
    )
  }
  if (!token || token !== process.env.CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Best-effort: a heartbeat failure must never fail the job it is describing.
  try {
    await ensurePingTable()
    await sql`
      INSERT INTO cron_pings (path, last_success)
      VALUES (${path}, NOW())
      ON CONFLICT (path) DO UPDATE
        SET last_success  = NOW(),
            success_count = cron_pings.success_count + 1
    `
  } catch {}

  return null
}

/**
 * Guard the VAPID pair before any `setVapidDetails` call.
 *
 * web-push throws on a missing or malformed key, which surfaces as an opaque 500
 * to whatever is pinging the endpoint. A 503 with a reason is the same outage
 * with an explanation attached.
 *
 * @returns {Response|null} A 503 to return immediately, or null when configured.
 */
export function requireVapid() {
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return Response.json({ error: 'VAPID keys not configured' }, { status: 503 })
  }
  return null
}
