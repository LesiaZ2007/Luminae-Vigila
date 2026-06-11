/**
 * Neon serverless PostgreSQL client — lazy initialisation.
 *
 * The client is created on first use, not at module load time.
 * This lets the app build and serve non-auth pages even when
 * DATABASE_URL is not set (e.g. local dev without a DB).
 *
 * Usage:
 *   import sql from '@/lib/db'
 *   const rows = await sql`SELECT * FROM users WHERE id = ${id}`
 */
import { neon } from '@neondatabase/serverless'

let _sql = null

function getClient() {
  if (_sql) return _sql
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not set. Add it to your .env.local or Vercel environment variables. ' +
      'See README for setup instructions.',
    )
  }
  _sql = neon(process.env.DATABASE_URL)
  return _sql
}

/**
 * Tagged-template SQL helper that proxies to the Neon client.
 * Throws a clear error at query time (not at import time) if DATABASE_URL is missing.
 *
 * sql.transaction([query, query, ...]) — runs multiple tagged-template query objects
 * in a single atomic transaction via the Neon HTTP driver.
 */
const sql = (strings, ...values) => getClient()(strings, ...values)

sql.transaction = (queries) => getClient().transaction(queries)

export default sql
