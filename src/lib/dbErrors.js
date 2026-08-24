/**
 * Why did a database-backed request fail?
 *
 * Sign-in is the one flow that cannot degrade. The rest of the app is local-first and
 * works with no database at all, but issuing a session means writing a user row — so a
 * database outage surfaces at the login page first, and often *only* there. Anyone
 * already holding a 30-day session cookie sees nothing wrong, which is why this tends
 * to present as "sign-in is broken on my phone" rather than "the database is down".
 *
 * The quota case is separated out because it is the one with a completely different
 * fix. Neon answers with HTTP 402 once a project has spent its plan allowance, and
 * that used to fall through to the raw error message: the login page then reported an
 * unrecognised failure, which is true but points at the wrong thing entirely. The
 * database is not misconfigured and not unreachable — it is switched off until the
 * plan or the billing period changes.
 */

/** Neon returns this once a project has spent its compute allowance. */
export const QUOTA_STATUS = 402

const QUOTA_PATTERN  = /\b402\b|payment required|quota|exceeded|suspended/i
const MISSING_URL    = 'DATABASE_URL'

/**
 * Classify a thrown error into a key the login page can explain.
 *
 * @returns {'db_quota'|'db_unavailable'|string} One of the known keys, or the original
 *   message URL-encoded so it can still be displayed and reported verbatim.
 */
export function classifyDbError(err) {
  const message = String(err?.message ?? '')
  const status  = err?.status ?? err?.statusCode

  if (status === QUOTA_STATUS || QUOTA_PATTERN.test(message)) return 'db_quota'

  if (message.includes(MISSING_URL) || message.includes('database') || err?.code === 'ECONNREFUSED') {
    return 'db_unavailable'
  }

  return encodeURIComponent(message)
}
