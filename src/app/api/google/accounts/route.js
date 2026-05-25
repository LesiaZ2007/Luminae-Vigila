import { getAccounts, removeAccount } from '@/lib/googleTokenStore'
import { getSession }                  from '@/lib/session'

export async function GET() {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const accounts = await getAccounts(session.userId)
  // Return only safe, non-secret fields to the client
  return Response.json({
    accounts: accounts.map(({ id, email }) => ({ id, email })),
  })
}

export async function DELETE(request) {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return Response.json({ error: 'Missing id' }, { status: 400 })

  await removeAccount(id, session.userId)
  return Response.json({ ok: true })
}
