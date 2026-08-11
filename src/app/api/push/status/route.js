/**
 * GET /api/push/status — why aren't notifications arriving?
 *
 * Push has five independent things that must all be true, and when one is
 * missing the failure is completely silent: the browser reports "enabled", the
 * server reports "sent", and nothing appears. This endpoint reports the state of
 * each link in the chain so the answer is a glance rather than a guess.
 *
 * Deliberately reports only booleans and counts — never key material, never the
 * cron secret. Session-authed, and scoped to the caller's own rows.
 */
import { getSession } from '@/lib/session'
import { ensurePushSchema } from '@/lib/pushSchema'
import sql            from '@/lib/db'

/**
 * How long each job may go between successful pings before something is wrong.
 * Generous multiples of the real cadence, so a slipped tick isn't reported as an
 * outage — only a genuinely stopped clock is.
 */
const STALE_AFTER_MIN = {
  reminders: 15,          // pinged every ~1–5 min from outside Vercel
  daily:     26 * 60,     // 0 11 * * *
  digest:    8 * 24 * 60, // 0 18 * * 0
}

const CADENCE = {
  reminders: 'every 1–5 minutes, from an external pinger',
  daily:     'daily at 11:00 UTC, from Vercel',
  digest:    'Sundays at 18:00 UTC, from Vercel',
}

export async function GET() {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const hasPublicKey  = Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)
  const hasPrivateKey = Boolean(process.env.VAPID_PRIVATE_KEY)
  const hasCronSecret = Boolean(process.env.CRON_SECRET)

  let subscriptions = []
  let recentSends   = []
  let pings         = []
  let digestEnabled = false
  let dbError       = null

  try {
    await ensurePushSchema()

    subscriptions = await sql`
      SELECT endpoint
      FROM push_subscriptions
      WHERE user_id = ${session.userId}
    `
    const userRows = await sql`SELECT digest_enabled FROM users WHERE id = ${session.userId}`
    digestEnabled  = userRows[0]?.digest_enabled === true

    // Cron heartbeats are global rather than per-user — they describe the
    // deployment's schedulers, not this account — but they carry no user data, and
    // "is anything even calling the cron" is the single most useful thing to know
    // when notifications stop.
    pings = await sql`SELECT path, last_success, success_count FROM cron_pings`.catch(() => [])
    // sent_reminders is created lazily by the reminders cron, so its absence is
    // itself a signal: it means the cron has never once run.
    recentSends = await sql`
      SELECT reminder_key, sent_at
      FROM sent_reminders
      WHERE user_id = ${session.userId}
      ORDER BY sent_at DESC
      LIMIT 5
    `.catch(() => [])
  } catch (e) {
    dbError = e.message
  }

  // An endpoint host tells you which push service will deliver it, which is the
  // fastest way to spot "subscribed on desktop, expecting it on the phone".
  const endpoints = subscriptions.map(s => {
    let host = 'unknown'
    try { host = new URL(s.endpoint).host } catch {}
    return { host }
  })

  // ── Cron health ─────────────────────────────────────────────────────────────
  const byPath = new Map(pings.map(p => [p.path, p]))
  const crons  = Object.keys(STALE_AFTER_MIN).map(path => {
    const row    = byPath.get(path)
    const ago    = row ? Math.round((Date.now() - new Date(row.last_success).getTime()) / 60000) : null
    return {
      path,
      cadence:       CADENCE[path],
      lastSuccess:   row?.last_success ?? null,
      minutesAgo:    ago,
      successCount:  row ? Number(row.success_count) : 0,
      stale:         ago === null || ago > STALE_AFTER_MIN[path],
    }
  })

  const problems = []

  for (const c of crons) {
    if (!c.stale) continue
    if (c.lastSuccess === null) {
      problems.push(
        `/api/push/${c.path} has no successful ping on record (expected ${c.cadence}). ` +
        'If this deployment is more than a few minutes old, whatever should be calling it is ' +
        'either switched off or sending the wrong CRON_SECRET — a 401 loop looks exactly like this. ' +
        'Note that Vercel injects CRON_SECRET into its own crons, so rotating it breaks only the ' +
        'externally-driven reminder job.',
      )
    } else {
      const hrs = Math.floor(c.minutesAgo / 60)
      const when = hrs >= 1 ? `${hrs}h ago` : `${c.minutesAgo} min ago`
      problems.push(`/api/push/${c.path} last succeeded ${when} but is expected ${c.cadence}.`)
    }
  }
  if (!hasPublicKey)  problems.push('NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set — the browser cannot subscribe at all.')
  if (!hasPrivateKey) problems.push('VAPID_PRIVATE_KEY is not set — the server cannot sign any push.')
  if (!hasCronSecret) problems.push('CRON_SECRET is not set — the reminder cron will reject every request with 401.')
  if (!dbError && subscriptions.length === 0) {
    problems.push('No push subscriptions recorded for this account. Enable notifications from a tap on the device you want them on — permission prompts are ignored outside a user gesture.')
  }
  if (!dbError && subscriptions.length > 0 && recentSends.length === 0) {
    problems.push('Subscribed, but no reminder has ever been sent. This is what a cron that never runs looks like — check that /api/push/reminders is actually being pinged.')
  }

  return Response.json({
    vapid: { publicKey: hasPublicKey, privateKey: hasPrivateKey },
    cronSecret: hasCronSecret,
    crons,
    digestEnabled,
    subscriptions: { count: subscriptions.length, endpoints },
    recentSends: recentSends.map(r => ({ key: r.reminder_key, sentAt: r.sent_at })),
    dbError,
    problems,
    healthy: problems.length === 0,
  })
}
