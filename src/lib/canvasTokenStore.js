/**
 * Server-side token storage for Canvas LMS personal access token.
 * One credential per user, stored in Neon PostgreSQL.
 */
import sql from './db'

/**
 * Return the Canvas credential for a user, or null if not connected.
 * @param {string} userId
 * @returns {Promise<{token:string,baseUrl:string}|null>}
 */
export async function getCredential(userId) {
  const rows = await sql`
    SELECT token, base_url FROM canvas_credentials WHERE user_id = ${userId}
  `
  if (!rows.length) return null
  return { token: rows[0].token, baseUrl: rows[0].base_url }
}

/**
 * Store (or replace) a Canvas credential for a user.
 * @param {string} userId
 * @param {{ token: string, baseUrl: string }} credential
 */
export async function setCredential(userId, { token, baseUrl }) {
  await sql`
    INSERT INTO canvas_credentials (user_id, token, base_url, updated_at)
    VALUES (${userId}, ${token}, ${baseUrl}, NOW())
    ON CONFLICT (user_id) DO UPDATE
      SET token      = EXCLUDED.token,
          base_url   = EXCLUDED.base_url,
          updated_at = NOW()
  `
  return { token, baseUrl }
}

/**
 * Delete the Canvas credential for a user.
 * @param {string} userId
 */
export async function clearCredential(userId) {
  await sql`DELETE FROM canvas_credentials WHERE user_id = ${userId}`
}
