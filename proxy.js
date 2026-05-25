/**
 * Next.js 16 Proxy (route-level middleware).
 * Runs on every request before the page/route handler.
 * Redirects unauthenticated users to /login.
 */
import { NextResponse } from 'next/server'
import { decrypt }      from '@/lib/session'

/** Paths that don't require a session. */
const PUBLIC_PREFIXES = [
  '/login',
  '/api/auth',       // send / verify / logout routes
]

export default async function proxy(req) {
  const { pathname } = req.nextUrl

  const isPublic = PUBLIC_PREFIXES.some(
    prefix => pathname === prefix || pathname.startsWith(prefix + '/')
  )
  if (isPublic) return NextResponse.next()

  // Read session JWT from cookie (no DB call — stays fast at the edge)
  const token   = req.cookies.get('lv_session')?.value
  const session = await decrypt(token)

  if (!session?.userId) {
    const loginUrl = new URL('/login', req.nextUrl)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  // Skip Next.js internals and static files
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|.*\\.png$).*)'],
}
