/**
 * POST /api/push/digest-pref
 * Toggle the digest_enabled flag for a specific push subscription.
 *
 * Body: { endpoint: string, digest_enabled: boolean }
 * Requires the user to be signed in (session cookie).
 */
import { getSession } from '@/lib/session'
import sql            from '@/lib/db'

export async function POST(request) {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const { endpoint, digest_enabled } = body ?? {}

  if (!endpoint || typeof digest_enabled !== 'boolean') {
    return Response.json({ error: 'Invalid body — expected { endpoint, digest_enabled }' }, { status: 400 })
  }

  const result = await sql`
    UPDATE push_subscriptions
    SET digest_enabled = ${digest_enabled}
    WHERE user_id = ${session.userId} AND endpoint = ${endpoint}
  `

  // If no row was updated the subscription doesn't exist for this user
  if (result.count === 0) {
    return Response.json({ error: 'Subscription not found' }, { status: 404 })
  }

  return Response.json({ ok: true, digest_enabled })
}
