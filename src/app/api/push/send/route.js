/**
 * POST /api/push/send  — send a push notification to all subscriptions for the signed-in user.
 * Body: { title: string, body: string }
 *
 * userId is derived from the session cookie only — never from the request body.
 */
import webpush        from 'web-push'
import { getSession } from '@/lib/session'
import sql            from '@/lib/db'

export async function POST(request) {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

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

  const results = await Promise.allSettled(
    subs.map(async sub => {
      const pushSub = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      }
      try {
        await webpush.sendNotification(pushSub, JSON.stringify({ title, body }))
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          // Subscription expired — remove it
          await sql`DELETE FROM push_subscriptions WHERE id = ${sub.id}`
        }
        throw err
      }
    })
  )

  const sent   = results.filter(r => r.status === 'fulfilled').length
  const failed = results.filter(r => r.status === 'rejected').length
  return Response.json({ ok: true, sent, failed })
}
