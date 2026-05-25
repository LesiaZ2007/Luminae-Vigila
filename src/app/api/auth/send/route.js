import { sendMagicLink } from '@/lib/auth'

export async function POST(request) {
  let body
  try { body = await request.json() } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const email = (body?.email ?? '').trim().toLowerCase()
  if (!email || !email.includes('@')) {
    return Response.json({ error: 'A valid email address is required.' }, { status: 400 })
  }

  try {
    await sendMagicLink(email)
    return Response.json({ ok: true })
  } catch (err) {
    console.error('Magic link send error:', err)
    return Response.json(
      { error: 'Failed to send email. Please try again in a moment.' },
      { status: 500 },
    )
  }
}
