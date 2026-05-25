import { getSession } from '@/lib/session'
import sql            from '@/lib/db'

export async function GET() {
  const session = await getSession()
  if (!session) return Response.json({ user: null }, { status: 401 })

  const rows = await sql`SELECT id, email FROM users WHERE id = ${session.userId}`
  const user = rows[0] ?? null

  return Response.json({ user: user ? { id: user.id, email: user.email } : null })
}
