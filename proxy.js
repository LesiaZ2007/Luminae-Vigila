/**
 * Next.js 16 Proxy (route-level middleware).
 *
 * Auth is OPTIONAL — the app works fully without a session (local-only mode).
 * This proxy only blocks direct access to routes that are meaningless
 * without an account (adding/removing connected service tokens).
 * The main app page ( / ) is always public.
 *
 * API routes return 401 naturally; this proxy just adds a redirect
 * for the handful of browser-facing paths that have no logged-out UI.
 */
import { NextResponse } from 'next/server'
import { decrypt }      from '@/lib/session'

/**
 * Paths that require a session when accessed directly in the browser.
 * API routes handle their own 401s — this only covers page routes.
 */
const PROTECTED_PAGES = [
  // Add any future account/settings pages here if they need auth.
  // e.g. '/account', '/sync-settings'
]

/** Always-public paths — never redirect these. */
const PUBLIC_PREFIXES = [
  '/',
  '/login',
  '/api/',
]

export default async function proxy(req) {
  const { pathname } = req.nextUrl

  // Everything public → pass through immediately (no DB/cookie reads needed)
  const isPublic = PUBLIC_PREFIXES.some(
    p => pathname === p || pathname.startsWith(p)
  )
  if (isPublic) return NextResponse.next()

  // Protected page → redirect to login if no session
  const isProtected = PROTECTED_PAGES.some(
    p => pathname === p || pathname.startsWith(p + '/')
  )
  if (isProtected) {
    const token   = req.cookies.get('lv_session')?.value
    const session = await decrypt(token)
    if (!session?.userId) {
      const loginUrl = new URL('/login', req.nextUrl)
      loginUrl.searchParams.set('next', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|.*\\.png$).*)'],
}
