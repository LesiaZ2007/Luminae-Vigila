'use client'

/**
 * Google calendar visibility/color preferences, on both sides of the wire.
 *
 * Components address these by **account id**, because that is what the accounts list
 * and the sync request are keyed by. The server stores them by **email**, because that
 * is the only identifier that survives disconnecting and reconnecting an account —
 * see api/google/prefs/route.js. This module is the translation layer, and the reason
 * hidden calendars stay hidden after a reconnect.
 *
 * `localStorage` remains the read cache so the calendar renders instantly and keeps
 * working offline; the server is the durable copy.
 */

export const LS_KEY = 'lv-google-prefs'

export function readLocalPrefs() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') } catch { return {} }
}

export function writeLocalPrefs(prefs) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(prefs)) } catch {}
}

/** accountId-keyed → email-keyed, dropping anything we cannot attribute to an email. */
export function toEmailKeyed(prefsByAccountId, accounts) {
  const emailOf = new Map((accounts ?? []).map(a => [a.id, a.email]))
  const out = {}
  for (const [accountId, pref] of Object.entries(prefsByAccountId ?? {})) {
    const email = emailOf.get(accountId)
    if (email) out[email] = pref
  }
  return out
}

/** email-keyed → accountId-keyed, for whichever accounts are connected right now. */
export function toAccountKeyed(prefsByEmail, accounts) {
  const out = {}
  for (const acc of accounts ?? []) {
    const pref = prefsByEmail?.[acc.email]
    if (pref) out[acc.id] = pref
  }
  return out
}

/**
 * Merge server preferences over whatever this browser had.
 *
 * Server wins per account, because it is the copy that survived the reconnect and the
 * copy other devices agreed on. A local-only entry is kept rather than dropped: it is
 * either a genuinely new choice made offline, or the pre-sync history of someone who
 * has been using this feature since before it synced.
 */
export function mergePrefs(localByAccountId, serverByEmail, accounts) {
  const fromServer = toAccountKeyed(serverByEmail, accounts)
  return { ...(localByAccountId ?? {}), ...fromServer }
}

/**
 * Load preferences for the connected accounts: cache first, then server.
 *
 * Also performs the one-way migration for anyone whose choices only ever existed in
 * this browser — a local entry with no server counterpart is uploaded, so the first
 * load after this ships is what carries years of hidden-calendar choices to the
 * account rather than losing them.
 *
 * @returns {Promise<object>} accountId-keyed preferences.
 */
export async function hydrateGooglePrefs(accounts, { fetchImpl = fetch } = {}) {
  const local = readLocalPrefs()
  if (!accounts?.length) return local

  let serverByEmail = {}
  try {
    const res = await fetchImpl('/api/google/prefs')
    if (res.ok) serverByEmail = (await res.json())?.prefs ?? {}
  } catch {
    return local // offline or signed out — the cache is still correct
  }

  const merged = mergePrefs(local, serverByEmail, accounts)
  writeLocalPrefs(merged)

  // Upload anything the server has not seen. Comparing by email avoids re-uploading
  // on every load once the two agree.
  const localByEmail = toEmailKeyed(local, accounts)
  const unseen = Object.entries(localByEmail).filter(([email]) => !serverByEmail[email])
  if (unseen.length) {
    persistGooglePrefs(merged, accounts, { fetchImpl }).catch(() => {})
  }

  return merged
}

/** Write to the cache immediately and the server best-effort. */
export async function persistGooglePrefs(prefsByAccountId, accounts, { fetchImpl = fetch } = {}) {
  writeLocalPrefs(prefsByAccountId)

  const prefs = toEmailKeyed(prefsByAccountId, accounts)
  // Nothing attributable to an email yet (accounts still loading) — the cache holds it
  // and the next change uploads. Sending {} would be indistinguishable from "clear".
  if (Object.keys(prefs).length === 0) return

  try {
    await fetchImpl('/api/google/prefs', {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ prefs }),
    })
  } catch {
    // Offline. The cache is authoritative locally and the next change retries.
  }
}
