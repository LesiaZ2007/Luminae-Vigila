/**
 * Sunday week-ahead digest opt-in, per account.
 *
 * GET  /api/push/digest-pref  → { digest_enabled }
 * POST /api/push/digest-pref  → body { digest_enabled: boolean }
 *
 * Requires the user to be signed in (session cookie).
 *
 * This used to key off a specific `endpoint`, which made the preference per-browser:
 * turning the digest on at a desk left every phone opted out, and the UI read its
 * state from localStorage so each device happily reported its own local guess. The
 * GET here exists so the toggle can show what the server actually believes.
 */
import { getSession } from '@/lib/session'
import { ensurePushSchema } from '@/lib/pushSchema'
import sql            from '@/lib/db'

export async function GET() {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  await ensurePushSchema()
  const rows = await sql`SELECT digest_enabled FROM users WHERE id = ${session.userId}`

  return Response.json({ digest_enabled: rows[0]?.digest_enabled === true })
}

export async function POST(request) {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const { digest_enabled } = body ?? {}

  if (typeof digest_enabled !== 'boolean') {
    return Response.json({ error: 'Invalid body — expected { digest_enabled: boolean }' }, { status: 400 })
  }

  await ensurePushSchema()
  const result = await sql`
    UPDATE users
    SET digest_enabled = ${digest_enabled}
    WHERE id = ${session.userId}
  `

  // The session carries a userId, so a miss means the account is gone underneath it.
  if (result.count === 0) {
    return Response.json({ error: 'Account not found' }, { status: 404 })
  }

  return Response.json({ ok: true, digest_enabled })
}
