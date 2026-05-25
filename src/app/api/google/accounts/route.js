import { getAccounts, removeAccount } from '@/lib/googleTokenStore'

export async function GET() {
  const accounts = await getAccounts()
  // Return only safe, non-secret fields to the client
  return Response.json({
    accounts: accounts.map(({ id, email }) => ({ id, email })),
  })
}

export async function DELETE(request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return Response.json({ error: 'Missing id' }, { status: 400 })
  await removeAccount(id)
  return Response.json({ ok: true })
}
