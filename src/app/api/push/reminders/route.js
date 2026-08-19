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
import { requireCron, requireVapid }       from '@/lib/cronAuth'
import { ddlOnce }                         from '@/lib/ddlOnce'
import { noteDisplayTitle, notePlainText, noteHasImage } from '@/lib/notes'

// Only fire reminders whose scheduled time landed within this window before "now".
// Prevents backfilling ancient reminders on the very first cron run, while being
// wide enough to tolerate a missed cron tick or two.
const GRACE_MS = 30 * 60 * 1000 // 30 minutes

// Purging the dedup log is housekeeping, not the job. Running it on every tick meant
// 1,440 DELETEs a day to remove rows that are only ever a week old, so it now runs at
// most this often per process — and the table is bounded by the grace window anyway.
const CLEANUP_EVERY_MS = 6 * 60 * 60 * 1000 // 6 hours
let lastCleanupAt = 0

function ensureSentRemindersTable() {
  return ddlOnce('sentReminders', () => sql`
    CREATE TABLE IF NOT EXISTS sent_reminders (
      user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reminder_key TEXT        NOT NULL,
      sent_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, reminder_key)
    )
  `)
}

/**
 * Every reminder-bearing event, task, and note for one user, in a single query.
 *
 * `data ? 'reminder'` is the JSONB key-exists test — a prefilter, not the decision;
 * the caller still validates the reminder's shape. It exists so the wire carries the
 * handful of rows that could possibly fire rather than the user's entire history.
 */
async function fetchReminderCandidates(userId) {
  try {
    return await sql`
      SELECT 'ev' AS kind, data FROM events WHERE user_id = ${userId} AND data ? 'reminder'
      UNION ALL
      SELECT 'td' AS kind, data FROM todos  WHERE user_id = ${userId} AND data ? 'reminder'
      UNION ALL
      SELECT 'nt' AS kind, data FROM notes  WHERE user_id = ${userId} AND data ? 'reminder'
    `
  } catch {
    // `notes` may not exist on a deployment that has never synced since the Notes
    // feature shipped. A UNION fails whole rather than per-branch, so retry without it.
    return sql`
      SELECT 'ev' AS kind, data FROM events WHERE user_id = ${userId} AND data ? 'reminder'
      UNION ALL
      SELECT 'td' AS kind, data FROM todos  WHERE user_id = ${userId} AND data ? 'reminder'
    `
  }
}

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
  // ── Auth (also stamps the heartbeat /api/push/status reports) ──────────────
  const denied = await requireCron(request, 'reminders')
  if (denied) return denied

  // ── VAPID setup (generic subject — not per-user) ────────────────────────────
  const unconfigured = requireVapid()
  if (unconfigured) return unconfigured

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? 'mailto:noreply@localhost',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  )

  // Dedup log — idempotent create, memoized so this costs a round trip once per
  // process rather than once per minute. See lib/ddlOnce.
  await ensureSentRemindersTable()

  const now      = Date.now()
  const windowLo = now - GRACE_MS

  // Every user with at least one active push subscription.
  const users = await sql`
    SELECT DISTINCT user_id FROM push_subscriptions
  `

  let sent = 0, failed = 0, due = 0

  for (const { user_id } of users) {
    // One round trip for all three item types instead of three, and `data ? 'reminder'`
    // filters to reminder-bearing rows in Postgres rather than shipping every event,
    // task, and note over the wire to be discarded in JS. On a job that runs every
    // minute forever, both of those are the difference between idling and not.
    const rows = await fetchReminderCandidates(user_id)

    const eventRows = rows.filter(r => r.kind === 'ev')
    const todoRows  = rows.filter(r => r.kind === 'td')
    const noteRows  = rows.filter(r => r.kind === 'nt')

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
    for (const { data: nt } of noteRows) {
      // Notes have no due date, so only absolute `reminder.at` values apply.
      if (!nt?.reminder || nt.trashedAt) continue
      const at = reminderFireTime(nt, null)
      if (at == null) continue
      // Lead with the note's own text — the reminder label is just the time,
      // which the notification already shows.
      const text    = notePlainText(nt.html).replace(/\s+/g, ' ').trim().slice(0, 120)
      // An image-only note has no text at all; an empty push body reads as a bug.
      const snippet = text || (noteHasImage(nt.html) ? 'Image' : '')
      candidates.push({ key: `nt-${nt.id}-${at}`, at, title: `Note: ${noteDisplayTitle(nt)}`, body: snippet })
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
  // Rate-limited per process — see CLEANUP_EVERY_MS.
  if (now - lastCleanupAt > CLEANUP_EVERY_MS) {
    lastCleanupAt = now
    await sql`DELETE FROM sent_reminders WHERE sent_at < NOW() - INTERVAL '7 days'`
  }

  return Response.json({ ok: true, due, sent, failed })
}
