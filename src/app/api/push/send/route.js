/**
 * POST /api/push/send  — send a push notification to all subscriptions for the signed-in user.
 * Body: { title: string, body: string }
 *
 * userId is derived from the session cookie only — never from the request body.
 */
import webpush        from 'web-push'
import { getSession } from '@/lib/session'
import { requireVapid } from '@/lib/cronAuth'
import { sendToSubscription } from '@/lib/pushSend'
import sql            from '@/lib/db'

export async function POST(request) {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // web-push throws on a missing/malformed key pair, which would otherwise
  // surface as an opaque 500 rather than a clear "this deployment isn't configured".
  const unconfigured = requireVapid()
  if (unconfigured) return unconfigured

  // Use the signed-in user's email as the VAPID contact (required by the spec)
  const userRows = await sql`SELECT email FROM users WHERE id = ${session.userId} LIMIT 1`
  const email = userRows[0]?.email ?? 'noreply@localhost'
  webpush.setVapidDetails(
    `mailto:${email}`,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  )

  const { title = 'luminaeVigila', body = '' } = await request.json().catch(() => ({}))

  const subs = await sql`
    SELECT id, endpoint, p256dh, auth FROM push_subscriptions
    WHERE user_id = ${session.userId}
  `

  const payload = JSON.stringify({ title, body })
  const results = await Promise.all(subs.map(sub => sendToSubscription(sub, payload)))

  const sent   = results.filter(r => r.ok).length
  const failed = results.length - sent
  return Response.json({ ok: true, sent, failed })
}
