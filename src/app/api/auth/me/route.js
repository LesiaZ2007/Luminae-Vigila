/**
 * GET /api/auth/me — who is signed in.
 *
 * Called once by every page load, before the app will sync anything, so this is
 * the single most frequently hit database-backed route in the app. It was also
 * the most pointless one: a `SELECT id, email FROM users WHERE id = …` to read
 * back the two values the session cookie was issued from.
 *
 * Neon bills compute time and any query resets its idle-suspend timer, so a query
 * per page load means every visit wakes the database whether or not the visit does
 * anything with it. The email is now a signed claim on the session cookie (see
 * lib/session), so the common path answers with no database access at all.
 *
 * The fallback is not decoration: cookies issued before the claim existed are
 * valid for thirty days, and their holders would otherwise see the account row
 * vanish from the UI. It costs one query, once, and the next sign-in re-issues a
 * cookie that never needs it again.
 */
import { getSession } from '@/lib/session'
import sql            from '@/lib/db'

export async function GET() {
  const session = await getSession()
  if (!session) return Response.json({ user: null }, { status: 401 })

  if (session.email) {
    return Response.json({ user: { id: session.userId, email: session.email } })
  }

  const rows = await sql`SELECT id, email FROM users WHERE id = ${session.userId}`
  const user = rows[0] ?? null

  return Response.json({ user: user ? { id: user.id, email: user.email } : null })
}
