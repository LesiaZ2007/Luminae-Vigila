/**
 * POST /api/push/test — send a push to the caller's own devices, right now.
 *
 * The point is isolation. If this arrives, the browser, the service worker, the
 * subscription and the VAPID keys are all fine, and a missing reminder is a
 * scheduling problem. If it doesn't, the fault is below the scheduler and the
 * per-endpoint error below says where.
 *
 * Unlike /api/push/send this reports the push service's actual rejection rather
 * than a bare count — a 403 (key mismatch) and a 410 (expired subscription) are
 * completely different problems that otherwise look identical from the client.
 */
import webpush        from 'web-push'
import { getSession } from '@/lib/session'
import { requireVapid } from '@/lib/cronAuth'
import { sendToSubscription } from '@/lib/pushSend'
import sql            from '@/lib/db'

export async function POST() {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // Caught explicitly: setVapidDetails throws on missing keys, which would
  // surface as an opaque 500 and look like a server outage.
  const unconfigured = requireVapid()
  if (unconfigured) {
    return Response.json({
      ok: false,
      error: 'VAPID keys are not configured on this deployment.',
      results: [],
    }, { status: 503 })
  }

  const userRows = await sql`SELECT email FROM users WHERE id = ${session.userId} LIMIT 1`
  webpush.setVapidDetails(
    `mailto:${userRows[0]?.email ?? 'noreply@localhost'}`,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  )

  const subs = await sql`
    SELECT id, endpoint, p256dh, auth FROM push_subscriptions
    WHERE user_id = ${session.userId}
  `

  if (subs.length === 0) {
    return Response.json({
      ok: false,
      error: 'No devices are subscribed on this account. Enable notifications on the device you want them on.',
      results: [],
    })
  }

  const payload = JSON.stringify({
    title: 'luminaeVigila test',
    body:  'If you can read this, push notifications are working on this device.',
    tag:   'lv-test',
    url:   '/',
  })

  const results = await Promise.all(subs.map(async sub => {
    let host = 'unknown'
    try { host = new URL(sub.endpoint).host } catch {}

    const result = await sendToSubscription(sub, payload)
    if (result.ok) return { host, ok: true }

    // A dead subscription is worth clearing out so the next attempt isn't
    // dragged down by a device that no longer exists — sendToSubscription
    // already did that; this just gives the client a readable reason.
    if (result.deleted) {
      return { host, ok: false, status: result.status, error: 'Subscription expired — removed. Re-enable notifications on that device.' }
    }
    return { host, ok: false, status: result.status, error: result.error }
  }))

  const sent = results.filter(r => r.ok).length
  return Response.json({ ok: sent > 0, sent, failed: results.length - sent, results })
}
