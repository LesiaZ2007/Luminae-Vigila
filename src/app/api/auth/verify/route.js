import { redirect }         from 'next/navigation'
import { verifyMagicToken } from '@/lib/auth'
import { createSession }    from '@/lib/session'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')
  const next  = searchParams.get('next') ?? '/'

  if (!token) {
    return Response.redirect(new URL('/login?error=missing_token', request.url))
  }

  const result = await verifyMagicToken(token)

  if (!result) {
    // Token is invalid, expired, or already used
    return Response.redirect(new URL('/login?error=invalid_token', request.url))
  }

  await createSession(result.userId)

  // Redirect to the page the user was trying to reach (or home)
  const safeNext = next.startsWith('/') ? next : '/'
  return Response.redirect(new URL(safeNext, request.url))
}
