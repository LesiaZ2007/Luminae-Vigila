/**
 * Server-side token storage for Google OAuth accounts.
 * Tokens are stored in Neon PostgreSQL, scoped to a user ID.
 * Each user can have multiple connected Google accounts.
 */
import sql from './db'

/**
 * Return all Google accounts for the given user.
 * @param {string} userId
 * @returns {Promise<Array<{id,email,accessToken,refreshToken,expiresAt}>>}
 */
export async function getAccounts(userId) {
  const rows = await sql`
    SELECT id, google_email AS email, access_token, refresh_token, expires_at
    FROM   google_accounts
    WHERE  user_id = ${userId}
    ORDER BY created_at
  `
  return rows.map(r => ({
    id:           r.id,
    userId,
    email:        r.email,
    accessToken:  r.access_token,
    refreshToken: r.refresh_token,
    expiresAt:    r.expires_at ? Number(r.expires_at) : null,
  }))
}

/**
 * Return a single Google account by its UUID, scoped to userId.
 * Returns null if not found or if it belongs to a different user.
 * @param {string} id
 * @param {string} userId
 */
export async function getAccount(id, userId) {
  const rows = await sql`
    SELECT id, google_email AS email, access_token, refresh_token, expires_at
    FROM   google_accounts
    WHERE  id = ${id} AND user_id = ${userId}
  `
  if (!rows.length) return null
  const r = rows[0]
  return {
    id:           r.id,
    userId,
    email:        r.email,
    accessToken:  r.access_token,
    refreshToken: r.refresh_token,
    expiresAt:    r.expires_at ? Number(r.expires_at) : null,
  }
}

/**
 * Insert or update a Google account for the given user.
 * Uses google_email as the unique key within a user's accounts.
 * @param {string} userId
 * @param {{ id?: string, email: string, accessToken: string, refreshToken?: string, expiresAt?: number }} account
 * @returns {Promise<string>} the account UUID
 */
export async function upsertAccount(userId, account) {
  const { email, accessToken, refreshToken, expiresAt } = account

  // If the caller provided an ID, use it on INSERT (preserves stable IDs for localStorage prefs).
  // On conflict (same user + google email) just update the tokens.
  const rows = await sql`
    INSERT INTO google_accounts (id, user_id, google_email, access_token, refresh_token, expires_at, updated_at)
    VALUES (
      COALESCE(
        (SELECT id FROM google_accounts WHERE user_id = ${userId} AND google_email = ${email}),
        gen_random_uuid()
      ),
      ${userId}, ${email}, ${accessToken},
      ${refreshToken ?? null},
      ${expiresAt ?? null},
      NOW()
    )
    ON CONFLICT (user_id, google_email) DO UPDATE
      SET access_token  = EXCLUDED.access_token,
          refresh_token = COALESCE(EXCLUDED.refresh_token, google_accounts.refresh_token),
          expires_at    = EXCLUDED.expires_at,
          updated_at    = NOW()
    RETURNING id
  `
  return rows[0].id
}

/**
 * Remove a Google account by UUID, scoped to the user.
 * @param {string} id
 * @param {string} userId
 */
export async function removeAccount(id, userId) {
  await sql`
    DELETE FROM google_accounts WHERE id = ${id} AND user_id = ${userId}
  `
}
