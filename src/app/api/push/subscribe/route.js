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
  const { endpoint, keys } = body ?? {}
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return Response.json({ error: 'Invalid subscription' }, { status: 400 })
  }

  await sql`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
    VALUES (${session.userId}, ${endpoint}, ${keys.p256dh}, ${keys.auth})
    ON CONFLICT (user_id, endpoint) DO UPDATE
      SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth
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
