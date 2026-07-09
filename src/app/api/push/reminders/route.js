/**
 * GET /api/push/reminders — server-side reminder scheduler.
 *
 * Protected by Bearer token:
 *   Authorization: Bearer $CRON_SECRET
 *
 * Meant to be hit every minute by a cron (Vercel Cron on Pro, or an external
 * pinger like cron-job.org on Hobby). Scans every user who has at least one push
 * subscription, computes which of their events/todos have a reminder that just
 * became due, and sends a push notification.
 *
 * This is what makes reminders fire when the app is CLOSED — the client-side
 * interval in page.js only runs while a tab is open, which on mobile is almost
 * never when a reminder is actually due.
 *
 * Each reminder is de-duplicated via the sent_reminders table so it fires once.
 */
import webpush from 'web-push'
import sql     from '@/lib/db'

// Only fire reminders whose scheduled time landed within this window before "now".
// Prevents backfilling ancient reminders on the very first cron run, while being
// wide enough to tolerate a missed cron tick or two.
const GRACE_MS = 30 * 60 * 1000 // 30 minutes

/** Compute the epoch-ms fire time for an item's reminder, or null if none/invalid. */
function reminderFireTime(item, dueIso) {
  const r = item.reminder
  if (!r) return null
  if (r.at) {
    const t = new Date(r.at).getTime()
    return Number.isNaN(t) ? null : t
  }
  if (dueIso && typeof r.ms === 'number') {
    const due = new Date(dueIso).getTime()
    return Number.isNaN(due) ? null : due - r.ms
  }
  return null
}

export async function GET(request) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization') ?? ''
  const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token || token !== process.env.CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── VAPID setup (generic subject — not per-user) ────────────────────────────
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? 'mailto:noreply@localhost',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  )

  // Dedup log — idempotent create so a fresh DB works without a manual migration.
  await sql`
    CREATE TABLE IF NOT EXISTS sent_reminders (
      user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reminder_key TEXT        NOT NULL,
      sent_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, reminder_key)
    )
  `

  const now      = Date.now()
  const windowLo = now - GRACE_MS

  // Every user with at least one active push subscription.
  const users = await sql`
    SELECT DISTINCT user_id FROM push_subscriptions
  `

  let sent = 0, failed = 0, due = 0

  for (const { user_id } of users) {
    // Gather this user's reminder-bearing items.
    const [eventRows, todoRows] = await Promise.all([
      sql`SELECT data FROM events WHERE user_id = ${user_id}`,
      sql`SELECT data FROM todos  WHERE user_id = ${user_id}`,
    ])

    const candidates = []
    for (const { data: ev } of eventRows) {
      if (!ev?.reminder || ev.completed) continue
      const at = reminderFireTime(ev, ev.start)
      if (at == null) continue
      candidates.push({ key: `ev-${ev.id}-${at}`, at, title: `Reminder: ${ev.title}`, body: ev.reminder.label ?? '' })
    }
    for (const { data: td } of todoRows) {
      if (!td?.reminder || td.completed) continue
      const dueIso = td.dueDate ? td.dueDate + 'T00:00:00' : null
      const at = reminderFireTime(td, dueIso)
      if (at == null) continue
      candidates.push({ key: `td-${td.id}-${at}`, at, title: `Reminder: ${td.title}`, body: td.reminder.label ?? '' })
    }

    // Keep only reminders that just came due within the grace window.
    const dueNow = candidates.filter(c => c.at <= now && c.at >= windowLo)
    if (dueNow.length === 0) continue
    due += dueNow.length

    // Load this user's subscriptions once.
    const subs = await sql`
      SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ${user_id}
    `
    if (subs.length === 0) continue

    for (const c of dueNow) {
      // Claim the reminder atomically — only the run that inserts the row sends it.
      const claimed = await sql`
        INSERT INTO sent_reminders (user_id, reminder_key)
        VALUES (${user_id}, ${c.key})
        ON CONFLICT (user_id, reminder_key) DO NOTHING
        RETURNING reminder_key
      `
      if (claimed.length === 0) continue // already sent by an earlier tick

      const payload = JSON.stringify({ title: c.title, body: c.body, tag: c.key })
      await Promise.all(subs.map(async sub => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
          )
          sent++
        } catch (err) {
          failed++
          if (err.statusCode === 410 || err.statusCode === 404) {
            await sql`DELETE FROM push_subscriptions WHERE id = ${sub.id}`
          }
        }
      }))
    }
  }

  // Best-effort cleanup: drop dedup rows older than 7 days so the table stays small.
  await sql`DELETE FROM sent_reminders WHERE sent_at < NOW() - INTERVAL '7 days'`

  return Response.json({ ok: true, due, sent, failed })
}
