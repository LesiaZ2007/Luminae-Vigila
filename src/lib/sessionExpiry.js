/**
 * Telling "your sign-in ran out" apart from "you never signed in".
 *
 * A session is a 30-day cookie (see lib/session). When it lapses, the server can only
 * say "nobody is signed in" — the cookie is simply gone — which is exactly what it says
 * to someone who has never signed in at all. The client has to remember the
 * difference, because the two need opposite responses: a never-signed-in device should
 * be left alone, and a device that *was* syncing must be told loudly that it has
 * stopped.
 *
 * Telling it loudly is the whole point. An expired session used to fail silently in
 * both directions: the pull came back empty but successful, so the merge kept local
 * data and "last synced" kept ticking; the push came back 401 and nothing looked at the
 * status. A laptop went a week holding every edit to itself while looking perfectly
 * healthy, and the only symptom was the phone never seeing any of them.
 *
 * So a device records that it is signed in, and forgets it only on an explicit sign
 * out. Finding no session while the record is still there means it expired.
 */

export const SIGNED_IN_KEY = 'lv-signed-in'

function storageOf(storage) {
  if (storage) return storage
  try { return typeof window !== 'undefined' ? window.localStorage : null } catch { return null }
}

/** Note that this device holds a session. Called whenever /api/auth/me confirms one. */
export function rememberSignedIn(storage) {
  try { storageOf(storage)?.setItem(SIGNED_IN_KEY, '1') } catch {}
}

/** An explicit sign out: the user chose this, so there is nothing to warn about. */
export function forgetSignedIn(storage) {
  try { storageOf(storage)?.removeItem(SIGNED_IN_KEY) } catch {}
}

/** Was this device signed in the last time it checked? */
export function wasSignedIn(storage) {
  try { return storageOf(storage)?.getItem(SIGNED_IN_KEY) === '1' } catch { return false }
}

/**
 * Does this response mean the session is gone?
 *
 * Only 401. A 500, a 502 from a cold database, or a network failure says nothing about
 * the session, and prompting a sign-in for those would send the user off to fix the
 * one thing that isn't broken.
 */
export function isSessionExpired(res) {
  return res?.status === 401
}
