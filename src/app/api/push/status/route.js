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
import sql            from '@/lib/db'

export async function GET() {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const hasPublicKey  = Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)
  const hasPrivateKey = Boolean(process.env.VAPID_PRIVATE_KEY)
  const hasCronSecret = Boolean(process.env.CRON_SECRET)

  let subscriptions = []
  let recentSends   = []
  let dbError       = null

  try {
    subscriptions = await sql`
      SELECT endpoint, digest_enabled
      FROM push_subscriptions
      WHERE user_id = ${session.userId}
    `
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
    return { host, digestEnabled: s.digest_enabled === true }
  })

  const problems = []
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
    subscriptions: { count: subscriptions.length, endpoints },
    recentSends: recentSends.map(r => ({ key: r.reminder_key, sentAt: r.sent_at })),
    dbError,
    problems,
    healthy: problems.length === 0,
  })
}
