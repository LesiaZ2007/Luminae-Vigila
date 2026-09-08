/**
 * Stateless JWT session management.
 * Sessions are stored in a signed, httpOnly cookie.
 * The cookie contains only { userId, email, expiresAt } — no sensitive data.
 *
 * `email` rides along so /api/auth/me, which every page load calls before it can
 * do anything else, can answer from the signed cookie instead of waking the
 * database to re-read a column that cannot change. Neon bills compute time, and a
 * query on every page load is a query that keeps the compute endpoint awake for
 * every visit. It is the user's own address, already sitting in an httpOnly cookie
 * the browser cannot read, so nothing is exposed by carrying it.
 *
 * Cookies issued before this existed have no `email` claim, so consumers must
 * tolerate its absence rather than assume it — see /api/auth/me.
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

/**
 * Write a new session cookie for the given userId.
 *
 * @param {string} userId
 * @param {string} [email] Stored as a claim so /api/auth/me needs no query.
 */
export async function createSession(userId, email) {
  const expiresAt = new Date(Date.now() + MAX_AGE * 1000)
  const token     = await encrypt({ userId, email, expiresAt: expiresAt.toISOString() })
  const jar       = await cookies()
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires:  expiresAt,
    path:     '/',
  })
}

/**
 * Read and verify the current session.
 * Returns `{ userId, email }` or null. `email` is undefined on cookies issued
 * before it became a claim.
 */
export async function getSession() {
  try {
    const jar     = await cookies()
    const token   = jar.get(COOKIE)?.value
    const payload = await decrypt(token)
    if (!payload?.userId) return null
    return { userId: payload.userId, email: payload.email }
  } catch {
    return null
  }
}

/** Delete the session cookie (logout). */
export async function deleteSession() {
  const jar = await cookies()
  jar.delete(COOKIE)
}
