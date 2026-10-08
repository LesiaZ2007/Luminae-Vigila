/**
 * POST /api/push/subscribe  — upsert a push subscription for the signed-in user
 * DELETE /api/push/subscribe — remove a subscription by endpoint
 */
import { getSession }       from '@/lib/session'
import { ensurePushSchema } from '@/lib/pushSchema'
import { isValidTimeZone }  from '@/lib/zonedTime'
import sql                  from '@/lib/db'

export async function POST(request) {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const { endpoint, keys, tzOffset, timeZone } = body ?? {}
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return Response.json({ error: 'Invalid subscription' }, { status: 400 })
  }

  // Self-healing migrations — the INSERT below writes tz_offset and time_zone, and
  // this is the one route guaranteed to run before any cron reads them. Memoized per
  // process — see lib/ddlOnce — so this is not a round trip per subscribe call.
  await ensurePushSchema()

  // getTimezoneOffset() from the device: the fallback for reading this reader's
  // calendar when no zone name is known (older clients send only this). Clamped to
  // the real range so a bad client can't write nonsense.
  const offset = Number.isFinite(tzOffset) ? Math.max(-900, Math.min(900, Math.trunc(tzOffset))) : 0

  // The device's IANA zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`). An
  // offset alone cannot say when DST starts, and the reminder cron needs to turn a
  // floating "9am" into an instant on the right side of that — see lib/zonedTime.
  // Anything Intl would not accept is stored as no zone at all rather than as a
  // string every later reader would have to re-reject.
  const zone = isValidTimeZone(timeZone) ? timeZone : null

  // COALESCE on the update, not a plain overwrite: a client from before this field
  // existed re-subscribes with no zone, and that must not erase one a newer client
  // already recorded for the same endpoint.
  await sql`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, tz_offset, time_zone)
    VALUES (${session.userId}, ${endpoint}, ${keys.p256dh}, ${keys.auth}, ${offset}, ${zone})
    ON CONFLICT (user_id, endpoint) DO UPDATE
      SET p256dh    = EXCLUDED.p256dh,
          auth      = EXCLUDED.auth,
          tz_offset = EXCLUDED.tz_offset,
          time_zone = COALESCE(EXCLUDED.time_zone, push_subscriptions.time_zone)
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
