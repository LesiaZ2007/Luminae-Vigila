/**
 * Server-side token storage for Google OAuth accounts.
 * Uses Next.js httpOnly cookies for persistence across serverless invocations.
 * Falls back to an in-memory Map when cookie context is unavailable
 * (e.g., token-refresh events emitted asynchronously by googleapis).
 */
import { cookies } from 'next/headers'

const COOKIE = 'lv_gc'
const OPTS = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge:   60 * 60 * 24 * 30, // 30 days
  path:     '/',
}

/** In-memory fallback — keeps tokens alive within the same Lambda instance */
const mem = new Map()

async function load() {
  try {
    const jar = await cookies()
    const raw = jar.get(COOKIE)?.value
    if (raw) {
      const list = JSON.parse(raw)
      for (const a of list) mem.set(a.id, a)
      return list
    }
  } catch { /* no request context available */ }
  return [...mem.values()]
}

async function save(list) {
  for (const a of list) mem.set(a.id, a)
  try {
    const jar = await cookies()
    jar.set(COOKIE, JSON.stringify(list), OPTS)
  } catch { /* no request context — in-memory is already updated */ }
}

export async function getAccounts() {
  return load()
}

export async function getAccount(id) {
  const list = await load()
  return list.find(a => a.id === id) ?? null
}

export async function upsertAccount(account) {
  mem.set(account.id, account)       // immediate in-memory update
  const list = await load()
  const idx  = list.findIndex(a => a.id === account.id)
  if (idx >= 0) list[idx] = account
  else          list.push(account)
  await save(list)
}

export async function removeAccount(id) {
  mem.delete(id)
  const list = await load()
  await save(list.filter(a => a.id !== id))
}
