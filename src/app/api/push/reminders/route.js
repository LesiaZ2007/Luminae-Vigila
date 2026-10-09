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
 *
 * ## Whose 9am
 *
 * Every time the app stores is a floating wall-clock time — an event at
 * `2026-10-08T09:00:00`, a task due on a date, an absolute reminder at `…T08:30:00` —
 * and this process runs in UTC. Read with a bare `new Date()`, a New York student's
 * 9:00 event with a 15-minute reminder was pushed at 08:45 UTC: 4:45 in the morning
 * where they are. So each user's times are read on their own clock, from the zone their
 * devices recorded on subscribe (see lib/zonedTime's `resolveUserZone`) — which is why
 * the subscriptions are now read on every scan rather than only when something is due.
 *
 * ## Most ticks do not touch the database at all
 *
 * Neon bills compute time and any query resets its idle-suspend timer, so a job
 * pinged every minute keeps the compute endpoint awake 24/7 no matter how little
 * work it does. That single fact dominated the app's entire database bill.
 *
 * So a tick now starts by asking lib/reminderWindow whether it can possibly have
 * anything to do — the previous scan remembers the earliest reminder still ahead
 * of it — and returns without opening a connection when it cannot. See that module
 * for the guarantees and the one bounded case where a scan can be late.
 */
import webpush from 'web-push'
import sql     from '@/lib/db'
import { requireCron, requireVapid, stampCronPing } from '@/lib/cronAuth'
import { ddlOnce }                         from '@/lib/ddlOnce'
import { ensurePushSchema }                from '@/lib/pushSchema'
import { sendToSubscription }              from '@/lib/pushSend'
import { noteDisplayTitle, notePlainText, noteHasImage } from '@/lib/notes'
import { classReminderCandidates, fireTimeFor, todoDueIso } from '@/lib/classReminders'
import { resolveUserZone }                 from '@/lib/zonedTime'
import { shouldScan, recordScan, reminderWindowState, earliestFuture } from '@/lib/reminderWindow'

// Only fire reminders whose scheduled time landed within this window before "now".
// Prevents backfilling ancient reminders on the very first cron run, while being
// wide enough to tolerate a missed cron tick or two — or a deliberately skipped
// one, which is now the common case.
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
 * Every reminder-bearing event, task, and note for *every* subscribed user, in a
 * single query.
 *
 * Per-user queries in a loop meant the round-trip count grew with the user table
 * for a job that runs on a fixed schedule — three per user per tick, to read a
 * handful of rows each. The subscription filter is an `IN` subquery rather than a
 * separate `SELECT DISTINCT user_id` round trip for the same reason.
 *
 * `data ? 'reminder'` is the JSONB key-exists test — a prefilter, not the decision;
 * the caller still validates the reminder's shape. It exists so the wire carries the
 * handful of rows that could possibly fire rather than every user's entire history.
 */
async function fetchReminderCandidates() {
  try {
    return await sql`
      SELECT 'ev' AS kind, user_id, data FROM events
        WHERE user_id IN (SELECT user_id FROM push_subscriptions) AND data ? 'reminder'
      UNION ALL
      SELECT 'td' AS kind, user_id, data FROM todos
        WHERE user_id IN (SELECT user_id FROM push_subscriptions) AND data ? 'reminder'
      UNION ALL
      SELECT 'nt' AS kind, user_id, data FROM notes
        WHERE user_id IN (SELECT user_id FROM push_subscriptions) AND data ? 'reminder'
    `
  } catch {
    // `notes` may not exist on a deployment that has never synced since the Notes
    // feature shipped. A UNION fails whole rather than per-branch, so retry without it.
    return sql`
      SELECT 'ev' AS kind, user_id, data FROM events
        WHERE user_id IN (SELECT user_id FROM push_subscriptions) AND data ? 'reminder'
      UNION ALL
      SELECT 'td' AS kind, user_id, data FROM todos
        WHERE user_id IN (SELECT user_id FROM push_subscriptions) AND data ? 'reminder'
    `
  }
}

/**
 * Every user's class-level reminder rules, with the tasks they could apply to,
 * grouped by user. Resolved into candidates by the caller once it knows each user's
 * zone, because the rules count back from floating due dates and exam times.
 *
 * A rule lives on the class and is resolved at scan time rather than stamped onto each
 * task — see lib/classReminders.js. That means the cron has to go and find the tasks,
 * which is two queries where the per-item path needs none:
 *
 *   1. The classes carrying a rule. Cheap, and almost always empty — a deployment
 *      with no rules anywhere pays exactly this one query and nothing else.
 *   2. Only if any came back: the tasks with NO reminder of their own. Deliberately
 *      the complement of the `data ? 'reminder'` prefilter above, so no row is
 *      fetched twice and the "item's own reminder wins" rule is enforced in Postgres
 *      rather than trusted to line up in JS. Scoped by an `IN` subquery over the
 *      rule-bearing classes, so users without rules contribute no rows.
 *
 * Exams need no query at all: an exam block lives inside its class's own
 * `exceptions.exams`, which query 1 already brought back.
 *
 * Canvas assignments are absent by construction — they are never persisted (see the
 * header of /api/sync), so class rules reach them only in the open tab.
 *
 * @returns {Promise<Map<string, {classes: object[], todos: object[]}>>}
 */
async function fetchClassData() {
  let classRows
  try {
    classRows = await sql`
      SELECT user_id, data FROM class_schedule
        WHERE user_id IN (SELECT user_id FROM push_subscriptions) AND data ? 'reminders'
    `
  } catch {
    // `class_schedule` predates this feature, but a deployment that has never synced
    // a schedule may still not have the table. No rules is the right answer, not a
    // failed cron run for everyone in it.
    return new Map()
  }
  if (classRows.length === 0) return new Map()

  const todoRows = await sql`
    SELECT user_id, data FROM todos
      WHERE NOT (data ? 'reminder')
        AND user_id IN (
          SELECT user_id FROM class_schedule WHERE data ? 'reminders'
        )
  `

  const classesByUser = groupByUser(classRows)
  const todosByUser   = groupByUser(todoRows)

  const out = new Map()
  for (const [userId, classes] of classesByUser) {
    out.set(userId, { classes, todos: todosByUser.get(userId) ?? [] })
  }
  return out
}

/**
 * Every device that could receive a push, with the zone it recorded, by user.
 *
 * Unfiltered: one row per device that has ever subscribed, so the whole table is
 * smaller than the round trip it would take to narrow it per user. The same rows
 * serve twice — `time_zone`/`tz_offset` say whose clock each user's reminders are on,
 * and the rest is what the sends need.
 *
 * @returns {Promise<Map<string, object[]>>} user_id → subscription rows
 */
async function fetchSubscriptions() {
  const rows = await sql`
    SELECT id, user_id, endpoint, p256dh, auth, time_zone, tz_offset FROM push_subscriptions
  `
  const out = new Map()
  for (const sub of rows) {
    const list = out.get(sub.user_id)
    if (list) list.push(sub)
    else out.set(sub.user_id, [sub])
  }
  return out
}

/** `[{user_id, data}]` → `Map<user_id, data[]>`. */
function groupByUser(rows) {
  const out = new Map()
  for (const row of rows) {
    const list = out.get(row.user_id)
    if (list) list.push(row.data)
    else out.set(row.user_id, [row.data])
  }
  return out
}

/**
 * Everything one user's own item-level reminders imply.
 *
 * `timeZone` is that user's, from `resolveUserZone` — see "Whose 9am" above.
 *
 * Deleted items are skipped. A delete is a tombstone that keeps syncing (see
 * lib/tombstones), so the row — reminder and all — stays in the table for the whole
 * retention window, and without this check a deleted event still pushed its reminder.
 */
function itemCandidates({ events, todos, notes }, timeZone) {
  const candidates = []

  for (const ev of events) {
    if (!ev?.reminder || ev.completed || ev.deletedAt) continue
    const at = fireTimeFor(ev.reminder, ev.start, { timeZone })
    if (at == null) continue
    candidates.push({ key: `ev-${ev.id}-${at}`, at, title: `Reminder: ${ev.title}`, body: ev.reminder.label ?? '' })
  }
  for (const td of todos) {
    if (!td?.reminder || td.completed || td.deletedAt) continue
    // Midnight on the due date: the one convention the class rules use too, rather
    // than a second copy of the string concatenation that could drift from it.
    const at = fireTimeFor(td.reminder, todoDueIso(td), { timeZone })
    if (at == null) continue
    candidates.push({ key: `td-${td.id}-${at}`, at, title: `Reminder: ${td.title}`, body: td.reminder.label ?? '' })
  }
  for (const nt of notes) {
    // Notes have no due date, so only absolute `reminder.at` values apply.
    if (!nt?.reminder || nt.trashedAt) continue
    const at = fireTimeFor(nt.reminder, null, { timeZone })
    if (at == null) continue
    // Lead with the note's own text — the reminder label is just the time,
    // which the notification already shows.
    const text    = notePlainText(nt.html).replace(/\s+/g, ' ').trim().slice(0, 120)
    // An image-only note has no text at all; an empty push body reads as a bug.
    const snippet = text || (noteHasImage(nt.html) ? 'Image' : '')
    candidates.push({ key: `nt-${nt.id}-${at}`, at, title: `Note: ${noteDisplayTitle(nt)}`, body: snippet })
  }

  return candidates
}

export async function GET(request) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  // Deliberately without the heartbeat write: it is a database write, and a
  // database write on every tick is the entire cost this endpoint now avoids. The
  // scan stamps it below, so the heartbeat tracks scans rather than pings.
  const denied = await requireCron(request, 'reminders', { heartbeat: false })
  if (denied) return denied

  // ── VAPID setup (generic subject — not per-user) ────────────────────────────
  // Before the skip check on purpose: it costs nothing and a misconfigured
  // deployment should say so on every ping, not only on scan ticks.
  const unconfigured = requireVapid()
  if (unconfigured) return unconfigured

  const now = Date.now()

  // ── The cheap exit ──────────────────────────────────────────────────────────
  // Nothing can be due before the time the last scan already told us about, so
  // this tick is over. No connection, no query, no compute kept awake.
  if (!shouldScan(now)) {
    const { nextDueAt } = reminderWindowState()
    return Response.json({
      ok: true,
      scanned: false,
      nextDueAt: nextDueAt === null ? null : new Date(nextDueAt).toISOString(),
    })
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? 'mailto:noreply@localhost',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  )

  // The dedup log and the `time_zone` column read below — idempotent DDL, memoized so
  // each costs a round trip once per process rather than once per scan (see
  // lib/ddlOnce). Stamped together with the heartbeat: independent round trips, so
  // no reason to serialise them.
  await Promise.all([ensureSentRemindersTable(), ensurePushSchema(), stampCronPing('reminders')])

  const windowLo = now - GRACE_MS

  /* Three reads for the whole deployment, not three per user, all in flight at once.

     The subscriptions used to be read only when something was actually due. They are
     now read on every scan, because a candidate's fire time depends on its user's zone
     and cannot be computed without them. That is one more small query per *scan* — not
     per tick, so the cheap exit above is untouched — and it runs alongside the other
     two, so it adds no latency. The send loop reuses the same rows rather than reading
     the table a second time. */
  const [rows, classDataByUser, subsByUser] = await Promise.all([
    fetchReminderCandidates(),
    fetchClassData(),
    fetchSubscriptions(),
  ])

  const byUser = new Map()
  const bucket = (userId) => {
    let b = byUser.get(userId)
    if (!b) { b = { events: [], todos: [], notes: [] }; byUser.set(userId, b) }
    return b
  }
  for (const row of rows) {
    const b = bucket(row.user_id)
    if (row.kind === 'ev') b.events.push(row.data)
    else if (row.kind === 'td') b.todos.push(row.data)
    else b.notes.push(row.data)
  }
  for (const userId of classDataByUser.keys()) bucket(userId)

  // Build every user's candidate list first, so the next-scan time can be computed
  // across all of them before any sending happens.
  const candidatesByUser = new Map()
  const allCandidates    = []
  for (const [userId, items] of byUser) {
    // No device means nowhere to send and no zone to read the times in. Only a
    // subscription removed between the reads above can land here.
    const subs = subsByUser.get(userId)
    if (!subs?.length) continue
    const timeZone  = resolveUserZone(subs)
    const classData = classDataByUser.get(userId)

    // Reminders implied by a class rule rather than set on the item. Appended to the
    // same list, so they go through the identical grace window, claim and send path.
    const candidates = [
      ...itemCandidates(items, timeZone),
      ...(classData ? classReminderCandidates({ ...classData, timeZone }) : []),
    ]
    candidatesByUser.set(userId, candidates)
    allCandidates.push(...candidates)
  }

  /* Remember the earliest reminder still ahead of us, which is what lets the next
     ~30 minutes of ticks return without a query. Recorded before the sending loop
     so a push-service failure cannot leave the window unset and put us back to
     scanning every minute. */
  recordScan(now, earliestFuture(allCandidates, now))

  let sent = 0, failed = 0, due = 0
  const dueByUser = new Map()
  for (const [userId, candidates] of candidatesByUser) {
    // Keep only reminders that just came due within the grace window.
    const dueNow = candidates.filter(c => c.at <= now && c.at >= windowLo)
    if (dueNow.length === 0) continue
    due += dueNow.length
    dueByUser.set(userId, dueNow)
  }

  // Sent to the same subscription rows that supplied each user's zone — every user in
  // dueByUser has at least one, by construction of the loop above.
  for (const [userId, dueNow] of dueByUser) {
    const subs = subsByUser.get(userId) ?? []

    for (const c of dueNow) {
      // Claim the reminder atomically — only the run that inserts the row sends it.
      const claimed = await sql`
        INSERT INTO sent_reminders (user_id, reminder_key)
        VALUES (${userId}, ${c.key})
        ON CONFLICT (user_id, reminder_key) DO NOTHING
        RETURNING reminder_key
      `
      if (claimed.length === 0) continue // already sent by an earlier scan

      const payload = JSON.stringify({ title: c.title, body: c.body, tag: c.key })
      await Promise.all(subs.map(async sub => {
        const result = await sendToSubscription(sub, payload)
        if (result.ok) sent++
        else failed++
      }))
    }
  }

  // Best-effort cleanup: drop dedup rows older than 7 days so the table stays small.
  // Rate-limited per process — see CLEANUP_EVERY_MS.
  if (now - lastCleanupAt > CLEANUP_EVERY_MS) {
    lastCleanupAt = now
    await sql`DELETE FROM sent_reminders WHERE sent_at < NOW() - INTERVAL '7 days'`
  }

  const { nextDueAt } = reminderWindowState()
  return Response.json({
    ok: true,
    scanned: true,
    due,
    sent,
    failed,
    nextDueAt: nextDueAt === null ? null : new Date(nextDueAt).toISOString(),
  })
}
