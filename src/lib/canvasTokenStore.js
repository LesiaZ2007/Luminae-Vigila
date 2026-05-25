/**
 * Server-side token storage for Canvas LMS personal access token.
 * Uses Next.js httpOnly cookies for persistence across serverless invocations.
 * Falls back to an in-memory variable when cookie context is unavailable.
 *
 * Unlike Google (multi-account), Canvas is a single credential:
 *   { token: string, baseUrl: string }
 */
import { cookies } from 'next/headers'

const COOKIE = 'lv_cv'
const OPTS = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge:   60 * 60 * 24 * 365, // 1 year
  path:     '/',
}

/** In-memory fallback — keeps credential alive within the same Lambda instance */
let memCred = null

async function load() {
  try {
    const jar = await cookies()
    const raw = jar.get(COOKIE)?.value
    if (raw) {
      const cred = JSON.parse(raw)
      memCred = cred
      return cred
    }
  } catch { /* no request context available */ }
  return memCred
}

async function save(cred) {
  memCred = cred
  try {
    const jar = await cookies()
    if (cred) {
      jar.set(COOKIE, JSON.stringify(cred), OPTS)
    } else {
      jar.delete(COOKIE)
    }
  } catch { /* no request context — in-memory is already updated */ }
}

export async function getCredential() {
  return load()
}

export async function setCredential({ token, baseUrl }) {
  const cred = { token, baseUrl }
  await save(cred)
  return cred
}

export async function clearCredential() {
  await save(null)
}
