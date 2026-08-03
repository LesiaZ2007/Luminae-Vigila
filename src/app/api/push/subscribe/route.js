/**
 * POST /api/push/subscribe  — upsert a push subscription for the signed-in user
 * DELETE /api/push/subscribe — remove a subscription by endpoint
 */
import { getSession } from '@/lib/session'
import sql            from '@/lib/db'

export async function POST(request) {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const { endpoint, keys, tzOffset } = body ?? {}
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return Response.json({ error: 'Invalid subscription' }, { status: 400 })
  }

  // Self-healing migrations — the daily glance needs both of these, and this is
  // the one route guaranteed to run before it.
  await sql`ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS daily_enabled BOOLEAN NOT NULL DEFAULT true`
  await sql`ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS tz_offset INTEGER NOT NULL DEFAULT 0`

  // getTimezoneOffset() from the device. The server runs in UTC and has no other
  // way to know which calendar day "today" means for this reader. Clamped to the
  // real range so a bad client can't write nonsense.
  const offset = Number.isFinite(tzOffset) ? Math.max(-900, Math.min(900, Math.trunc(tzOffset))) : 0

  await sql`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, tz_offset)
    VALUES (${session.userId}, ${endpoint}, ${keys.p256dh}, ${keys.auth}, ${offset})
    ON CONFLICT (user_id, endpoint) DO UPDATE
      SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, tz_offset = EXCLUDED.tz_offset
  `

  return Response.json({ ok: true })
}

export async function DELETE(request) {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { endpoint } = await request.json().catch(() => ({}))
  if (!endpoint) return Response.json({ error: 'Missing endpoint' }, { status: 400 })

  await sql`
    DELETE FROM push_subscriptions
    WHERE user_id = ${session.userId} AND endpoint = ${endpoint}
  `

  return Response.json({ ok: true })
}
