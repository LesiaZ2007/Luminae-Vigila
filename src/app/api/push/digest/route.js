/**
 * GET /api/push/digest — Sunday week-ahead push digest.
 *
 * Protected by Bearer token:
 *   Authorization: Bearer $CRON_SECRET
 *
 * Iterates every opted-in push subscription (digest_enabled = true),
 * looks up that user's todos/events for the next 7 days, and sends a
 * personalised summary push notification.
 *
 * Errors per subscription are caught and logged without aborting others.
 */
import webpush from 'web-push'
import sql     from '@/lib/db'

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

export async function GET(request) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization') ?? ''
  const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token || token !== process.env.CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── VAPID setup (use a generic subject since this isn't per-user) ──────────
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? 'mailto:noreply@localhost',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  )

  // ── Date window ─────────────────────────────────────────────────────────────
  const now      = new Date()
  const weekEnd  = new Date(now)
  weekEnd.setDate(now.getDate() + 7)
  const nowIso   = now.toISOString()
  const endIso   = weekEnd.toISOString()

  // ── Fetch opted-in subscriptions ────────────────────────────────────────────
  const subs = await sql`
    SELECT id, user_id, endpoint, p256dh, auth
    FROM push_subscriptions
    WHERE digest_enabled = true
  `

  let sent = 0, failed = 0, skipped = 0

  const results = await Promise.allSettled(
    subs.map(async sub => {
      // ── Fetch todos for this user ──────────────────────────────────────────
      const todoRows = await sql`
        SELECT data FROM todos
        WHERE user_id = ${sub.user_id}
      `
      const todos = todoRows
        .map(r => r.data)
        .filter(t => !t.completed && t.dueDate && t.dueDate >= nowIso.slice(0,10) && t.dueDate <= endIso.slice(0,10))

      // ── Fetch events for this user ─────────────────────────────────────────
      const eventRows = await sql`
        SELECT data FROM events
        WHERE user_id = ${sub.user_id}
      `
      const events = eventRows
        .map(r => r.data)
        .filter(e => e.start && e.start >= nowIso && e.start <= endIso)

      const totalItems = todos.length + events.length
      if (totalItems === 0) { skipped++; return }

      // ── Find busiest day ───────────────────────────────────────────────────
      const dayCounts = {}
      for (const t of todos) {
        const d = t.dueDate?.slice(0, 10)
        if (d) dayCounts[d] = (dayCounts[d] ?? 0) + 1
      }
      for (const e of events) {
        const d = e.start?.slice(0, 10)
        if (d) dayCounts[d] = (dayCounts[d] ?? 0) + 1
      }
      const busiestDate = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
      const busiestDay  = busiestDate ? DAYS[new Date(busiestDate + 'T12:00:00').getDay()] : null

      const body = [
        `${todos.length} task${todos.length !== 1 ? 's' : ''}`,
        `${events.length} event${events.length !== 1 ? 's' : ''}`,
        busiestDay ? `— busiest day: ${busiestDay}` : '',
      ].filter(Boolean).join(', ')

      const pushSub = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      }

      try {
        await webpush.sendNotification(
          pushSub,
          JSON.stringify({ title: 'Your week ahead', body, tag: 'lv-digest' }),
        )
        sent++
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          // Expired subscription — remove it
          await sql`DELETE FROM push_subscriptions WHERE id = ${sub.id}`
        }
        throw err
      }
    })
  )

  failed = results.filter(r => r.status === 'rejected').length

  return Response.json({ ok: true, sent, failed, skipped })
}
