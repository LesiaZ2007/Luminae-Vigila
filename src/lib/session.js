/**
 * Stateless JWT session management.
 * Sessions are stored in a signed, httpOnly cookie.
 * The cookie contains only { userId, expiresAt } — no sensitive data.
 */
import 'server-only'
import { SignJWT, jwtVerify } from 'jose'
import { cookies }           from 'next/headers'

const COOKIE  = 'lv_session'
const MAX_AGE = 60 * 60 * 24 * 30 // 30 days

function getKey() {
  if (!process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET environment variable is not set.')
  }
  return new TextEncoder().encode(process.env.SESSION_SECRET)
}

/** Sign a payload into a compact JWT string. */
export async function encrypt(payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(getKey())
}

/** Verify and decode a JWT string.  Returns null on any failure. */
export async function decrypt(token) {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, getKey(), { algorithms: ['HS256'] })
    return payload
  } catch {
    return null
  }
}

/** Write a new session cookie for the given userId. */
export async function createSession(userId) {
  const expiresAt = new Date(Date.now() + MAX_AGE * 1000)
  const token     = await encrypt({ userId, expiresAt: expiresAt.toISOString() })
  const jar       = await cookies()
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires:  expiresAt,
    path:     '/',
  })
}

/** Read and verify the current session.  Returns { userId } or null. */
export async function getSession() {
  try {
    const jar     = await cookies()
    const token   = jar.get(COOKIE)?.value
    const payload = await decrypt(token)
    if (!payload?.userId) return null
    return { userId: payload.userId }
  } catch {
    return null
  }
}

/** Delete the session cookie (logout). */
export async function deleteSession() {
  const jar = await cookies()
  jar.delete(COOKIE)
}
