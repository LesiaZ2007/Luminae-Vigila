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
 * One Vercel cron runs once for everyone, so the send time is fixed rather than
 * local-morning-for-everyone. Each device's recorded zone decides which calendar
 * day to summarise, so at least the *contents* are right for the reader even when
 * the hour isn't ideal.
 */
import webpush from 'web-push'
import sql     from '@/lib/db'
import { requireCron, requireVapid }           from '@/lib/cronAuth'
import { ensurePushSchema }                    from '@/lib/pushSchema'
import { sendToSubscription }                  from '@/lib/pushSend'
import { buildGlance, glanceNotificationBody } from '@/lib/glance'
import { dateStrInZone, resolveUserZone }      from '@/lib/zonedTime'

export async function GET(request) {
  const denied = await requireCron(request, 'daily')
  if (denied) return denied

  const unconfigured = requireVapid()
  if (unconfigured) return unconfigured

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? 'mailto:noreply@localhost',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  )

  // Self-healing migrations, matching the pattern the rest of the API uses so a
  // fresh database works without a manual step.
  await ensurePushSchema()

  const subs = await sql`
    SELECT id, user_id, endpoint, p256dh, auth, tz_offset, time_zone
    FROM push_subscriptions
    WHERE daily_enabled = true
  `

  // Grouped by user so a reader with several devices gets one pair of todos/events
  // queries rather than one pair per device — the rows don't vary by device, only
  // the device's zone below does, and that only picks which calendar day to summarise.
  const subsByUser = new Map()
  for (const sub of subs) {
    const list = subsByUser.get(sub.user_id)
    if (list) list.push(sub)
    else subsByUser.set(sub.user_id, [sub])
  }

  let sent = 0, skipped = 0, failed = 0

  /* Every account, and every device within it, fails on its own. Before the
     grouping each subscription was its own Promise.allSettled entry, so one bad row
     or one transient database error was counted and the run carried on. A bare
     Promise.all here would let a single account's failure reject the whole run —
     no response, and nobody's glance that morning. */
  await Promise.all(Array.from(subsByUser.entries()).map(async ([userId, userSubs]) => {
    let todos, events
    try {
      const [todoRows, eventRows] = await Promise.all([
        sql`SELECT data FROM todos  WHERE user_id = ${userId}`,
        sql`SELECT data FROM events WHERE user_id = ${userId}`,
      ])
      todos  = todoRows.map(r => r.data)
      events = eventRows.map(r => r.data)
    } catch {
      failed += userSubs.length
      return
    }

    await Promise.all(userSubs.map(async sub => {
      try {
        // "Today" on this device's own calendar: its IANA zone when it recorded one
        // (right on both sides of a DST change), else the fixed offset from
        // `tz_offset`, else UTC. Per device, not per account — a reader whose phone is
        // travelling gets the phone's today on the phone. The date is computed in the
        // named zone outright; formatting a shifted Date with local getters, as this
        // used to, was only correct because the server happens to run in UTC.
        const dateStr = dateStrInZone(Date.now(), resolveUserZone(sub))

        const glance = buildGlance({ todos, events, dateStr })

        // A push that says "nothing today" every morning trains you to ignore the
        // app's notifications entirely, which then costs you the reminders that
        // do matter. Silence is the correct behaviour on an empty day.
        if (glance.isEmpty) { skipped++; return }

        const result = await sendToSubscription(sub, JSON.stringify({
          title: 'Today at a glance',
          body:  glanceNotificationBody(glance),
          tag:   'lv-daily',
          url:   '/today',
        }))
        if (result.ok) sent++
        else failed++
      } catch {
        failed++
      }
    }))
  }))

  return Response.json({ ok: true, sent, failed, skipped })
}
