/**
 * GET /api/push/digest — Sunday week-ahead push digest.
 *
 * Protected by Bearer token:
 *   Authorization: Bearer $CRON_SECRET
 *
 * Iterates every subscription belonging to a user who has the digest switched on
 * (`users.digest_enabled`), looks up that user's todos/events for the next 7 days,
 * and sends a personalised summary push notification.
 *
 * The opt-in is per *account*, not per subscription: see lib/pushSchema.js for why
 * the per-device version silently delivered to exactly one of your devices.
 *
 * ## The week is the reader's week
 *
 * "The next 7 days" is a range of the reader's calendar dates — today through today+7,
 * on their clock — and every item is filed under its own local date: a task's
 * `dueDate` as written, an event's floating `start` by its own date digits. This used
 * to compare those floating strings against UTC `toISOString()` bounds, so the window
 * was the server's week, shifted by the reader's offset at both ends: in Tokyo, where
 * the Sunday 18:00 UTC run is already 3am Monday, the week still began on Sunday, and in
 * New York a 3pm event that afternoon was dropped as "past" because its digits were
 * compared against 18:00 UTC. The window is now computed per device in its recorded
 * zone (lib/zonedTime), the same way the daily glance picks its day.
 *
 * Errors are isolated per account and per device, so one bad row or one transient
 * database error never costs anyone else their digest.
 */
import webpush from 'web-push'
import sql     from '@/lib/db'
import { requireCron, requireVapid } from '@/lib/cronAuth'
import { ensurePushSchema }          from '@/lib/pushSchema'
import { sendToSubscription }        from '@/lib/pushSend'
import {
  resolveUserZone, dateStrInZone, addDaysToDateStr, localDateOf, floatingToMs,
} from '@/lib/zonedTime'

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

/** How far ahead the digest looks: today plus this many days, inclusive. */
const WINDOW_DAYS = 7

/**
 * The digest's body for one reader, or null when their week holds nothing.
 *
 * Pure apart from its inputs, so the window logic is the same for every device.
 *
 * @param {object}   opts
 * @param {object[]} opts.todos  The account's todo rows' data.
 * @param {object[]} opts.events The account's event rows' data.
 * @param {string|{utcOffsetMinutes:number}} opts.zone The device's zone.
 * @param {number}   opts.now    epoch ms.
 */
function digestBody({ todos, events, zone, now }) {
  const first = dateStrInZone(now, zone)
  const last  = addDaysToDateStr(first, WINDOW_DAYS)
  const inWindow = d => Boolean(d) && d >= first && d <= last

  // Tombstones (deleted items that keep syncing — see lib/tombstones) are rows in
  // these tables too, and used to be counted here as if they were still on your plate.
  const dueTodos = todos.filter(t => t && !t.completed && !t.deletedAt && inWindow(localDateOf(t.dueDate, zone)))

  const upcoming = events.filter(e => {
    if (!e?.start || e.deletedAt) return false
    if (!inWindow(localDateOf(e.start, zone))) return false
    // A timed event earlier today is behind the reader, not ahead of them — the old
    // `start >= now` test meant to say this, it just said it in UTC. An all-day event
    // today still counts: the day it fills is not over.
    const at = /T/.test(e.start) ? floatingToMs(e.start, zone) : null
    return at === null || at >= now
  })

  if (dueTodos.length + upcoming.length === 0) return null

  // ── Busiest day, on the reader's calendar ──
  const dayCounts = {}
  for (const t of dueTodos) {
    const d = localDateOf(t.dueDate, zone)
    dayCounts[d] = (dayCounts[d] ?? 0) + 1
  }
  for (const e of upcoming) {
    const d = localDateOf(e.start, zone)
    dayCounts[d] = (dayCounts[d] ?? 0) + 1
  }
  const busiestDate = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
  // Calendar arithmetic on the date itself, not a Date in the server's zone.
  const busiestDay  = busiestDate
    ? DAYS[new Date(`${busiestDate}T00:00:00Z`).getUTCDay()]
    : null

  // "3 tasks, 2 events — busiest day: Monday". The dash clause used to be a third
  // entry in the comma-joined list, which read as "2 events, — busiest day".
  const counts = [
    `${dueTodos.length} task${dueTodos.length !== 1 ? 's' : ''}`,
    `${upcoming.length} event${upcoming.length !== 1 ? 's' : ''}`,
  ].join(', ')
  return busiestDay ? `${counts} — busiest day: ${busiestDay}` : counts
}

export async function GET(request) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const denied = await requireCron(request, 'digest')
  if (denied) return denied

  // ── VAPID setup (use a generic subject since this isn't per-user) ──────────
  const unconfigured = requireVapid()
  if (unconfigured) return unconfigured

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? 'mailto:noreply@localhost',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  )

  // One instant for the whole run, so every device's window is cut from the same now.
  const now = Date.now()

  // ── Fetch every device of every opted-in account ────────────────────────────
  await ensurePushSchema()

  const subs = await sql`
    SELECT s.id, s.user_id, s.endpoint, s.p256dh, s.auth, s.tz_offset, s.time_zone
    FROM push_subscriptions s
    JOIN users u ON u.id = s.user_id
    WHERE u.digest_enabled = true
  `

  // Grouped by user: the todos/events rows behind a digest are the same for every
  // device a reader owns, so they are read once per user rather than once per
  // subscription. The body is then built per device, because the window is cut on
  // that device's own calendar.
  const subsByUser = new Map()
  for (const sub of subs) {
    const list = subsByUser.get(sub.user_id)
    if (list) list.push(sub)
    else subsByUser.set(sub.user_id, [sub])
  }

  let sent = 0, failed = 0, skipped = 0

  /* Each account fails on its own. Before the grouping every subscription was its own
     Promise.allSettled entry, so one bad row or one transient database error was
     counted and the run carried on; a bare Promise.all would let one account reject
     the whole run, and nobody would get a digest that week. A failed read is counted
     against every one of that account's devices, since none of them was tried. */
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

    // And each device on its own: its window depends on its zone, and a malformed
    // row that trips one body must not cost the account's other devices theirs. The
    // sends themselves never throw — sendToSubscription reports instead.
    await Promise.all(userSubs.map(async sub => {
      try {
        const body = digestBody({ todos, events, zone: resolveUserZone(sub), now })
        if (body === null) { skipped++; return }

        const payload = JSON.stringify({ title: 'Your week ahead', body, tag: 'lv-digest' })
        const result  = await sendToSubscription(sub, payload)
        if (result.ok) sent++
        else failed++
      } catch {
        failed++
      }
    }))
  }))

  return Response.json({ ok: true, sent, failed, skipped })
}
