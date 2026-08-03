/**
 * GET /api/push/daily — the morning "today at a glance" push.
 *
 * This is the closest thing to a home-screen widget a PWA can deliver: a single
 * glanceable summary that lands on the lock screen without the app being open.
 * Tapping it opens /today.
 *
 * Protected by Bearer token:
 *   Authorization: Bearer $CRON_SECRET
 *
 * Scheduled once a day in vercel.json (11:00 UTC — early morning in US Eastern).
 * Vercel crons run in UTC and there is no per-user timezone stored, so the send
 * time is fixed rather than local-morning-for-everyone. `tz_offset` on the
 * subscription is used to decide which calendar day to summarise, so at least
 * the *contents* are right for the reader even when the hour isn't ideal.
 */
import webpush from 'web-push'
import sql     from '@/lib/db'
import { buildGlance, glanceNotificationBody } from '@/lib/glance'
import { toDateStr } from '@/lib/localDate'

export async function GET(request) {
  const authHeader = request.headers.get('authorization') ?? ''
  const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token || token !== process.env.CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return Response.json({ error: 'VAPID keys not configured' }, { status: 503 })
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? 'mailto:noreply@localhost',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  )

  // Self-healing migrations, matching the pattern the rest of the API uses so a
  // fresh database works without a manual step.
  await sql`ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS daily_enabled BOOLEAN NOT NULL DEFAULT true`
  await sql`ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS tz_offset INTEGER NOT NULL DEFAULT 0`

  const subs = await sql`
    SELECT id, user_id, endpoint, p256dh, auth, tz_offset
    FROM push_subscriptions
    WHERE daily_enabled = true
  `

  let sent = 0, skipped = 0

  const results = await Promise.allSettled(subs.map(async sub => {
    // tz_offset is getTimezoneOffset(): minutes to ADD to local to reach UTC,
    // so subtracting it converts server-UTC "now" into the reader's wall clock.
    const local   = new Date(Date.now() - (sub.tz_offset ?? 0) * 60 * 1000)
    const dateStr = toDateStr(local)

    const [todoRows, eventRows] = await Promise.all([
      sql`SELECT data FROM todos  WHERE user_id = ${sub.user_id}`,
      sql`SELECT data FROM events WHERE user_id = ${sub.user_id}`,
    ])

    const glance = buildGlance({
      todos:  todoRows.map(r => r.data),
      events: eventRows.map(r => r.data),
      dateStr,
    })

    // A push that says "nothing today" every morning trains you to ignore the
    // app's notifications entirely, which then costs you the reminders that
    // do matter. Silence is the correct behaviour on an empty day.
    if (glance.isEmpty) { skipped++; return }

    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({
          title: 'Today at a glance',
          body:  glanceNotificationBody(glance),
          tag:   'lv-daily',
          url:   '/today',
        }),
      )
      sent++
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await sql`DELETE FROM push_subscriptions WHERE id = ${sub.id}`
      }
      throw err
    }
  }))

  const failed = results.filter(r => r.status === 'rejected').length
  return Response.json({ ok: true, sent, failed, skipped })
}
